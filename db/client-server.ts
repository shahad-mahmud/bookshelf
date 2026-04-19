import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import { env } from '@/lib/env'
import * as schema from '@/db/schema'

// TODO(Task 16): replace this stub with: import { createServerClient } from '@/lib/supabase/server'
const createServerClient = async () => ({
  auth: {
    getSession: async () =>
      ({ data: { session: null as null | { user: { id: string; email?: string }; access_token: string } }, error: null as Error | null }),
  },
})

/**
 * User-scoped Drizzle client. Sets request.jwt.claims inside a transaction so
 * RLS policies see auth.uid() correctly. Must be called from code that runs
 * after the session has been confirmed (e.g. after proxy.ts allows the request).
 */
export async function dbAsUser() {
  const supabase = await createServerClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) {
    throw new Error('dbAsUser called without a valid session')
  }

  const client = postgres(env.DATABASE_URL, {
    prepare: false, // required for Supabase Transaction-mode pooler
    max: 1,
    idle_timeout: 10,
  })
  const db = drizzle(client, { schema })
  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

  return {
    query: async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      try {
        return await db.transaction(async (tx) => {
          await tx.execute(
            sql`select set_config('request.jwt.claims', ${JSON.stringify({
              sub: session.user.id,
              role: 'authenticated',
              email: session.user.email,
            })}, true)`,
          )
          return await fn(tx)
        })
      } finally {
        await client.end({ timeout: 5 })
      }
    },
  }
}

/**
 * System-level Drizzle client. Connects as the postgres superuser via
 * DIRECT_URL, bypassing RLS. Never import from app/, lib/, or components/.
 * Intended for db/seed.ts and scripts/.
 */
export function dbSystem() {
  const client = postgres(env.DIRECT_URL, { max: 1 })
  const db = drizzle(client, { schema })
  return {
    db,
    close: () => client.end({ timeout: 5 }),
  }
}
