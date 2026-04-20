import { describe, it, expect, vi, afterEach } from 'vitest'
import { lookupIsbn } from './openlibrary'

afterEach(() => vi.restoreAllMocks())

describe('lookupIsbn', () => {
  it('returns title, author, coverUrl on a valid response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        'ISBN:9780141439587': {
          title: 'Pride and Prejudice',
          authors: [{ name: 'Jane Austen' }],
          cover: { large: 'https://covers.openlibrary.org/b/id/1-L.jpg' },
        },
      }),
    }))
    const result = await lookupIsbn('9780141439587')
    expect(result).toEqual({
      title: 'Pride and Prejudice',
      author: 'Jane Austen',
      coverUrl: 'https://covers.openlibrary.org/b/id/1-L.jpg',
    })
  })

  it('returns null coverUrl when cover is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        'ISBN:123': { title: 'No Cover Book', authors: [{ name: 'A. Author' }] },
      }),
    }))
    const result = await lookupIsbn('123')
    expect(result?.coverUrl).toBeNull()
  })

  it('returns null for unknown ISBN (empty response object)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    }))
    expect(await lookupIsbn('0000000000')).toBeNull()
  })

  it('returns null on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))
    expect(await lookupIsbn('9780141439587')).toBeNull()
  })

  it('returns null on non-200 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
    expect(await lookupIsbn('9780141439587')).toBeNull()
  })
})
