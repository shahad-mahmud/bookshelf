import { describe, it, expect } from 'vitest'
import { lendSchema, returnSchema } from './loan-schema'

const validBase = {
  libraryId: '00000000-0000-0000-0000-000000000000',
  bookId: '550e8400-e29b-41d4-a716-446655440000',
  lentDate: '2026-04-21',
}

describe('lendSchema', () => {
  it('accepts borrowerId (existing borrower)', () => {
    const result = lendSchema.safeParse({
      ...validBase,
      borrowerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
    })
    expect(result.success).toBe(true)
  })

  it('accepts newBorrowerName (new borrower)', () => {
    const result = lendSchema.safeParse({ ...validBase, newBorrowerName: 'Alice' })
    expect(result.success).toBe(true)
  })

  it('rejects when both borrowerId and newBorrowerName are provided', () => {
    const result = lendSchema.safeParse({
      ...validBase,
      borrowerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      newBorrowerName: 'Alice',
    })
    expect(result.success).toBe(false)
  })

  it('rejects when neither borrowerId nor newBorrowerName is provided', () => {
    const result = lendSchema.safeParse({ ...validBase })
    expect(result.success).toBe(false)
  })

  it('rejects expectedReturnDate before lentDate', () => {
    const result = lendSchema.safeParse({
      ...validBase,
      borrowerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      expectedReturnDate: '2026-04-20',
    })
    expect(result.success).toBe(false)
  })

  it('accepts expectedReturnDate equal to lentDate', () => {
    const result = lendSchema.safeParse({
      ...validBase,
      borrowerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      expectedReturnDate: '2026-04-21',
    })
    expect(result.success).toBe(true)
  })

  it('converts empty strings to undefined', () => {
    const result = lendSchema.safeParse({
      ...validBase,
      borrowerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      expectedReturnDate: '',
      notes: '',
      newBorrowerContact: '',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.expectedReturnDate).toBeUndefined()
      expect(result.data.notes).toBeUndefined()
      expect(result.data.newBorrowerContact).toBeUndefined()
    }
  })

  it('rejects malformed lentDate', () => {
    const result = lendSchema.safeParse({
      ...validBase,
      borrowerId: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
      lentDate: '21/04/2026',
    })
    expect(result.success).toBe(false)
  })
})

describe('returnSchema', () => {
  it('requires loanId, bookId, and libraryId as UUIDs', () => {
    expect(
      returnSchema.safeParse({
        loanId: '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
        bookId: '550e8400-e29b-41d4-a716-446655440000',
        libraryId: '00000000-0000-0000-0000-000000000000',
      }).success,
    ).toBe(true)
  })

  it('rejects non-UUID loanId', () => {
    expect(
      returnSchema.safeParse({
        loanId: 'not-a-uuid',
        bookId: '550e8400-e29b-41d4-a716-446655440000',
        libraryId: '00000000-0000-0000-0000-000000000000',
      }).success,
    ).toBe(false)
  })
})
