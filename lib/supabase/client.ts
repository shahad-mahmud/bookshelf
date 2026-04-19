'use client'

import { createBrowserClient } from '@supabase/ssr'
import { env } from '@/lib/env'

let singleton: ReturnType<typeof createBrowserClient> | null = null

export function getBrowserClient() {
  if (singleton) return singleton
  singleton = createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  return singleton
}
