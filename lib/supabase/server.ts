import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient as createSupabaseServer } from '@supabase/ssr'
import { env } from '@/lib/env'

export async function createServerClient() {
  const cookieStore = await cookies()
  return createSupabaseServer(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Called from a Server Component where setting cookies is not allowed; ignore.
          // Session refresh happens in proxy.ts instead.
        }
      },
    },
  })
}
