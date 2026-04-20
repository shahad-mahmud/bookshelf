import { describe, it, expect } from 'vitest'
import { sendInviteSchema, acceptInviteSchema, revokeInviteSchema } from './invite-schema'

describe('sendInviteSchema', () => {
  it('requires valid email + library id', () => {
    expect(sendInviteSchema.safeParse({ libraryId: 'nope', email: 'x@y.com' }).success).toBe(false)
    expect(sendInviteSchema.safeParse({ libraryId: '00000000-0000-0000-0000-000000000000', email: 'bad' }).success).toBe(false)
    expect(
      sendInviteSchema.safeParse({ libraryId: '00000000-0000-0000-0000-000000000000', email: 'x@y.com' }).success,
    ).toBe(true)
  })
})

describe('acceptInviteSchema', () => {
  it('accepts a 43-char base64url token', () => {
    // 32 random bytes = 43 chars in base64url (no padding)
    const token = 'a'.repeat(43)
    expect(acceptInviteSchema.safeParse({ token }).success).toBe(true)
  })
  it('rejects too-short tokens', () => {
    expect(acceptInviteSchema.safeParse({ token: 'short' }).success).toBe(false)
  })
  it('rejects too-long tokens', () => {
    expect(acceptInviteSchema.safeParse({ token: 'a'.repeat(65) }).success).toBe(false)
  })
})

describe('revokeInviteSchema', () => {
  it('requires both UUIDs', () => {
    expect(revokeInviteSchema.safeParse({ inviteId: 'nope', libraryId: 'nope' }).success).toBe(false)
  })
})
