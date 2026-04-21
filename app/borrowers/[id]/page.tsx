import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { eq, and, desc } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { getCurrentLibrary } from '@/lib/library/current'
import { borrowers, loans, books } from '@/db/schema/catalog'
import { profiles } from '@/db/schema/auth'
import { AppHeader } from '@/components/app-header'
import { DeleteBorrowerDialog } from '@/components/borrower/delete-borrower-dialog'
import { Button } from '@/components/ui/button'
import { LoanHistoryTable } from '@/components/loan/loan-history-table'

export default async function BorrowerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])

  const [profile, borrower] = await Promise.all([
    db.query((tx) => tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)).then((r) => r[0]),
    db.query((tx) =>
      tx
        .select()
        .from(borrowers)
        .where(and(eq(borrowers.id, id), eq(borrowers.libraryId, current.id)))
        .limit(1),
    ).then((r) => r[0]),
  ])

  if (!borrower) notFound()

  const loanHistory = await db.query((tx) =>
    tx
      .select({
        id: loans.id,
        bookId: loans.bookId,
        bookTitle: books.title,
        borrowerName: borrowers.name,
        lentDate: loans.lentDate,
        returnedDate: loans.returnedDate,
      })
      .from(loans)
      .innerJoin(books, and(eq(loans.bookId, books.id), eq(loans.libraryId, books.libraryId)))
      .innerJoin(borrowers, and(eq(loans.borrowerId, borrowers.id), eq(loans.libraryId, borrowers.libraryId)))
      .where(and(eq(loans.borrowerId, id), eq(loans.libraryId, current.id)))
      .orderBy(desc(loans.createdAt)),
  )

  return (
    <>
      <AppHeader displayName={profile?.displayName ?? null} email={profile?.email ?? null} />
      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-6">
          <Link href="/borrowers" className="inline-block py-2 text-sm text-muted-foreground hover:text-foreground">
            ← Borrowers
          </Link>
        </div>

        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{borrower.name}</h1>
            {borrower.contact ? (
              <p className="mt-1 text-muted-foreground">{borrower.contact}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href={`/borrowers/${borrower.id}/edit`} />}>
              Edit
            </Button>
            <DeleteBorrowerDialog borrowerId={borrower.id} libraryId={current.id} />
          </div>
        </div>

        {/* Notes */}
        {borrower.notes ? (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Notes</h2>
            <p className="whitespace-pre-wrap text-sm">{borrower.notes}</p>
          </div>
        ) : null}

        <div className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Loan history</h2>
          <LoanHistoryTable loans={loanHistory} showBook />
        </div>
      </main>
    </>
  )
}
