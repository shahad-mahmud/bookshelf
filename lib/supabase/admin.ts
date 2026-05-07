import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { serverEnv } from '@/lib/env-server'

/**
 * Service-role Supabase client. Bypasses RLS. Intended for scripts/
 * (backfill, GC, smoke tests) — NEVER import from app/, lib/actions/, or
 * components/. No `server-only` import so tsx scripts can resolve it.
 *
 * Narrow exception: lib/actions/book.ts uses this for cover Storage ops
 * (upload + remove). Supabase Storage's JWT validator rejects the
 * project's ES256 user tokens and treats them as anonymous, so any
 * `TO authenticated` policy on storage.objects denies the request even
 * when the caller is a library member. The action validates library
 * access via dbAsUser (RLS-checked) before touching Storage and the
 * object path is constructed in code, so service-role here is a
 * transport-only bypass with no caller-influenced privilege.
 * See: https://github.com/supabase/supabase/issues/42235,
 *      https://github.com/orgs/supabase/discussions/37885.
 */
export function createServiceRoleClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
