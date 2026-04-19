import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url().optional(),
  ADDITIONAL_ALLOWED_ORIGINS: z.string().optional(),
  DEFAULT_CURRENCY: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().length(3).default('BDT'),
  ),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n')
  throw new Error(`Environment variable validation failed:\n${missing}`)
}

export const env = parsed.data
export type Env = typeof env
