import { describe, it, expect } from 'vitest'
import {
  libraryNameSchema,
  libraryIdSchema,
  deleteLibrarySchema,
  transferOwnershipSchema,
  removeMemberSchema,
} from './library-schema'

describe('libraryNameSchema', () => {
  it('rejects empty', () => {
    expect(libraryNameSchema.safeParse({ name: '' }).success).toBe(false)
  })
  it('rejects whitespace-only', () => {
    expect(libraryNameSchema.safeParse({ name: '   ' }).success).toBe(false)
  })
  it('rejects >80 chars', () => {
    expect(libraryNameSchema.safeParse({ name: 'x'.repeat(81) }).success).toBe(false)
  })
  it('accepts 1-80 chars and trims', () => {
    const r = libraryNameSchema.safeParse({ name: '  My Library  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.name).toBe('My Library')
  })
})

describe('libraryIdSchema', () => {
  it('requires UUID', () => {
    expect(libraryIdSchema.safeParse({ id: 'nope' }).success).toBe(false)
    expect(libraryIdSchema.safeParse({ id: '00000000-0000-0000-0000-000000000000' }).success).toBe(true)
  })
})

describe('deleteLibrarySchema', () => {
  it('requires both id and confirmName', () => {
    expect(deleteLibrarySchema.safeParse({ id: '00000000-0000-0000-0000-000000000000' }).success).toBe(false)
    expect(
      deleteLibrarySchema.safeParse({ id: '00000000-0000-0000-0000-000000000000', confirmName: 'x' }).success,
    ).toBe(true)
  })
})

describe('transferOwnershipSchema', () => {
  it('requires both UUIDs', () => {
    expect(transferOwnershipSchema.safeParse({ libraryId: 'nope', newOwnerUserId: 'nope' }).success).toBe(false)
  })
})

describe('removeMemberSchema', () => {
  it('requires both UUIDs', () => {
    expect(removeMemberSchema.safeParse({}).success).toBe(false)
  })
})
