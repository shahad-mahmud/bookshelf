import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { eq, and } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { getCurrentLibrary } from '@/lib/library/current'
import { books } from '@/db/schema/catalog'
import { profiles } from '@/db/schema/auth'
import { AppHeader } from '@/components/app-header'
import { BookCover } from '@/components/book/book-cover'
import { DeleteBookDialog } from '@/components/book/delete-book-dialog'
import { Button } from '@/components/ui/button'

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])

  const [profile, book] = await Promise.all([
    db.query((tx) => tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)).then((r) => r[0]),
    db.query((tx) =>
      tx
        .select()
        .from(books)
        .where(and(eq(books.id, id), eq(books.libraryId, current.id)))
        .limit(1),
    ).then((r) => r[0]),
  ])

  if (!book) notFound()

  return (
    <>
      <AppHeader displayName={profile?.displayName ?? null} email={profile?.email ?? null} />
      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-6">
          <Link href="/books" className="text-sm text-muted-foreground hover:text-foreground">
            ← Books
          </Link>
        </div>

        <div className="flex gap-6">
          <BookCover src={book.coverUrl ?? null} title={book.title} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold leading-tight">{book.title}</h1>
            {book.author ? (
              <p className="mt-1 text-lg text-muted-foreground">{book.author}</p>
            ) : null}
            <span
              className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                book.acquisition === 'wishlist'
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
              }`}
            >
              {book.acquisition === 'wishlist' ? 'Wishlist' : 'Owned'}
            </span>

            <div className="mt-4 flex gap-2">
              <Button variant="outline" nativeButton={false} render={<Link href={`/books/${book.id}/edit`} />}>
                Edit
              </Button>
              <DeleteBookDialog bookId={book.id} libraryId={current.id} />
            </div>
          </div>
        </div>

        {/* Metadata */}
        <dl className="mt-8 grid gap-3 sm:grid-cols-2">
          {book.isbn ? (
            <>
              <dt className="text-sm font-medium text-muted-foreground">ISBN</dt>
              <dd className="text-sm">{book.isbn}</dd>
            </>
          ) : null}
          {book.purchaseDate ? (
            <>
              <dt className="text-sm font-medium text-muted-foreground">Purchase date</dt>
              <dd className="text-sm">{book.purchaseDate}</dd>
            </>
          ) : null}
          {book.purchasePrice && book.purchaseCurrency ? (
            <>
              <dt className="text-sm font-medium text-muted-foreground">Purchase price</dt>
              <dd className="text-sm">
                {book.purchaseCurrency} {book.purchasePrice}
              </dd>
            </>
          ) : null}
          {book.purchaseSource ? (
            <>
              <dt className="text-sm font-medium text-muted-foreground">Purchase source</dt>
              <dd className="text-sm">{book.purchaseSource}</dd>
            </>
          ) : null}
        </dl>

        {/* Notes */}
        {book.notes ? (
          <div className="mt-6">
            <h2 className="mb-2 text-sm font-medium text-muted-foreground">Notes</h2>
            <p className="whitespace-pre-wrap text-sm">{book.notes}</p>
          </div>
        ) : null}

        {/* Loans — coming later */}
        <div className="mt-8 rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Loan tracking arrives in Spec 1.4.
        </div>
      </main>
    </>
  )
}
