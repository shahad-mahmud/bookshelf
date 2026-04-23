import { redirect } from 'next/navigation'
import { getCurrentLibrary } from '@/lib/library/current'
import { dbAsUser } from '@/db/client-server'
import { createServerClient } from '@/lib/supabase/server'
import { currencies } from '@/db/schema/catalog'
import { getAutocompleteData } from '@/lib/actions/book-autocomplete'
import { BookForm } from '@/components/book/book-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default async function NewBookPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])
  const [allCurrencies, autocomplete] = await Promise.all([
    db.query((tx) => tx.select().from(currencies).orderBy(currencies.code)),
    getAutocompleteData(user.id, current.id),
  ])

  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a book</CardTitle>
        </CardHeader>
        <CardContent>
          <BookForm
            mode="create"
            libraryId={current.id}
            currencies={allCurrencies}
            allAuthors={autocomplete.allAuthors}
            libraryBooks={autocomplete.libraryBooks}
          />
        </CardContent>
      </Card>
    </main>
  )
}
