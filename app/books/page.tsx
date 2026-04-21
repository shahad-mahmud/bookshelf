import Link from 'next/link'
import { redirect } from 'next/navigation'
import { desc, eq, and, sql, isNull } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { getCurrentLibrary } from '@/lib/library/current'
import { books, loans } from '@/db/schema/catalog'
import { profiles } from '@/db/schema/auth'
import { AppHeader } from '@/components/app-header'
import { BookCard } from '@/components/book/book-card'
import { BookFilters } from '@/components/book/book-filters'
import { Pagination } from '@/components/ui/pagination'
import { Button } from '@/components/ui/button'

const PAGE_SIZE = 20

export default async function BooksPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db, params] = await Promise.all([
    getCurrentLibrary(),
    dbAsUser(),
    searchParams,
  ])

  const q = params.q?.trim() ?? ''
  const status = params.status ?? 'all'
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1)
  const offset = (page - 1) * PAGE_SIZE

  const [profile, rows, activeLoanRows] = await Promise.all([
    db.query((tx) =>
      tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1),
    ).then((r) => r[0]),
    db.query((tx) => {
      const conditions: ReturnType<typeof eq>[] = [eq(books.libraryId, current.id)]
      if (q) {
        conditions.push(
          sql`(${books.title} || ' ' || coalesce(${books.author}, '')) ILIKE ${'%' + q + '%'}` as ReturnType<typeof eq>,
        )
      }
      if (status === 'owned' || status === 'wishlist') {
        conditions.push(eq(books.acquisition, status))
      }
      return tx
        .select({
          id: books.id,
          libraryId: books.libraryId,
          title: books.title,
          author: books.author,
          isbn: books.isbn,
          coverUrl: books.coverUrl,
          acquisition: books.acquisition,
          purchaseDate: books.purchaseDate,
          purchasePrice: books.purchasePrice,
          purchaseCurrency: books.purchaseCurrency,
          purchaseSource: books.purchaseSource,
          notes: books.notes,
          createdAt: books.createdAt,
          updatedAt: books.updatedAt,
          total: sql<number>`count(*) OVER ()`.mapWith(Number),
        })
        .from(books)
        .where(and(...conditions))
        .orderBy(desc(books.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset)
    }),
    // active loan bookIds
    db.query((tx) =>
      tx
        .select({ bookId: loans.bookId })
        .from(loans)
        .where(and(eq(loans.libraryId, current.id), isNull(loans.returnedDate))),
    ).then((r) => new Set(r.map((l) => l.bookId))),
  ])

  const total = rows[0]?.total ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  function buildHref(p: number) {
    const ps = new URLSearchParams()
    if (q) ps.set('q', q)
    if (status !== 'all') ps.set('status', status)
    if (p > 1) ps.set('page', String(p))
    const qs = ps.toString()
    return qs ? `/books?${qs}` : '/books'
  }

  return (
    <>
      <AppHeader displayName={profile?.displayName ?? null} email={profile?.email ?? null} />
      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Books</h1>
          <Button nativeButton={false} render={<Link href="/books/new" />}>Add book</Button>
        </div>

        <BookFilters q={q} status={status} />

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            {q || status !== 'all' ? (
              <p className="text-sm">No books match your search.</p>
            ) : (
              <>
                <p className="text-sm">No books yet in this library.</p>
                <Link href="/books/new" className="text-sm text-primary underline underline-offset-3 hover:text-primary/80">
                  Add your first book
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {rows.map((book) => (
                <BookCard key={book.id} book={book} isLent={activeLoanRows.has(book.id)} />
              ))}
            </div>
            <Pagination currentPage={page} totalPages={totalPages} buildHref={buildHref} />
          </>
        )}
      </main>
    </>
  )
}
