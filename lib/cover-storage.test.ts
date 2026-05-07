import { describe, it, expect } from 'vitest'
import { canonicalCoverUrl, isCanonicalCoverUrl } from './cover-storage'

const LIBRARY = '00000000-0000-0000-0000-000000000001'
const BOOK = '00000000-0000-0000-0000-000000000002'

describe('canonicalCoverUrl', () => {
  it('builds the public-object URL for the given (libraryId, bookId)', () => {
    // tests/setup.ts sets NEXT_PUBLIC_SUPABASE_URL to https://test.supabase.co
    expect(canonicalCoverUrl({ libraryId: LIBRARY, bookId: BOOK })).toBe(
      `https://test.supabase.co/storage/v1/object/public/book-covers/${LIBRARY}/${BOOK}.webp`,
    )
  })
})

describe('isCanonicalCoverUrl', () => {
  const canonical = `https://test.supabase.co/storage/v1/object/public/book-covers/${LIBRARY}/${BOOK}.webp`

  it('returns true for the exact canonical URL', () => {
    expect(isCanonicalCoverUrl({ url: canonical, libraryId: LIBRARY, bookId: BOOK })).toBe(true)
  })

  it('rejects a different bookId', () => {
    const other = '00000000-0000-0000-0000-000000000099'
    expect(isCanonicalCoverUrl({ url: canonical, libraryId: LIBRARY, bookId: other })).toBe(false)
  })

  it('rejects a different libraryId', () => {
    const other = '00000000-0000-0000-0000-000000000099'
    expect(isCanonicalCoverUrl({ url: canonical, libraryId: other, bookId: BOOK })).toBe(false)
  })

  it('rejects an extra query string', () => {
    expect(isCanonicalCoverUrl({ url: canonical + '?v=2', libraryId: LIBRARY, bookId: BOOK })).toBe(false)
  })

  it('rejects same host but different bucket', () => {
    const u = `https://test.supabase.co/storage/v1/object/public/other-bucket/${LIBRARY}/${BOOK}.webp`
    expect(isCanonicalCoverUrl({ url: u, libraryId: LIBRARY, bookId: BOOK })).toBe(false)
  })

  it('rejects an external host', () => {
    expect(isCanonicalCoverUrl({
      url: 'https://covers.openlibrary.org/b/id/1-L.jpg',
      libraryId: LIBRARY,
      bookId: BOOK,
    })).toBe(false)
  })

  it('rejects garbage strings', () => {
    expect(isCanonicalCoverUrl({ url: 'not a url', libraryId: LIBRARY, bookId: BOOK })).toBe(false)
  })
})
