import { z } from 'zod'

/**
 * Server-only env. Do NOT import from client components, Client Component
 * trees, or code reachable from them. Eslint rule enforces this for
 * app/, lib/, components/. Scripts in scripts/ and db/ may import freely.
 *
 * We intentionally don't use `import 'server-only'` here because tsx-based
 * scripts (seed, migrations, smoke tests) wouldn't be able to resolve it.
 */
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
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
  throw new Error(`Server environment variable validation failed:\n${missing}`)
}

export const serverEnv = parsed.data
export type ServerEnv = typeof serverEnv
