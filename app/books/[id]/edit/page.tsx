import { notFound } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { getCurrentLibrary } from '@/lib/library/current'
import { dbAsUser } from '@/db/client-server'
import { books, currencies } from '@/db/schema/catalog'
import { BookForm } from '@/components/book/book-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default async function EditBookPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])

  const [book, allCurrencies] = await Promise.all([
    db.query((tx) =>
      tx
        .select()
        .from(books)
        .where(and(eq(books.id, id), eq(books.libraryId, current.id)))
        .limit(1),
    ).then((r) => r[0]),
    db.query((tx) => tx.select().from(currencies).orderBy(currencies.code)),
  ])

  if (!book) notFound()

  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit book</CardTitle>
        </CardHeader>
        <CardContent>
          <BookForm mode="edit" initial={book} libraryId={current.id} currencies={allCurrencies} />
        </CardContent>
      </Card>
    </main>
  )
}
