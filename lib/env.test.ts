import { describe, it, expect, afterEach, beforeEach } from 'vitest'

describe('env validation', () => {
  const originalEnv = { ...process.env }
  beforeEach(() => {
    process.env = { ...originalEnv }
  })
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('throws when DATABASE_URL is missing', async () => {
    delete process.env.DATABASE_URL
    process.env.DIRECT_URL = 'postgres://x'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'k'
    await expect(import('./env?case=missing-db-url')).rejects.toThrow(/DATABASE_URL/)
  })

  it('throws when multiple vars are missing, listing each', async () => {
    delete process.env.DATABASE_URL
    delete process.env.DIRECT_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    await expect(import('./env?case=missing-multi')).rejects.toThrow(
      /DATABASE_URL[\s\S]*DIRECT_URL[\s\S]*NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    )
  })

  it('parses a valid env and exposes typed values', async () => {
    process.env.DATABASE_URL = 'postgres://pool'
    process.env.DIRECT_URL = 'postgres://direct'
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anonkey'
    process.env.DEFAULT_CURRENCY = 'BDT'
    const mod = await import('./env?case=valid')
    expect(mod.env.DATABASE_URL).toBe('postgres://pool')
    expect(mod.env.DEFAULT_CURRENCY).toBe('BDT')
  })
})
