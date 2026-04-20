import { vi } from 'vitest'

// Mock server-only so tests can import server-only modules
vi.mock('server-only', () => ({}))

// Set up required environment variables for tests
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'
process.env.DIRECT_URL ??= 'postgresql://test:test@localhost:5432/test'
process.env.RESEND_API_KEY ??= 're_test_key'
process.env.EMAIL_FROM ??= 'test@example.com'
process.env.NEXT_PUBLIC_SUPABASE_URL ??= 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??= 'test_key'
