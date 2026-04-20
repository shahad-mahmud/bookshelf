import { getCurrentLibrary } from '@/lib/library/current'
import { BorrowerForm } from '@/components/borrower/borrower-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default async function NewBorrowerPage() {
  const current = await getCurrentLibrary()

  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Add a borrower</CardTitle>
        </CardHeader>
        <CardContent>
          <BorrowerForm mode="create" libraryId={current.id} />
        </CardContent>
      </Card>
    </main>
  )
}
