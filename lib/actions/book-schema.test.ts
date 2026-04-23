import { describe, it, expect } from 'vitest'
import { bookSchema, isbnLookupSchema, parseContributors } from './book-schema'

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
    const result = bookSchema.safeParse({ ...validBase })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.acquisition).toBe('owned')
      expect(result.data.contributors).toEqual([])
    }
  })

  it('accepts contributors array with authorId', () => {
    const result = bookSchema.safeParse({
      ...validBase,
      contributors: [{ authorId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', role: 'author' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contributors).toHaveLength(1)
      expect(result.data.contributors[0].role).toBe('author')
    }
  })

  it('accepts contributors with newAuthorName', () => {
    const result = bookSchema.safeParse({
      ...validBase,
      contributors: [{ newAuthorName: 'Jane Austen', role: 'translator' }],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.contributors[0].newAuthorName).toBe('Jane Austen')
      expect(result.data.contributors[0].role).toBe('translator')
    }
  })

  it('rejects unknown contributor role', () => {
    const result = bookSchema.safeParse({
      ...validBase,
      contributors: [{ newAuthorName: 'X', role: 'unknown' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid ISBN chars', () => {
    expect(bookSchema.safeParse({ ...validBase, isbn: 'ABC-123' }).success).toBe(false)
  })

  it('requires price and currency together', () => {
    expect(bookSchema.safeParse({ ...validBase, purchasePrice: '9.99' }).success).toBe(false)
    expect(bookSchema.safeParse({ ...validBase, purchasePrice: '9.99', purchaseCurrency: 'USD' }).success).toBe(true)
  })
})

describe('parseContributors', () => {
  it('parses indexed form data into array', () => {
    const flat: Record<string, string> = {
      'contributors[0][role]': 'author',
      'contributors[0][authorId]': 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      'contributors[1][role]': 'translator',
      'contributors[1][newAuthorName]': 'John Smith',
    }
    const result = parseContributors(flat)
    expect(result).toEqual([
      { role: 'author', authorId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' },
      { role: 'translator', newAuthorName: 'John Smith' },
    ])
  })

  it('returns empty array when no contributors keys', () => {
    expect(parseContributors({ title: 'Book' })).toEqual([])
  })

  it('skips entries with no role', () => {
    const flat = { 'contributors[0][authorId]': 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' }
    expect(parseContributors(flat)).toEqual([])
  })
})

describe('isbnLookupSchema', () => {
  it('accepts a valid ISBN', () => {
    expect(isbnLookupSchema.safeParse({ isbn: '0141439580' }).success).toBe(true)
  })
  it('rejects empty string', () => {
    expect(isbnLookupSchema.safeParse({ isbn: '' }).success).toBe(false)
  })
})
