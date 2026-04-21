import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq, isNull, asc, and, count } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { getCurrentLibrary } from '@/lib/library/current'
import { profiles } from '@/db/schema/auth'
import { loans, books, borrowers } from '@/db/schema/catalog'
import { AppHeader } from '@/components/app-header'
import { ActiveLoansSection } from '@/components/loan/active-loans-section'
import type { ActiveLoanRow } from '@/components/loan/active-loans-section'

export default async function HomePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])
  const [profile, activeLoans, ownedBookCount] = await Promise.all([
    db.query((tx) =>
      tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1),
    ).then((r) => r[0]),
    db.query((tx) =>
      tx
        .select({
          loanId: loans.id,
          bookId: loans.bookId,
          libraryId: loans.libraryId,
          bookTitle: books.title,
          borrowerName: borrowers.name,
          lentDate: loans.lentDate,
          expectedReturnDate: loans.expectedReturnDate,
        })
        .from(loans)
        .innerJoin(books, and(eq(loans.bookId, books.id), eq(loans.libraryId, books.libraryId)))
        .innerJoin(borrowers, and(eq(loans.borrowerId, borrowers.id), eq(loans.libraryId, borrowers.libraryId)))
        .where(and(eq(loans.libraryId, current.id), isNull(loans.returnedDate)))
        .orderBy(asc(loans.lentDate)),
    ) as Promise<ActiveLoanRow[]>,
    db.query((tx) =>
      tx
        .select({ n: count() })
        .from(books)
        .where(and(eq(books.libraryId, current.id), eq(books.acquisition, 'owned')))
        .limit(1),
    ).then((r) => r[0]?.n ?? 0),
  ])

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

        {ownedBookCount > 0 ? <ActiveLoansSection loans={activeLoans} /> : null}
      </main>
    </>
  )
}
