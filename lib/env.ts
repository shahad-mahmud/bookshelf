import { z } from 'zod'

/**
 * Public (NEXT_PUBLIC_*) env, safe to reach from client bundles.
 * Server-only vars live in `lib/env-server.ts` so they never leak to the browser.
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(`Public environment variable validation failed:\n${missing}`)
}

export const env = parsed.data
export type Env = typeof env
