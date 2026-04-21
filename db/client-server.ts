import 'server-only'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { sql } from 'drizzle-orm'
import { serverEnv } from '@/lib/env-server'
import * as schema from '@/db/schema'
import { createServerClient } from '@/lib/supabase/server'

// dbSystem lives in db/client-system.ts so tsx scripts can use it
// without pulling in the Next-only `server-only` import at the top of this file.
export { dbSystem } from './client-system'

// Module-level client — reused across warm Vercel invocations so each request
// skips the TCP handshake. prepare:false is required for Supabase Transaction-mode pooler.
const _client = postgres(serverEnv.DATABASE_URL, {
  prepare: false,
  max: 3,
  idle_timeout: 30,
})
const _db = drizzle(_client, { schema })
type Tx = Parameters<Parameters<typeof _db.transaction>[0]>[0]

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

  return {
    query: async <T>(fn: (tx: Tx) => Promise<T>): Promise<T> => {
      return await _db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('request.jwt.claims', ${JSON.stringify({
            sub: session.user.id,
            role: 'authenticated',
            email: session.user.email,
          })}, true)`,
        )
        return await fn(tx)
      })
    },
  }
}

