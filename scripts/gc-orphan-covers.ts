import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import { dbSystem } from '@/db/client-system'
import { books } from '@/db/schema/catalog'
import { isNotNull } from 'drizzle-orm'
import { createServiceRoleClient } from '@/lib/supabase/admin'

/**
 * Orphan-cover garbage collector.
 *
 * Walks every object in the `book-covers` bucket, cross-references against
 * `books.cover_url` rows, and deletes anything not referenced by the catalog.
 * Uses the service-role Supabase client (bypasses RLS) and the system Drizzle
 * client (DIRECT_URL, superuser) so it can read every library's books.
 *
 * Top-level entries in the bucket are `<library_id>` folders; each folder
 * contains `<book_id>.webp` objects. Supabase Storage `list()` returns folders
 * with `id === null` and files with a non-null `id`, which we use to walk the
 * tree.
 */
const BUCKET = 'book-covers'
const PAGE_SIZE = 100

async function listLibraryFolders(supabase: ReturnType<typeof createServiceRoleClient>): Promise<string[]> {
  // Top-level entries in the bucket are <library_id> folders.
  const folders: string[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: PAGE_SIZE, offset })
    if (error) throw error
    if (!data || data.length === 0) break
    for (const e of data) if (e.name && e.id === null) folders.push(e.name) // id===null means folder in supabase storage
    if (data.length < PAGE_SIZE) break
    offset += data.length
  }
  return folders
}

async function listFolderObjects(
  supabase: ReturnType<typeof createServiceRoleClient>,
  folder: string,
): Promise<string[]> {
  const objects: string[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: PAGE_SIZE, offset })
    if (error) throw error
    if (!data || data.length === 0) break
    for (const e of data) if (e.id) objects.push(`${folder}/${e.name}`)
    if (data.length < PAGE_SIZE) break
    offset += data.length
  }
  return objects
}

async function main() {
  const { db, close } = dbSystem()
  const supabase = createServiceRoleClient()

  try {
    const referenced = new Set<string>()
    const rows = await db
      .select({ id: books.id, libraryId: books.libraryId })
      .from(books)
      .where(isNotNull(books.coverUrl))
    for (const r of rows) referenced.add(`${r.libraryId}/${r.id}.webp`)

    const folders = await listLibraryFolders(supabase)
    const allObjects: string[] = []
    for (const f of folders) allObjects.push(...(await listFolderObjects(supabase, f)))

    const orphans = allObjects.filter((p) => !referenced.has(p))
    console.log(
      `[gc-covers] referenced=${referenced.size} in_bucket=${allObjects.length} orphans=${orphans.length}`,
    )

    for (let i = 0; i < orphans.length; i += 100) {
      const batch = orphans.slice(i, i + 100)
      const { error } = await supabase.storage.from(BUCKET).remove(batch)
      if (error) {
        console.error(`[gc-covers] remove batch failed:`, error.message)
      } else {
        console.log(`[gc-covers] removed batch of ${batch.length}`)
      }
    }
  } finally {
    await close()
  }
}

main().catch((err) => {
  console.error('[gc-covers] fatal', err)
  process.exit(1)
})
