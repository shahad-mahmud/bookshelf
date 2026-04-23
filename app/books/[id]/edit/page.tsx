import { notFound, redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { getCurrentLibrary } from '@/lib/library/current'
import { dbAsUser } from '@/db/client-server'
import { createServerClient } from '@/lib/supabase/server'
import { books, currencies, bookContributors, authors } from '@/db/schema/catalog'
import { getAutocompleteData } from '@/lib/actions/book-autocomplete'
import { BookForm } from '@/components/book/book-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])

  const [book, allCurrencies, autocomplete, bookContribList] = await Promise.all([
    db.query((tx) =>
      tx
        .select()
        .from(books)
        .where(and(eq(books.id, id), eq(books.libraryId, current.id)))
        .limit(1),
    ).then((r) => r[0]),
    db.query((tx) => tx.select().from(currencies).orderBy(currencies.code)),
    getAutocompleteData(user.id, current.id),
    db.query((tx) =>
      tx
        .select({
          authorId: bookContributors.authorId,
          authorName: authors.name,
          role: bookContributors.role,
        })
        .from(bookContributors)
        .innerJoin(authors, eq(bookContributors.authorId, authors.id))
        .where(eq(bookContributors.bookId, id)),
    ),
  ])

  if (!book) notFound()

  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit book</CardTitle>
        </CardHeader>
        <CardContent>
          <BookForm
            mode="edit"
            initial={book}
            libraryId={current.id}
            currencies={allCurrencies}
            allAuthors={autocomplete.allAuthors}
            libraryBooks={autocomplete.libraryBooks}
            initialContributors={bookContribList}
          />
        </CardContent>
      </Card>
    </main>
  )
}
