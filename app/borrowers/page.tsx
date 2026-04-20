import Link from 'next/link'
import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { getCurrentLibrary } from '@/lib/library/current'
import { borrowers } from '@/db/schema/catalog'
import { profiles } from '@/db/schema/auth'
import { AppHeader } from '@/components/app-header'
import { Button } from '@/components/ui/button'

export default async function BorrowersPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])

  const [profile, allBorrowers] = await Promise.all([
    db.query((tx) => tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)).then((r) => r[0]),
    db.query((tx) =>
      tx
        .select()
        .from(borrowers)
        .where(eq(borrowers.libraryId, current.id))
        .orderBy(desc(borrowers.createdAt)),
    ),
  ])

  return (
    <>
      <AppHeader displayName={profile?.displayName ?? null} email={profile?.email ?? null} />
      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Borrowers</h1>
          <Button render={<Link href="/borrowers/new" />}>Add borrower</Button>
        </div>

        {allBorrowers.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            <p className="text-sm">No borrowers yet in this library.</p>
            <Link
              href="/borrowers/new"
              className="text-sm text-primary underline underline-offset-3 hover:text-primary/80"
            >
              Add your first borrower
            </Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {allBorrowers.map((borrower) => (
              <li key={borrower.id}>
                <Link
                  href={`/borrowers/${borrower.id}`}
                  className="flex items-center justify-between rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="font-medium">{borrower.name}</p>
                    {borrower.contact ? (
                      <p className="text-xs text-muted-foreground">{borrower.contact}</p>
                    ) : null}
                  </div>
                  <span className="text-muted-foreground">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  )
}
