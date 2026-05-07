import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import { dbSystem } from '@/db/client-system'
import { books } from '@/db/schema/catalog'
import { eq, isNotNull, and, not, like } from 'drizzle-orm'
import { fetchAndStoreCover, isCanonicalCoverUrl } from '@/lib/cover-storage'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

/**
 * One-shot backfill: rewrites every books.cover_url that points outside our
 * Supabase Storage bucket. Each external URL is fetched, normalized to webp,
 * uploaded to `book-covers/<libraryId>/<bookId>.webp`, and the row is updated
 * to the canonical public URL on success.
 *
 * Uses the service-role Supabase client (RLS bypass) and the system Drizzle
 * client (DIRECT_URL, superuser). Safe to re-run: rows already pointing at the
 * bucket are filtered out by the LIKE predicate; per-row canonicality is
 * double-checked before re-fetching.
 */
async function main() {
  const { db, close } = dbSystem()
  const supabase = createServiceRoleClient()

  const ourPrefix = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/book-covers/`

  const rows = await db
    .select({ id: books.id, libraryId: books.libraryId, coverUrl: books.coverUrl })
    .from(books)
    .where(and(isNotNull(books.coverUrl), not(like(books.coverUrl, `${ourPrefix}%`))))

  console.log(`[migrate-covers] candidates: ${rows.length}`)

  const summary = { ok: 0, skipped: 0, fail: {} as Record<string, number> }

  try {
    for (const row of rows) {
      try {
        if (!row.coverUrl) {
          summary.skipped++
          continue
        }
        if (isCanonicalCoverUrl({ url: row.coverUrl, libraryId: row.libraryId, bookId: row.id })) {
          summary.skipped++
          continue
        }

        const result = await fetchAndStoreCover({
          externalUrl: row.coverUrl,
          libraryId: row.libraryId,
          bookId: row.id,
          supabase,
        })
        if (!result.ok) {
          summary.fail[result.reason] = (summary.fail[result.reason] ?? 0) + 1
          console.warn(`[migrate-covers] fail id=${row.id} reason=${result.reason}`)
          continue
        }
        await db.update(books).set({ coverUrl: result.storageUrl }).where(eq(books.id, row.id))
        summary.ok++
        console.log(`[migrate-covers] ok id=${row.id}`)
      } catch (err) {
        // A single row's exception (DB constraint, connection blip, etc) must
        // not abort the whole backfill — keep going so partial progress lands.
        summary.fail.threw = (summary.fail.threw ?? 0) + 1
        console.error(`[migrate-covers] threw id=${row.id}`, err instanceof Error ? err.message : err)
      }
    }

    console.log(
      `[migrate-covers] summary: ok=${summary.ok} skipped=${summary.skipped} fail=${JSON.stringify(summary.fail)}`,
    )
    if (Object.keys(summary.fail).length > 0) process.exitCode = 1
  } finally {
    await close()
  }
}

main().catch((err) => {
  console.error('[migrate-covers] fatal', err)
  process.exit(1)
})
