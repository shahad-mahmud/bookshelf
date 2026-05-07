import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import sharp from 'sharp'
import { canonicalCoverUrl, isCanonicalCoverUrl, fetchAndStoreCover } from './cover-storage'

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

// In-memory fake storage client passed into fetchAndStoreCover.
function makeStorage() {
  const calls: { upload: Array<{ path: string; body: Buffer; opts: Record<string, unknown> }> } = { upload: [] }
  const client = {
    storage: {
      from(_bucket: string) {
        return {
          upload: vi.fn(async (path: string, body: Buffer, opts: Record<string, unknown>) => {
            calls.upload.push({ path, body, opts })
            return { data: { path }, error: null }
          }),
        }
      },
    },
  }
  return { client, calls }
}

async function makeJpegBuffer(): Promise<Buffer> {
  return sharp({ create: { width: 50, height: 50, channels: 3, background: '#ff0000' } }).jpeg().toBuffer()
}

function mockFetchOnce(response: { body?: Buffer; status?: number; headers?: Record<string, string> }) {
  const init = {
    status: response.status ?? 200,
    headers: new Headers(response.headers ?? { 'content-type': 'image/jpeg' }),
  }
  const body = response.body
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    headers: init.headers,
    arrayBuffer: async () => body ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new ArrayBuffer(0),
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('fetchAndStoreCover', () => {
  const LIBRARY = '00000000-0000-0000-0000-000000000001'
  const BOOK = '00000000-0000-0000-0000-000000000002'

  it('happy path: stores re-encoded webp at the canonical path and returns the public URL', async () => {
    const body = await makeJpegBuffer()
    mockFetchOnce({ status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length) }, body })
    const storage = makeStorage()

    const result = await fetchAndStoreCover({
      externalUrl: 'https://example.com/cover.jpg',
      libraryId: LIBRARY,
      bookId: BOOK,
      supabase: storage.client as unknown as never,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.storageUrl).toBe(canonicalCoverUrl({ libraryId: LIBRARY, bookId: BOOK }))
    }
    expect(storage.calls.upload).toHaveLength(1)
    expect(storage.calls.upload[0].path).toBe(`${LIBRARY}/${BOOK}.webp`)
    expect(storage.calls.upload[0].opts).toMatchObject({
      contentType: 'image/webp',
      cacheControl: 'public, max-age=31536000, immutable',
      upsert: true,
    })
    // Verify the uploaded body is actually a webp
    const meta = await sharp(storage.calls.upload[0].body).metadata()
    expect(meta.format).toBe('webp')
  })

  it('rejects a too-large response by Content-Length without reading body', async () => {
    mockFetchOnce({ status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(10 * 1024 * 1024) } })
    const storage = makeStorage()
    const result = await fetchAndStoreCover({
      externalUrl: 'https://example.com/big.jpg',
      libraryId: LIBRARY, bookId: BOOK,
      supabase: storage.client as unknown as never,
    })
    expect(result).toEqual({ ok: false, reason: 'too_large' })
    expect(storage.calls.upload).toHaveLength(0)
  })

  it('rejects non-image MIME', async () => {
    mockFetchOnce({ status: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<html></html>') })
    const storage = makeStorage()
    const result = await fetchAndStoreCover({
      externalUrl: 'https://example.com/notimage', libraryId: LIBRARY, bookId: BOOK,
      supabase: storage.client as unknown as never,
    })
    expect(result).toEqual({ ok: false, reason: 'wrong_type' })
    expect(storage.calls.upload).toHaveLength(0)
  })

  it('rejects bytes that sharp cannot decode', async () => {
    mockFetchOnce({ status: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('not a jpeg at all') })
    const storage = makeStorage()
    const result = await fetchAndStoreCover({
      externalUrl: 'https://example.com/garbage.jpg', libraryId: LIBRARY, bookId: BOOK,
      supabase: storage.client as unknown as never,
    })
    expect(result).toEqual({ ok: false, reason: 'wrong_type' })
    expect(storage.calls.upload).toHaveLength(0)
  })

  it('returns http_error on a 404', async () => {
    mockFetchOnce({ status: 404, headers: { 'content-type': 'text/plain' } })
    const storage = makeStorage()
    const result = await fetchAndStoreCover({
      externalUrl: 'https://example.com/missing.jpg', libraryId: LIBRARY, bookId: BOOK,
      supabase: storage.client as unknown as never,
    })
    expect(result).toEqual({ ok: false, reason: 'http_error' })
  })

  it('retries on 503 and succeeds on attempt 2', async () => {
    const body = await makeJpegBuffer()
    const responses = [
      { ok: false, status: 503, headers: new Headers({ 'content-type': 'text/plain' }), arrayBuffer: async () => new ArrayBuffer(0) },
      { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': String(body.length) }),
        arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) },
    ]
    const fetchMock = vi.fn().mockImplementation(async () => responses.shift())
    vi.stubGlobal('fetch', fetchMock)
    const storage = makeStorage()

    const result = await fetchAndStoreCover({
      externalUrl: 'https://example.com/cover.jpg', libraryId: LIBRARY, bookId: BOOK,
      supabase: storage.client as unknown as never,
    })

    expect(result.ok).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns fetch_failed after exhausting retries on 503', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 503, headers: new Headers({ 'content-type': 'text/plain' }),
      arrayBuffer: async () => new ArrayBuffer(0),
    })
    vi.stubGlobal('fetch', fetchMock)
    const storage = makeStorage()
    const result = await fetchAndStoreCover({
      externalUrl: 'https://example.com/down.jpg', libraryId: LIBRARY, bookId: BOOK,
      supabase: storage.client as unknown as never,
    })
    expect(result).toEqual({ ok: false, reason: 'fetch_failed' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('returns storage_failed when upload errors', async () => {
    const body = await makeJpegBuffer()
    mockFetchOnce({ status: 200, headers: { 'content-type': 'image/jpeg', 'content-length': String(body.length) }, body })
    const storage = {
      storage: {
        from() {
          return { upload: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) }
        },
      },
    }
    const result = await fetchAndStoreCover({
      externalUrl: 'https://example.com/cover.jpg', libraryId: LIBRARY, bookId: BOOK,
      supabase: storage as unknown as never,
    })
    expect(result).toEqual({ ok: false, reason: 'storage_failed' })
  })
})
