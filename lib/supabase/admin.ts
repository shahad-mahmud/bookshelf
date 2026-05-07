import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { serverEnv } from '@/lib/env-server'

/**
 * Service-role Supabase client. Bypasses RLS. Intended for scripts/
 * (backfill, GC, smoke tests) — NEVER import from app/, lib/actions/, or
 * components/. No `server-only` import so tsx scripts can resolve it.
 */
export function createServiceRoleClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
