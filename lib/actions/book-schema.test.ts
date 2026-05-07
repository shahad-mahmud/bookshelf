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

describe('coverUrl SSRF refinement', () => {
  const base = {
    libraryId: '00000000-0000-0000-0000-000000000000',
    title: 'A',
    contributors: [{ role: 'author' as const, newAuthorName: 'X' }],
  }

  it.each([
    ['http (non-https)', 'http://example.com/cover.jpg'],
    ['file scheme', 'file:///etc/passwd'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data url', 'data:image/png;base64,AAAA'],
    ['localhost', 'https://localhost/cover.jpg'],
    ['127.0.0.1', 'https://127.0.0.1/cover.jpg'],
    ['IPv6 loopback', 'https://[::1]/cover.jpg'],
    ['private ipv4 10.x', 'https://10.0.0.1/cover.jpg'],
    ['private ipv4 192.168.x', 'https://192.168.1.1/cover.jpg'],
    ['private ipv4 172.16.x', 'https://172.16.0.1/cover.jpg'],
    ['link-local 169.254.x', 'https://169.254.169.254/cover.jpg'],
    ['raw IPv4 literal', 'https://8.8.8.8/cover.jpg'],
    ['*.local', 'https://router.local/cover.jpg'],
    ['*.internal', 'https://api.internal/cover.jpg'],
    // Numeric IPv4 forms that Node's resolver accepts but the old regex missed.
    ['decimal IPv4 (loopback)', 'https://2130706433/cover.jpg'],
    ['decimal IPv4 (any)', 'https://0/cover.jpg'],
    ['hex IPv4 dotted', 'https://0x7f.0.0.1/cover.jpg'],
    ['hex IPv4 single', 'https://0x7f000001/cover.jpg'],
    ['octal IPv4', 'https://0177.0.0.1/cover.jpg'],
    ['short-form IPv4', 'https://127.1/cover.jpg'],
  ])('rejects %s', (_label, url) => {
    const result = bookSchema.safeParse({ ...base, coverUrl: url })
    expect(result.success).toBe(false)
  })

  it('accepts a normal https url with a hostname', () => {
    const result = bookSchema.safeParse({
      ...base,
      coverUrl: 'https://covers.openlibrary.org/b/id/123-L.jpg',
    })
    expect(result.success).toBe(true)
  })

  it('accepts an empty coverUrl (preprocessor turns it into undefined)', () => {
    const result = bookSchema.safeParse({ ...base, coverUrl: '' })
    expect(result.success).toBe(true)
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
