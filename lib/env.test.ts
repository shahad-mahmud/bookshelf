import { describe, it, expect, afterEach, beforeEach } from 'vitest'

// Cache-busting query on dynamic imports defeats Vitest's ESM module cache.
// TypeScript can't resolve the query variants, so silence each import site.
type EnvModule = typeof import('./env')
type ServerEnvModule = typeof import('./env-server')

describe('public env validation (lib/env.ts)', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { NODE_ENV: originalEnv.NODE_ENV ?? 'test' } as NodeJS.ProcessEnv
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('throws when NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'k'
    // @ts-expect-error — cache-busting query string
    await expect(import('./env?case=missing-url')).rejects.toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })

  it('throws with each missing public var listed', async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    // @ts-expect-error — cache-busting query string
    await expect(import('./env?case=missing-multi')).rejects.toThrow(
      /NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/,
    )
  })

  it('parses valid public env', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_xxx'
    // @ts-expect-error — cache-busting query string
    const mod: EnvModule = await import('./env?case=valid-public')
    expect(mod.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://x.supabase.co')
    expect(mod.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe('sb_publishable_xxx')
  })

  it('does NOT require server-only vars to be present', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'k'
    delete process.env.DATABASE_URL
    delete process.env.DIRECT_URL
    // @ts-expect-error — cache-busting query string
    const mod: EnvModule = await import('./env?case=client-safe')
    expect(mod.env.NEXT_PUBLIC_SUPABASE_URL).toBe('https://x.supabase.co')
  })
})

describe('server env validation (lib/env-server.ts)', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { NODE_ENV: originalEnv.NODE_ENV ?? 'test' } as NodeJS.ProcessEnv
  })
  afterEach(() => {
    process.env = originalEnv
  })

  it('throws when DATABASE_URL is missing', async () => {
    process.env.DIRECT_URL = 'postgres://x'
    // @ts-expect-error — cache-busting query string
    await expect(import('./env-server?case=missing-db')).rejects.toThrow(/DATABASE_URL/)
  })

  it('throws with all missing server vars listed', async () => {
    delete process.env.DATABASE_URL
    delete process.env.DIRECT_URL
    // @ts-expect-error — cache-busting query string
    await expect(import('./env-server?case=missing-multi')).rejects.toThrow(
      /DATABASE_URL[\s\S]*DIRECT_URL/,
    )
  })

  it('parses valid server env and defaults DEFAULT_CURRENCY', async () => {
    process.env.DATABASE_URL = 'postgres://pool'
    process.env.DIRECT_URL = 'postgres://direct'
    // @ts-expect-error — cache-busting query string
    const mod: ServerEnvModule = await import('./env-server?case=valid')
    expect(mod.serverEnv.DATABASE_URL).toBe('postgres://pool')
    expect(mod.serverEnv.DEFAULT_CURRENCY).toBe('BDT')
  })

  it('defaults DEFAULT_CURRENCY on empty string', async () => {
    process.env.DATABASE_URL = 'postgres://pool'
    process.env.DIRECT_URL = 'postgres://direct'
    process.env.DEFAULT_CURRENCY = ''
    // @ts-expect-error — cache-busting query string
    const mod: ServerEnvModule = await import('./env-server?case=empty-currency')
    expect(mod.serverEnv.DEFAULT_CURRENCY).toBe('BDT')
  })
})
