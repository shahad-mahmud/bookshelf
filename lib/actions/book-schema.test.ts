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

  it('rejects invalid ISBN chars', () => {
    const result = bookSchema.safeParse({ ...validBase, isbn: 'ABC-123' })
    expect(result.success).toBe(false)
  })

  it('accepts valid ISBN with dashes', () => {
    const result = bookSchema.safeParse({ ...validBase, isbn: '978-3-16-148410-0' })
    expect(result.success).toBe(true)
  })

  it('requires price and currency together — price without currency fails', () => {
    const result = bookSchema.safeParse({ ...validBase, purchasePrice: '9.99' })
    expect(result.success).toBe(false)
  })

  it('requires price and currency together — currency without price fails', () => {
    const result = bookSchema.safeParse({ ...validBase, purchaseCurrency: 'USD' })
    expect(result.success).toBe(false)
  })

  it('requires price and currency together — both present passes', () => {
    const result = bookSchema.safeParse({ ...validBase, purchasePrice: '9.99', purchaseCurrency: 'USD' })
    expect(result.success).toBe(true)
  })

  it('accepts wishlist acquisition', () => {
    const result = bookSchema.safeParse({ ...validBase, acquisition: 'wishlist' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.acquisition).toBe('wishlist')
    }
  })

  it('rejects malformed date', () => {
    const result = bookSchema.safeParse({ ...validBase, purchaseDate: '2024/01/15' })
    expect(result.success).toBe(false)
  })

  it('rejects non-URL coverUrl', () => {
    const result = bookSchema.safeParse({ ...validBase, coverUrl: 'not-a-url' })
    expect(result.success).toBe(false)
  })

  it('converts empty strings to undefined for optionals', () => {
    const result = bookSchema.safeParse({ ...validBase, author: '', isbn: '', notes: '' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.author).toBeUndefined()
      expect(result.data.isbn).toBeUndefined()
      expect(result.data.notes).toBeUndefined()
    }
  })
})

describe('isbnLookupSchema', () => {
  it('accepts a valid ISBN-10', () => {
    expect(isbnLookupSchema.safeParse({ isbn: '0141439580' }).success).toBe(true)
  })
  it('accepts a valid ISBN-13', () => {
    expect(isbnLookupSchema.safeParse({ isbn: '9780141439587' }).success).toBe(true)
  })
  it('rejects empty string', () => {
    expect(isbnLookupSchema.safeParse({ isbn: '' }).success).toBe(false)
  })
})
