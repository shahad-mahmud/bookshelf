// Intentionally NOT 'server-only' so tsx scripts (e.g. scripts/migrate-covers.ts)
// can import it. Sharp is a Node-native module without a browser entry point,
// so any client-side bundle that reaches this module fails the build.
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { assertSafeFetchUrl } from '@/lib/safe-url'

export const COVER_BUCKET = 'book-covers'

export function canonicalCoverUrl(args: { libraryId: string; bookId: string }): string {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${COVER_BUCKET}/${args.libraryId}/${args.bookId}.webp`
}

export function isCanonicalCoverUrl(args: { url: string; libraryId: string; bookId: string }): boolean {
  return args.url === canonicalCoverUrl({ libraryId: args.libraryId, bookId: args.bookId })
}

const MAX_BYTES = 5 * 1024 * 1024
const PER_ATTEMPT_TIMEOUT_MS = 5_000
const RETRY_BACKOFFS_MS = [200, 500]
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504])

export type CoverFetchError =
  | 'fetch_failed'
  | 'http_error'
  | 'too_large'
  | 'wrong_type'
  | 'storage_failed'
  | 'unsafe_url'

export type FetchAndStoreCoverArgs = {
  externalUrl: string
  libraryId: string
  bookId: string
  supabase: SupabaseClient
}

export async function fetchAndStoreCover(
  args: FetchAndStoreCoverArgs,
): Promise<{ ok: true; storageUrl: string } | { ok: false; reason: CoverFetchError }> {
  // Re-validate the URL against the SSRF policy and resolve DNS before any
  // network egress. The schema-level lexical check runs at form-submit time;
  // this is the last line of defense for non-action callers (scripts, etc).
  const safety = await assertSafeFetchUrl(args.externalUrl)
  if (!safety.ok) {
    logFailure('unsafe_url', args, { reason: safety.reason })
    return { ok: false, reason: 'unsafe_url' }
  }

  const fetched = await fetchWithRetry(args.externalUrl, args)
  if (!fetched.ok) return fetched

  const decoded = await decodeAndResize(fetched.bytes, args)
  if (!decoded.ok) return decoded

  const path = `${args.libraryId}/${args.bookId}.webp`
  const upload = await args.supabase.storage.from(COVER_BUCKET).upload(path, decoded.webp, {
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
    upsert: true,
  })
  if (upload.error) {
    logFailure('storage_failed', args, { error: upload.error.message })
    return { ok: false, reason: 'storage_failed' }
  }

  return { ok: true, storageUrl: canonicalCoverUrl({ libraryId: args.libraryId, bookId: args.bookId }) }
}

function logFailure(
  reason: CoverFetchError,
  args: FetchAndStoreCoverArgs,
  extra?: Record<string, unknown>,
) {
  console.error('[cover-storage] failed', {
    libraryId: args.libraryId,
    bookId: args.bookId,
    externalHost: safeHost(args.externalUrl),
    reason,
    ...extra,
  })
}

async function fetchWithRetry(
  url: string,
  args: FetchAndStoreCoverArgs,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: CoverFetchError }> {
  let attempt = 0
  let lastDetail: Record<string, unknown> = {}
  while (true) {
    const result = await fetchOnce(url)
    if (result.ok) return { ok: true, bytes: result.bytes }

    if (result.reason !== 'fetch_failed') {
      logFailure(result.reason, args, { attempt: attempt + 1, ...result.detail })
      return { ok: false, reason: result.reason }
    }
    lastDetail = result.detail ?? {}

    if (attempt >= RETRY_BACKOFFS_MS.length) {
      logFailure('fetch_failed', args, { attempts: attempt + 1, ...lastDetail })
      return { ok: false, reason: 'fetch_failed' }
    }
    await sleep(RETRY_BACKOFFS_MS[attempt])
    attempt++
  }
}

type FetchOnceResult =
  | { ok: true; bytes: Buffer }
  | { ok: false; reason: CoverFetchError; detail?: Record<string, unknown> }

async function fetchOnce(url: string): Promise<FetchOnceResult> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS), redirect: 'manual' })
  } catch (err) {
    return { ok: false, reason: 'fetch_failed', detail: errorDetail(err) }
  }

  // redirect: 'manual' surfaces 3xx as a normal response. Refuse to follow —
  // a public cover host has no business 30x'ing us, and the input URL has
  // already passed lexical+DNS validation. Following would re-open the SSRF
  // surface.
  if (res.status >= 300 && res.status < 400) {
    return { ok: false, reason: 'http_error', detail: { status: res.status } }
  }

  if (!res.ok) {
    if (TRANSIENT_HTTP.has(res.status)) {
      return { ok: false, reason: 'fetch_failed', detail: { status: res.status } }
    }
    return { ok: false, reason: 'http_error', detail: { status: res.status } }
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('image/')) {
    return { ok: false, reason: 'wrong_type', detail: { contentType } }
  }

  const declaredLenRaw = res.headers.get('content-length')
  const declaredLen = declaredLenRaw == null ? null : Number(declaredLenRaw)
  if (declaredLen !== null && Number.isFinite(declaredLen) && declaredLen > MAX_BYTES) {
    return { ok: false, reason: 'too_large', detail: { declaredLen } }
  }

  let bytes: Buffer
  try {
    const ab = await res.arrayBuffer()
    bytes = Buffer.from(ab)
  } catch (err) {
    return { ok: false, reason: 'fetch_failed', detail: errorDetail(err) }
  }
  if (bytes.length === 0) return { ok: false, reason: 'wrong_type', detail: { length: 0 } }
  if (bytes.length > MAX_BYTES) return { ok: false, reason: 'too_large', detail: { length: bytes.length } }

  return { ok: true, bytes }
}

async function decodeAndResize(
  bytes: Buffer,
  args: FetchAndStoreCoverArgs,
): Promise<{ ok: true; webp: Buffer } | { ok: false; reason: CoverFetchError }> {
  try {
    const webp = await sharp(bytes, { failOn: 'error', limitInputPixels: 24_000_000 })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer()
    return { ok: true, webp }
  } catch (err) {
    logFailure('wrong_type', args, errorDetail(err))
    return { ok: false, reason: 'wrong_type' }
  }
}

function errorDetail(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { errName: err.name, errMessage: err.message }
  }
  return { errMessage: String(err) }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function safeHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return '<unparseable>'
  }
}

export async function removeCover(args: {
  libraryId: string
  bookId: string
  supabase: SupabaseClient
}): Promise<void> {
  const path = `${args.libraryId}/${args.bookId}.webp`
  try {
    const { error } = await args.supabase.storage.from(COVER_BUCKET).remove([path])
    if (error) {
      console.error('[cover-storage] remove failed', {
        libraryId: args.libraryId,
        bookId: args.bookId,
        errMessage: error.message,
      })
    }
  } catch (err) {
    console.error('[cover-storage] remove threw', {
      libraryId: args.libraryId,
      bookId: args.bookId,
      ...errorDetail(err),
    })
  }
}
