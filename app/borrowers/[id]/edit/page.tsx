import { notFound } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { getCurrentLibrary } from '@/lib/library/current'
import { dbAsUser } from '@/db/client-server'
import { borrowers } from '@/db/schema/catalog'
import { BorrowerForm } from '@/components/borrower/borrower-form'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export default async function EditBorrowerPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])

  const borrower = await db.query((tx) =>
    tx
      .select()
      .from(borrowers)
      .where(and(eq(borrowers.id, id), eq(borrowers.libraryId, current.id)))
      .limit(1),
  ).then((r) => r[0])

  if (!borrower) notFound()

  return (
    <main className="mx-auto max-w-xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit borrower</CardTitle>
        </CardHeader>
        <CardContent>
          <BorrowerForm mode="edit" initial={borrower} libraryId={current.id} />
        </CardContent>
      </Card>
    </main>
  )
}
