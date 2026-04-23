import { describe, it, expect } from 'vitest'
import { bookSchema, isbnLookupSchema } from './book-schema'

const validBase = {
  libraryId: '00000000-0000-0000-0000-000000000000',
  title: 'My Book',
}

describe('bookSchema', () => {
  it('requires title', () => {
    expect(bookSchema.safeParse({ ...validBase, title: '' }).success).toBe(false)
    expect(bookSchema.safeParse({ ...validBase, title: '   ' }).success).toBe(false)
  })

  it('trims title and defaults acquisition to owned', () => {
    const result = bookSchema.safeParse({ ...validBase, title: '  Trimmed  ' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.title).toBe('Trimmed')
      expect(result.data.acquisition).toBe('owned')
    }
  })

  it('accepts a valid authorId UUID', () => {
    const result = bookSchema.safeParse({
      ...validBase,
      authorId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.authorId).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')
  })

  it('accepts a newAuthorName string', () => {
    const result = bookSchema.safeParse({ ...validBase, newAuthorName: 'Jane Austen' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.newAuthorName).toBe('Jane Austen')
  })

  it('converts empty authorId to undefined', () => {
    const result = bookSchema.safeParse({ ...validBase, authorId: '' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.authorId).toBeUndefined()
  })

  it('rejects invalid ISBN chars', () => {
    expect(bookSchema.safeParse({ ...validBase, isbn: 'ABC-123' }).success).toBe(false)
  })

  it('accepts valid ISBN with dashes', () => {
    expect(bookSchema.safeParse({ ...validBase, isbn: '978-3-16-148410-0' }).success).toBe(true)
  })

  it('requires price and currency together — price without currency fails', () => {
    expect(bookSchema.safeParse({ ...validBase, purchasePrice: '9.99' }).success).toBe(false)
  })

  it('requires price and currency together — both present passes', () => {
    const result = bookSchema.safeParse({ ...validBase, purchasePrice: '9.99', purchaseCurrency: 'USD' })
    expect(result.success).toBe(true)
  })

  it('rejects malformed date', () => {
    expect(bookSchema.safeParse({ ...validBase, purchaseDate: '2024/01/15' }).success).toBe(false)
  })

  it('rejects non-URL coverUrl', () => {
    expect(bookSchema.safeParse({ ...validBase, coverUrl: 'not-a-url' }).success).toBe(false)
  })
})

describe('isbnLookupSchema', () => {
  it('accepts a valid ISBN-10', () => {
    expect(isbnLookupSchema.safeParse({ isbn: '0141439580' }).success).toBe(true)
  })
  it('rejects empty string', () => {
    expect(isbnLookupSchema.safeParse({ isbn: '' }).success).toBe(false)
  })
})
