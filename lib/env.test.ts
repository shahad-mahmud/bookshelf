import { describe, it, expect, afterEach, beforeEach } from 'vitest'

// Cache-busting query on dynamic imports defeats Vitest's ESM module cache.
// TypeScript can't resolve the query variants, so silence each import site.
type EnvModule = typeof import('./env')

describe('env validation', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    // Clean baseline (keep NODE_ENV for libraries that read it).
    process.env = { NODE_ENV: originalEnv.NODE_ENV ?? 'test' } as NodeJS.ProcessEnv
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('throws when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    process.env.DIRECT_URL = 'postgres://x'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'k'
    // @ts-expect-error — cache-busting query string
    await expect(import('./env?case=missing-db-url')).rejects.toThrow(/DATABASE_URL/)
  })

  it('throws when multiple vars are missing, listing each', async () => {
    delete process.env.DATABASE_URL
    delete process.env.DIRECT_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    // @ts-expect-error — cache-busting query string
    await expect(import('./env?case=missing-multi')).rejects.toThrow(
      /DATABASE_URL[\s\S]*DIRECT_URL[\s\S]*NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    )
  })

  it('parses a valid env and exposes typed values', async () => {
    process.env.DATABASE_URL = 'postgres://pool'
    process.env.DIRECT_URL = 'postgres://direct'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anonkey'
    process.env.DEFAULT_CURRENCY = 'BDT'
    // @ts-expect-error — cache-busting query string
    const mod: EnvModule = await import('./env?case=valid')
    expect(mod.env.DATABASE_URL).toBe('postgres://pool')
    expect(mod.env.DEFAULT_CURRENCY).toBe('BDT')
  })

  it('defaults DEFAULT_CURRENCY to BDT when empty string', async () => {
    process.env.DATABASE_URL = 'postgres://pool'
    process.env.DIRECT_URL = 'postgres://direct'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anonkey'
    process.env.DEFAULT_CURRENCY = ''
    // @ts-expect-error — cache-busting query string
    const mod: EnvModule = await import('./env?case=default-currency-empty')
    expect(mod.env.DEFAULT_CURRENCY).toBe('BDT')
  })

  it('defaults DEFAULT_CURRENCY to BDT when unset', async () => {
    process.env.DATABASE_URL = 'postgres://pool'
    process.env.DIRECT_URL = 'postgres://direct'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'anonkey'
    delete process.env.DEFAULT_CURRENCY
    // @ts-expect-error — cache-busting query string
    const mod: EnvModule = await import('./env?case=default-currency-unset')
    expect(mod.env.DEFAULT_CURRENCY).toBe('BDT')
  })
})
