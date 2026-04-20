import { eq, and, sql } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { libraries, libraryMembers } from '@/db/schema/libraries'
import { LibraryForm } from '@/components/library/library-form'
import { DeleteLibraryDialog } from '@/components/library/delete-library-dialog'
import { Separator } from '@/components/ui/separator'

type Props = {
  params: Promise<{ id: string }>
}

export default async function LibrarySettingsPage({ params }: Props) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const db = await dbAsUser()
  const result = await db.query(async (tx) => {
    const rows = await tx
      .select({
        id: libraries.id,
        name: libraries.name,
        role: libraryMembers.role,
      })
      .from(libraries)
      .innerJoin(
        libraryMembers,
        and(
          eq(libraryMembers.libraryId, libraries.id),
          eq(libraryMembers.userId, sql`auth.uid()`),
        ),
      )
      .where(eq(libraries.id, id))
      .limit(1)
    return rows[0] ?? null
  })

  if (!result) notFound()

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-base font-medium">Rename library</h2>
        <LibraryForm mode="rename" id={result.id} initialName={result.name} />
      </section>

      {result.role === 'owner' && (
        <>
          <Separator />
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-medium text-destructive">Danger zone</h2>
              <p className="text-sm text-muted-foreground">
                Permanently delete this library and all its data.
              </p>
            </div>
            <DeleteLibraryDialog id={result.id} name={result.name} />
          </section>
        </>
      )}
    </div>
  )
}
