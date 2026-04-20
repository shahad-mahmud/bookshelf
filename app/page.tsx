import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { getCurrentLibrary } from '@/lib/library/current'
import { profiles } from '@/db/schema/auth'
import { AppHeader } from '@/components/app-header'

export default async function HomePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])
  const profile = await db.query((tx) =>
    tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1),
  ).then((r) => r[0])

  return (
    <>
      <AppHeader displayName={profile?.displayName ?? null} email={profile?.email ?? null} />
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-xl border bg-card p-6">
          <h1 className="text-2xl font-semibold">
            Hello, {profile?.displayName ?? 'friend'}.
          </h1>
          <p className="mt-1 text-muted-foreground">
            You&apos;re in{' '}
            <span className="font-medium text-foreground">{current.name}</span>{' '}
            as <span className="font-medium">{current.role}</span>.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            href="/books"
            className="group flex flex-col gap-1.5 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <span className="text-lg font-semibold group-hover:text-primary">Books</span>
            <span className="text-sm text-muted-foreground">Browse and manage your book catalog.</span>
          </Link>
          <Link
            href="/borrowers"
            className="group flex flex-col gap-1.5 rounded-xl border bg-card p-5 transition-colors hover:bg-muted/50"
          >
            <span className="text-lg font-semibold group-hover:text-primary">Borrowers</span>
            <span className="text-sm text-muted-foreground">Track people who borrow from your library.</span>
          </Link>
        </div>
      </main>
    </>
  )
}
