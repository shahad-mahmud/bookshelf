import { getCurrentLibrary } from '@/lib/library/current'
import { dbAsUser } from '@/db/client-server'
import { currencies } from '@/db/schema/catalog'
import { BookForm } from '@/components/book/book-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default async function NewBookPage() {
  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])
  const allCurrencies = await db.query((tx) => tx.select().from(currencies).orderBy(currencies.code))

  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a book</CardTitle>
        </CardHeader>
        <CardContent>
          <BookForm mode="create" libraryId={current.id} currencies={allCurrencies} />
        </CardContent>
      </Card>
    </main>
  )
}
