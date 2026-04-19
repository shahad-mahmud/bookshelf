import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { serverEnv } from '@/lib/env-server'
import * as schema from '@/db/schema'

/**
 * System-level Drizzle client. Connects as the postgres superuser via
 * DIRECT_URL, bypassing RLS. Never import from app/, lib/, or components/.
 * Intended for db/seed.ts and scripts/.
 *
 * Lives in its own file (no `server-only` import) so tsx can run it directly
 * without the Next.js resolver.
 */
export function dbSystem() {
  const client = postgres(serverEnv.DIRECT_URL, { max: 1 })
  const db = drizzle(client, { schema })
  return {
    db,
    close: () => client.end({ timeout: 5 }),
  }
}
