import 'server-only'
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

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

export type FetchAndStoreCoverArgs = {
  externalUrl: string
  libraryId: string
  bookId: string
  supabase: SupabaseClient
}

export async function fetchAndStoreCover(
  args: FetchAndStoreCoverArgs,
): Promise<{ ok: true; storageUrl: string } | { ok: false; reason: CoverFetchError }> {
  const fetched = await fetchWithRetry(args.externalUrl)
  if (!fetched.ok) return fetched

  const decoded = await decodeAndResize(fetched.bytes)
  if (!decoded.ok) return decoded

  const path = `${args.libraryId}/${args.bookId}.webp`
  const upload = await args.supabase.storage.from(COVER_BUCKET).upload(path, decoded.webp, {
    contentType: 'image/webp',
    cacheControl: 'public, max-age=31536000, immutable',
    upsert: true,
  })
  if (upload.error) {
    console.error('[cover-storage] upload failed', {
      libraryId: args.libraryId,
      bookId: args.bookId,
      externalHost: safeHost(args.externalUrl),
      reason: 'storage_failed',
    })
    return { ok: false, reason: 'storage_failed' }
  }

  return { ok: true, storageUrl: canonicalCoverUrl({ libraryId: args.libraryId, bookId: args.bookId }) }
}

async function fetchWithRetry(
  url: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: CoverFetchError }> {
  let attempt = 0
  while (true) {
    const result = await fetchOnce(url)
    if (result.ok) return result
    if (result.reason !== 'fetch_failed') return result
    if (attempt >= RETRY_BACKOFFS_MS.length) return { ok: false, reason: 'fetch_failed' }
    await sleep(RETRY_BACKOFFS_MS[attempt])
    attempt++
  }
}

async function fetchOnce(
  url: string,
): Promise<{ ok: true; bytes: Buffer } | { ok: false; reason: CoverFetchError }> {
  let res: Response
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS), redirect: 'follow' })
  } catch {
    return { ok: false, reason: 'fetch_failed' }
  }

  if (!res.ok) {
    if (TRANSIENT_HTTP.has(res.status)) return { ok: false, reason: 'fetch_failed' }
    return { ok: false, reason: 'http_error' }
  }

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('image/')) {
    return { ok: false, reason: 'wrong_type' }
  }

  const declaredLen = Number(res.headers.get('content-length') ?? '0')
  if (declaredLen > MAX_BYTES) return { ok: false, reason: 'too_large' }

  const ab = await res.arrayBuffer()
  const bytes = Buffer.from(ab)
  if (bytes.length === 0) return { ok: false, reason: 'wrong_type' }
  if (bytes.length > MAX_BYTES) return { ok: false, reason: 'too_large' }

  return { ok: true, bytes }
}

async function decodeAndResize(
  bytes: Buffer,
): Promise<{ ok: true; webp: Buffer } | { ok: false; reason: CoverFetchError }> {
  try {
    const webp = await sharp(bytes, { failOn: 'error', limitInputPixels: 24_000_000 })
      .rotate()
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 4 })
      .toBuffer()
    return { ok: true, webp }
  } catch {
    return { ok: false, reason: 'wrong_type' }
  }
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
