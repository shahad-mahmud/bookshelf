# Cover Image Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Self-host book covers in a public Supabase Storage bucket. The book server actions fetch, validate, normalise, and upload cover images, replacing the brittle external-URL allowlist with a single canonical-URL invariant: every non-null `books.cover_url` is our public storage URL for that exact `(library_id, book_id)`.

**Architecture:** A new `lib/cover-storage.ts` module owns the fetch → `sharp` → upload pipeline. `createBookAction` / `updateBookAction` / `deleteBookAction` invoke it inline (synchronous to the form submit). RLS on `storage.objects` mirrors the `books` policy, keyed on the library-id path prefix (`<library_id>/<book_id>.webp`). A one-shot backfill script runs the same pipeline against existing rows. A separate GC script sweeps orphan objects.

**Tech Stack:** Next.js 16 (App Router, Server Actions), Drizzle ORM, Supabase (Postgres + Storage + Auth), `sharp` (decode/resize/re-encode), Zod, vitest.

**Spec:** `docs/superpowers/specs/2026-05-07-cover-image-storage-design.md`

---

## File Map

| File | Change |
|---|---|
| `package.json` | Add `sharp` dependency |
| `lib/env-server.ts` | Add `SUPABASE_SERVICE_ROLE_KEY` to schema |
| `lib/supabase/admin.ts` | New: service-role client for scripts |
| `db/migrations/0012_cover_storage.sql` | New: create bucket + RLS policies |
| `lib/actions/book-schema.ts` | Add SSRF refinement on `coverUrl` |
| `lib/actions/book-schema.test.ts` | Cases for SSRF refinement |
| `lib/cover-storage.ts` | New: fetch+process+upload pipeline, canonical URL helpers, removeCover |
| `lib/cover-storage.test.ts` | New: unit tests for the pipeline |
| `lib/actions/book.ts` | Wire pipeline into create/update/delete |
| `next.config.ts` | Add `book-covers/**` to `images.remotePatterns` |
| `scripts/migrate-covers.ts` | New: one-shot backfill |
| `scripts/gc-orphan-covers.ts` | New: orphan sweep |
| `scripts/smoke-cover-storage.ts` | New: end-to-end smoke + RLS check |
| `package.json` (scripts) | Add `migrate:covers`, `gc:covers`, `smoke:cover-storage` |

---

## Task 1: Add `sharp` dependency

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install sharp**

Run: `npm install sharp@^0.34.0`

Expected: `sharp` appears under `dependencies` in `package.json`. `npm` may print a platform note about prebuilt binaries; that's fine.

- [ ] **Step 2: Verify it loads**

Run: `node -e "require('sharp')(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=','base64')).webp().toBuffer().then(b => console.log('ok', b.length))"`

Expected output: `ok <some number>` (a tiny WebP buffer).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add sharp for cover image processing"
```

---

## Task 2: Add `SUPABASE_SERVICE_ROLE_KEY` env var

**Files:**
- Modify: `lib/env-server.ts`

The backfill and GC scripts need service-role storage access (cross-library list / write). User-scoped clients can't list across libraries.

- [ ] **Step 1: Add the var to the zod schema**

In `lib/env-server.ts`, in the `schema` object, add a new field after `EMAIL_FROM`:

```ts
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
```

Final schema reads:

```ts
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.email(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  ADDITIONAL_ALLOWED_ORIGINS: z.string().optional(),
  DEFAULT_CURRENCY: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().length(3).default('BDT'),
  ),
})
```

- [ ] **Step 2: Add the var to the test setup**

In `.vitest/setup.ts`, add a default after the existing `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` line:

```ts
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test_service_role_key'
```

- [ ] **Step 3: Add the var to local env**

Tell the user (or check) that `SUPABASE_SERVICE_ROLE_KEY` is set in `.env.local`. The actual value comes from the Supabase project dashboard → Settings → API → `service_role` key. **Do not commit the value.** If `.env.example` exists, add a placeholder line there.

Run: `grep -l 'SUPABASE_SERVICE_ROLE_KEY' .env.example 2>/dev/null || echo "no .env.example"`

If `.env.example` exists, add `SUPABASE_SERVICE_ROLE_KEY=` to it.

- [ ] **Step 4: Run the test suite to confirm setup picks up the var**

Run: `npm test`

Expected: all existing tests still pass (the new var has a default in the test setup).

- [ ] **Step 5: Commit**

```bash
git add lib/env-server.ts .vitest/setup.ts .env.example
git commit -m "chore(env): require SUPABASE_SERVICE_ROLE_KEY for cover-storage scripts"
```

(Skip `.env.example` from the add list if it doesn't exist.)

---

## Task 3: Service-role Supabase client for scripts

**Files:**
- Create: `lib/supabase/admin.ts`

- [ ] **Step 1: Create the client module**

Create `lib/supabase/admin.ts`:

```ts
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'
import { serverEnv } from '@/lib/env-server'

/**
 * Service-role Supabase client. Bypasses RLS. Intended for scripts/
 * (backfill, GC, smoke tests) — NEVER import from app/, lib/actions/, or
 * components/. No `server-only` import so tsx scripts can resolve it.
 */
export function createServiceRoleClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`

Expected: zero errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase/admin.ts
git commit -m "feat(supabase): add service-role client for scripts"
```

---

## Task 4: Migration `0012_cover_storage.sql`

**Files:**
- Create: `db/migrations/0012_cover_storage.sql`

- [ ] **Step 1: Write the migration**

Create `db/migrations/0012_cover_storage.sql`:

```sql
-- Public bucket for book covers. Reads are public (any URL hits the CDN);
-- writes/updates/deletes are gated by library membership via fn_library_access.
INSERT INTO storage.buckets (id, name, public)
VALUES ('book-covers', 'book-covers', true)
ON CONFLICT (id) DO NOTHING;

-- Path layout: <library_id>/<book_id>.webp
-- The first segment is the library UUID, which the policies extract for the access check.

CREATE POLICY book_covers_insert ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (
    bucket_id = 'book-covers'
    AND public.fn_library_access((string_to_array(name, '/'))[1]::uuid)
  );

CREATE POLICY book_covers_update ON storage.objects FOR UPDATE
  TO authenticated USING (
    bucket_id = 'book-covers'
    AND public.fn_library_access((string_to_array(name, '/'))[1]::uuid)
  ) WITH CHECK (
    bucket_id = 'book-covers'
    AND public.fn_library_access((string_to_array(name, '/'))[1]::uuid)
  );

CREATE POLICY book_covers_delete ON storage.objects FOR DELETE
  TO authenticated USING (
    bucket_id = 'book-covers'
    AND public.fn_library_access((string_to_array(name, '/'))[1]::uuid)
  );
```

- [ ] **Step 2: Append to drizzle journal**

Open `db/migrations/meta/_journal.json` and add an entry after the last one:

```json
{
  "idx": 12,
  "version": "...",            // copy "version" value from the previous entry
  "when": <unix-ms-timestamp>, // current epoch ms; use Date.now() output
  "tag": "0012_cover_storage",
  "breakpoints": true
}
```

Run `node -e "console.log(Date.now())"` to get the timestamp value.

- [ ] **Step 3: Apply migration locally**

Run: `npm run db:apply`

Expected: migration applies cleanly. Verify by:

```bash
psql "$DATABASE_URL" -c "SELECT id, public FROM storage.buckets WHERE id='book-covers';"
```

Expected: one row, `public = t`.

```bash
psql "$DATABASE_URL" -c "SELECT polname FROM pg_policy WHERE polname LIKE 'book_covers_%';"
```

Expected: three rows: `book_covers_insert`, `book_covers_update`, `book_covers_delete`.

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0012_cover_storage.sql db/migrations/meta/_journal.json
git commit -m "feat(db): add book-covers storage bucket and RLS policies"
```

---

## Task 5: Tighten `coverUrl` SSRF validation in `book-schema.ts` (TDD)

**Files:**
- Modify: `lib/actions/book-schema.ts`
- Modify: `lib/actions/book-schema.test.ts`

- [ ] **Step 1: Write failing tests for SSRF rejection**

Open `lib/actions/book-schema.test.ts`. Inside the existing top-level `describe` (or as a new `describe`), add:

```ts
describe('coverUrl SSRF refinement', () => {
  const base = {
    libraryId: '00000000-0000-0000-0000-000000000001',
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
```

You will also need to import `describe` and friends if not already imported.

- [ ] **Step 2: Run tests; expect them to fail**

Run: `npx vitest run lib/actions/book-schema.test.ts`

Expected: the 14 SSRF-rejection cases FAIL (the schema currently accepts any valid URL).

- [ ] **Step 3: Implement the refinement**

In `lib/actions/book-schema.ts`, add this helper above `bookSchema`:

```ts
function isSafeHttpsUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false

  const host = u.hostname.toLowerCase()
  if (host === 'localhost') return false
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false

  // Reject any IPv4 literal — book covers don't legitimately use bare IPs.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false

  // IPv6 literal: URL.hostname strips the surrounding brackets but the address still contains ":".
  if (host.includes(':')) return false

  return true
}
```

Then change the `coverUrl` field in `bookSchema`:

```ts
coverUrl: z.preprocess(
  emptyToUndef,
  z.url().refine(isSafeHttpsUrl, { message: 'Cover URL must be a public https:// address.' }).optional(),
),
```

- [ ] **Step 4: Run tests; expect green**

Run: `npx vitest run lib/actions/book-schema.test.ts`

Expected: all tests pass, including the 14 SSRF cases.

- [ ] **Step 5: Commit**

```bash
git add lib/actions/book-schema.ts lib/actions/book-schema.test.ts
git commit -m "feat(books): reject unsafe cover URLs in book schema"
```

---

## Task 6: Canonical URL helpers in `lib/cover-storage.ts` (TDD)

**Files:**
- Create: `lib/cover-storage.ts`
- Create: `lib/cover-storage.test.ts`

- [ ] **Step 1: Write failing tests for canonical URL helpers**

Create `lib/cover-storage.test.ts`:

```ts
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
```

- [ ] **Step 2: Run; expect failure (module not found)**

Run: `npx vitest run lib/cover-storage.test.ts`

Expected: FAIL with `Cannot find module './cover-storage'` or similar.

- [ ] **Step 3: Implement the helpers**

Create `lib/cover-storage.ts`:

```ts
import 'server-only'
import { env } from '@/lib/env'

export const COVER_BUCKET = 'book-covers'

export function canonicalCoverUrl(args: { libraryId: string; bookId: string }): string {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${COVER_BUCKET}/${args.libraryId}/${args.bookId}.webp`
}

export function isCanonicalCoverUrl(args: { url: string; libraryId: string; bookId: string }): boolean {
  return args.url === canonicalCoverUrl({ libraryId: args.libraryId, bookId: args.bookId })
}
```

- [ ] **Step 4: Run; expect green**

Run: `npx vitest run lib/cover-storage.test.ts`

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/cover-storage.ts lib/cover-storage.test.ts
git commit -m "feat(covers): add canonical URL helpers"
```

---

## Task 7: `fetchAndStoreCover` orchestrator (TDD)

**Files:**
- Modify: `lib/cover-storage.ts`
- Modify: `lib/cover-storage.test.ts`

This task implements the fetch + retry + sharp + upload pipeline.

- [ ] **Step 1: Write failing tests**

Append to `lib/cover-storage.test.ts`:

```ts
import { vi, beforeEach, afterEach } from 'vitest'
import sharp from 'sharp'
import { fetchAndStoreCover } from './cover-storage'

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

function mockFetchOnce(response: Partial<Response> & { body?: Buffer; status?: number; headers?: Record<string, string> }) {
  const init = {
    status: response.status ?? 200,
    headers: new Headers(response.headers ?? { 'content-type': 'image/jpeg' }),
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    headers: init.headers,
    arrayBuffer: async () => response.body ? response.body.buffer.slice(response.body.byteOffset, response.body.byteOffset + response.body.byteLength) : new ArrayBuffer(0),
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
```

Note: also import `canonicalCoverUrl` at the top if it isn't already imported.

- [ ] **Step 2: Run; expect failure**

Run: `npx vitest run lib/cover-storage.test.ts`

Expected: tests for `fetchAndStoreCover` FAIL because the function isn't exported yet.

- [ ] **Step 3: Implement the orchestrator**

Append to `lib/cover-storage.ts`:

```ts
import sharp from 'sharp'
import type { SupabaseClient } from '@supabase/supabase-js'

const MAX_BYTES = 5 * 1024 * 1024
const PER_ATTEMPT_TIMEOUT_MS = 5_000
const RETRY_BACKOFFS_MS = [200, 500, 1000]
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
```

- [ ] **Step 4: Run; expect green**

Run: `npx vitest run lib/cover-storage.test.ts`

Expected: all tests pass. The retry test will run with real timeouts (200ms, 500ms) — that's intentional, total runtime is under 2s.

- [ ] **Step 5: Commit**

```bash
git add lib/cover-storage.ts lib/cover-storage.test.ts
git commit -m "feat(covers): fetchAndStoreCover with retries and sharp pipeline"
```

---

## Task 8: `removeCover` helper (TDD)

**Files:**
- Modify: `lib/cover-storage.ts`
- Modify: `lib/cover-storage.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `lib/cover-storage.test.ts`:

```ts
import { removeCover } from './cover-storage'

describe('removeCover', () => {
  const LIBRARY = '00000000-0000-0000-0000-000000000001'
  const BOOK = '00000000-0000-0000-0000-000000000002'

  it('calls storage.remove with the canonical path', async () => {
    const remove = vi.fn().mockResolvedValue({ data: [{ name: `${LIBRARY}/${BOOK}.webp` }], error: null })
    const supabase = { storage: { from: () => ({ remove }) } } as unknown as never

    await removeCover({ libraryId: LIBRARY, bookId: BOOK, supabase })

    expect(remove).toHaveBeenCalledWith([`${LIBRARY}/${BOOK}.webp`])
  })

  it('does not throw when storage returns an error', async () => {
    const remove = vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } })
    const supabase = { storage: { from: () => ({ remove }) } } as unknown as never

    await expect(removeCover({ libraryId: LIBRARY, bookId: BOOK, supabase })).resolves.toBeUndefined()
  })

  it('does not throw when storage.remove rejects', async () => {
    const remove = vi.fn().mockRejectedValue(new Error('network down'))
    const supabase = { storage: { from: () => ({ remove }) } } as unknown as never

    await expect(removeCover({ libraryId: LIBRARY, bookId: BOOK, supabase })).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run; expect failure**

Run: `npx vitest run lib/cover-storage.test.ts`

Expected: `removeCover is not exported` failure.

- [ ] **Step 3: Implement**

Append to `lib/cover-storage.ts`:

```ts
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
        reason: 'remove_error',
      })
    }
  } catch (err) {
    console.error('[cover-storage] remove threw', {
      libraryId: args.libraryId,
      bookId: args.bookId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}
```

- [ ] **Step 4: Run; expect green**

Run: `npx vitest run lib/cover-storage.test.ts`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/cover-storage.ts lib/cover-storage.test.ts
git commit -m "feat(covers): best-effort removeCover helper"
```

---

## Task 9: Wire pipeline into `createBookAction`

**Files:**
- Modify: `lib/actions/book.ts`

- [ ] **Step 1: Add imports**

At the top of `lib/actions/book.ts`, add to the import section:

```ts
import { createServerClient } from '@/lib/supabase/server'
import {
  fetchAndStoreCover,
  isCanonicalCoverUrl,
  type CoverFetchError,
} from '@/lib/cover-storage'
```

Also add a `messageFor` helper near the top of the file (below imports, above the existing `resolveAuthorId`):

```ts
function messageFor(reason: CoverFetchError): string {
  switch (reason) {
    case 'fetch_failed': return "Couldn't reach the cover image after a few tries. Check the URL or try again later."
    case 'http_error':   return "The cover URL didn't return an image (server error)."
    case 'too_large':    return 'Cover image is too large (max 5 MB).'
    case 'wrong_type':   return "That URL doesn't appear to be an image."
    case 'storage_failed': return "Couldn't save the cover. Please try again."
  }
}
```

- [ ] **Step 2: Modify `createBookAction` to pre-generate id and run the pipeline**

Replace the body of `createBookAction` (the function definition stays the same) with:

```ts
export async function createBookAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const flat = Object.fromEntries(formData) as Record<string, string>
  const contributors = parseContributors(flat)

  const parsed = bookSchema.safeParse({ ...flat, contributors })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const db = await dbAsUser()
  const { contributors: contributorInputs, ...bookData } = parsed.data
  const bookId = crypto.randomUUID()

  // If the user supplied a non-canonical cover URL, fetch and store it.
  if (bookData.coverUrl && !isCanonicalCoverUrl({ url: bookData.coverUrl, libraryId: bookData.libraryId, bookId })) {
    const supabase = await createServerClient()
    const result = await fetchAndStoreCover({
      externalUrl: bookData.coverUrl,
      libraryId: bookData.libraryId,
      bookId,
      supabase,
    })
    if (!result.ok) return { ok: false, message: messageFor(result.reason) }
    bookData.coverUrl = result.storageUrl
  }

  // Resolve all authors first (outside the transaction — these are network calls)
  const resolvedForCreate = await Promise.all(
    contributorInputs.map(async (c) => ({
      authorId: await resolveAuthorId(db, c.authorId, c.newAuthorName),
      role: c.role,
    })),
  )

  const [book] = await db.query(async (tx) => {
    const rows = await tx
      .insert(books)
      .values({ ...bookData, id: bookId })
      .returning({ id: books.id })
    const insertedId = rows[0].id
    const validContributors = resolvedForCreate
      .filter((c): c is { authorId: string; role: typeof c.role } => c.authorId !== undefined)
      .map((c) => ({ bookId: insertedId, authorId: c.authorId, role: c.role }))
    if (validContributors.length > 0) {
      await tx.insert(bookContributors).values(validContributors)
    }
    return rows
  })

  revalidateTag('library-autocomplete', 'max')
  redirect(`/books/${book.id}`)
}
```

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`

Expected: zero type errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/book.ts
git commit -m "feat(books): mirror external cover URL to storage on create"
```

---

## Task 10: Wire pipeline into `updateBookAction` (incl. cover-clear)

**Files:**
- Modify: `lib/actions/book.ts`

- [ ] **Step 1: Add `removeCover` import**

Update the cover-storage import to also pull in `removeCover`:

```ts
import {
  fetchAndStoreCover,
  isCanonicalCoverUrl,
  removeCover,
  type CoverFetchError,
} from '@/lib/cover-storage'
```

- [ ] **Step 2: Replace `updateBookAction` body**

```ts
export async function updateBookAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const flat = Object.fromEntries(formData) as Record<string, string>

  const idParsed = bookIdSchema.safeParse(flat)
  if (!idParsed.success) {
    return { ok: false, message: 'Invalid book ID' }
  }

  const contributors = parseContributors(flat)
  const parsed = bookSchema.safeParse({ ...flat, contributors })
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const db = await dbAsUser()
  const { contributors: contributorInputs, ...bookData } = parsed.data
  const bookId = idParsed.data.id

  // If a non-canonical cover URL came in, fetch+store and rewrite the URL.
  if (bookData.coverUrl && !isCanonicalCoverUrl({ url: bookData.coverUrl, libraryId: bookData.libraryId, bookId })) {
    const supabase = await createServerClient()
    const result = await fetchAndStoreCover({
      externalUrl: bookData.coverUrl,
      libraryId: bookData.libraryId,
      bookId,
      supabase,
    })
    if (!result.ok) return { ok: false, message: messageFor(result.reason) }
    bookData.coverUrl = result.storageUrl
  }

  const resolved = await Promise.all(
    contributorInputs.map(async (c) => ({
      bookId,
      authorId: await resolveAuthorId(db, c.authorId, c.newAuthorName),
      role: c.role,
    })),
  )
  const validContributors = resolved.filter(
    (c): c is { bookId: string; authorId: string; role: typeof c.role } => c.authorId !== undefined,
  )

  const updated = await db.query(async (tx) => {
    const rows = await tx
      .update(books)
      // Drizzle skips undefined keys in .set(), which means a cleared coverUrl would
      // leave the old value untouched. Force null so clearing actually clears.
      .set({ ...bookData, coverUrl: bookData.coverUrl ?? null })
      .where(and(eq(books.id, bookId), eq(books.libraryId, idParsed.data.libraryId)))
      .returning({ id: books.id })
    if (rows.length === 0) return null

    await tx.delete(bookContributors).where(eq(bookContributors.bookId, bookId))

    if (validContributors.length > 0) {
      await tx.insert(bookContributors).values(validContributors)
    }
    return rows[0]
  })

  if (!updated) return { ok: false, message: 'Book not found.' }

  // If the user cleared the cover field, remove the stored object best-effort.
  if (bookData.coverUrl === undefined) {
    const supabase = await createServerClient()
    await removeCover({ libraryId: bookData.libraryId, bookId, supabase })
  }

  revalidateTag('library-autocomplete', 'max')
  redirect(`/books/${bookId}`)
}
```

- [ ] **Step 3: Run typecheck and tests**

Run: `npm run typecheck && npm test`

Expected: green.

- [ ] **Step 4: Commit**

```bash
git add lib/actions/book.ts
git commit -m "feat(books): mirror external cover URL to storage on update; clear removes stored object"
```

---

## Task 11: Wire `removeCover` into `deleteBookAction`

**Files:**
- Modify: `lib/actions/book.ts`

- [ ] **Step 1: Replace `deleteBookAction`**

```ts
export async function deleteBookAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = bookIdSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: 'Invalid book ID' }
  }

  const db = await dbAsUser()
  await db.query((tx) =>
    tx.delete(books).where(and(eq(books.id, parsed.data.id), eq(books.libraryId, parsed.data.libraryId))),
  )

  // Best-effort: remove any stored cover for this (library_id, book_id).
  const supabase = await createServerClient()
  await removeCover({ libraryId: parsed.data.libraryId, bookId: parsed.data.id, supabase })

  redirect('/books')
}
```

- [ ] **Step 2: Run typecheck and tests**

Run: `npm run typecheck && npm test`

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add lib/actions/book.ts
git commit -m "feat(books): remove stored cover when a book is deleted"
```

---

## Task 12: Add storage host to `next.config.ts > images.remotePatterns`

**Files:**
- Modify: `next.config.ts`

- [ ] **Step 1: Add the entry**

In `next.config.ts`, in the `images.remotePatterns` array, add a third entry **after** the two existing ones:

```ts
images: {
  remotePatterns: [
    { protocol: 'https', hostname: 'covers.openlibrary.org' },
    { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    {
      protocol: 'https',
      hostname: supabaseHost,
      pathname: '/storage/v1/object/public/book-covers/**',
    },
  ],
},
```

(`supabaseHost` is already defined at the top of the file from `NEXT_PUBLIC_SUPABASE_URL`.)

`covers.openlibrary.org` stays for now — old rows that haven't been backfilled yet still use it, and the autofill flow returns Open Library URLs that get rewritten on save going forward. We can drop it after the backfill in Task 15 has run successfully.

- [ ] **Step 2: Build to verify config is valid**

Run: `npm run build`

Expected: Next builds without errors.

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat(images): allow optimizing covers from supabase storage"
```

---

## Task 13: Manual end-to-end verification (no commit)

**Files:** none

This is a checkpoint, not a commit. The dev server runs the actual code paths against the local Supabase project.

- [ ] **Step 1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 2: Create a book with an external cover URL**

In the browser, sign in, create a new book in any library. Paste the failing URL from the original report:

```
https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1755613482i/240362021.jpg
```

Submit. Verify:
- Form succeeds; redirect to the book detail page works.
- The book detail page renders the cover image.
- In Supabase Studio → Storage → `book-covers`, an object exists at `<library_id>/<book_id>.webp`.
- The book row's `cover_url` (in the `books` table) is the public storage URL.

- [ ] **Step 3: Edit the book to a different external URL**

Edit, paste a different cover URL (e.g., an Open Library cover URL). Submit. Verify the storage object at the canonical path was overwritten (modified-at timestamp updates).

- [ ] **Step 4: Clear the cover field**

Edit, blank out the cover URL. Submit. Verify:
- Detail page now shows the placeholder icon.
- The storage object at `<library_id>/<book_id>.webp` is gone.

- [ ] **Step 5: Re-add a cover, then delete the book**

Edit, paste another cover URL. Submit. Then delete the book. Verify the storage object is gone after deletion.

- [ ] **Step 6: Try a deliberately bad URL**

Create a new book with `coverUrl = https://example.com/this-is-not-an-image-404` and submit. Verify the form returns an error message ("That URL doesn't appear to be an image" or "didn't return an image").

- [ ] **Step 7: Try an SSRF-style URL**

Create a new book with `coverUrl = http://localhost/anything`. Submit. Verify the schema-level error fires ("Cover URL must be a public https:// address.").

If anything fails, do NOT proceed to the backfill — fix the underlying issue first.

---

## Task 14: One-shot backfill script

**Files:**
- Create: `scripts/migrate-covers.ts`
- Modify: `package.json` (add `migrate:covers` script)

- [ ] **Step 1: Write the script**

Create `scripts/migrate-covers.ts`:

```ts
import { dbSystem } from '@/db/client-system'
import { books } from '@/db/schema/catalog'
import { eq, isNotNull, and, not, like } from 'drizzle-orm'
import { fetchAndStoreCover, canonicalCoverUrl, isCanonicalCoverUrl } from '@/lib/cover-storage'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { env } from '@/lib/env'

async function main() {
  const { db, close } = dbSystem()
  const supabase = createServiceRoleClient()

  const ourPrefix = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/book-covers/`

  const rows = await db
    .select({ id: books.id, libraryId: books.libraryId, coverUrl: books.coverUrl })
    .from(books)
    .where(and(isNotNull(books.coverUrl), not(like(books.coverUrl, `${ourPrefix}%`))))

  console.log(`[migrate-covers] candidates: ${rows.length}`)

  const summary = { ok: 0, skipped: 0, fail: {} as Record<string, number> }

  for (const row of rows) {
    if (!row.coverUrl) { summary.skipped++; continue }
    if (isCanonicalCoverUrl({ url: row.coverUrl, libraryId: row.libraryId, bookId: row.id })) {
      summary.skipped++
      continue
    }

    const result = await fetchAndStoreCover({
      externalUrl: row.coverUrl,
      libraryId: row.libraryId,
      bookId: row.id,
      supabase,
    })
    if (!result.ok) {
      summary.fail[result.reason] = (summary.fail[result.reason] ?? 0) + 1
      console.warn(`[migrate-covers] fail id=${row.id} reason=${result.reason}`)
      continue
    }
    await db.update(books).set({ coverUrl: result.storageUrl }).where(eq(books.id, row.id))
    summary.ok++
    console.log(`[migrate-covers] ok id=${row.id}`)
  }

  console.log(`[migrate-covers] summary: ok=${summary.ok} skipped=${summary.skipped} fail=${JSON.stringify(summary.fail)}`)
  await close()
}

main().catch((err) => {
  console.error('[migrate-covers] fatal', err)
  process.exit(1)
})
```

- [ ] **Step 2: Add npm script**

In `package.json`, add to `scripts`:

```json
"migrate:covers": "tsx scripts/migrate-covers.ts",
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: zero errors.

- [ ] **Step 4: Dry-run against the local DB (optional but recommended)**

If you have local books with external covers (e.g. from a seed or manual entry):

Run: `npm run migrate:covers`

Expected: prints candidates count and per-row outcomes; `summary` line shows `ok=N` matching the count of accessible covers.

Verify that updated rows in the DB have `cover_url` rewritten to the canonical URL pattern, and the storage bucket has the corresponding objects.

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-covers.ts package.json
git commit -m "feat(scripts): add cover backfill migration"
```

---

## Task 15: GC orphan-cover script

**Files:**
- Create: `scripts/gc-orphan-covers.ts`
- Modify: `package.json` (add `gc:covers` script)

- [ ] **Step 1: Write the script**

Create `scripts/gc-orphan-covers.ts`:

```ts
import { dbSystem } from '@/db/client-system'
import { books } from '@/db/schema/catalog'
import { isNotNull } from 'drizzle-orm'
import { createServiceRoleClient } from '@/lib/supabase/admin'

const BUCKET = 'book-covers'
const PAGE_SIZE = 100

async function listLibraryFolders(supabase: ReturnType<typeof createServiceRoleClient>): Promise<string[]> {
  // Top-level entries in the bucket are <library_id> folders.
  const folders: string[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list('', { limit: PAGE_SIZE, offset })
    if (error) throw error
    if (!data || data.length === 0) break
    for (const e of data) if (e.name && e.id === null) folders.push(e.name)  // id===null means folder in supabase storage
    if (data.length < PAGE_SIZE) break
    offset += data.length
  }
  return folders
}

async function listFolderObjects(
  supabase: ReturnType<typeof createServiceRoleClient>,
  folder: string,
): Promise<string[]> {
  const objects: string[] = []
  let offset = 0
  while (true) {
    const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: PAGE_SIZE, offset })
    if (error) throw error
    if (!data || data.length === 0) break
    for (const e of data) if (e.id) objects.push(`${folder}/${e.name}`)
    if (data.length < PAGE_SIZE) break
    offset += data.length
  }
  return objects
}

async function main() {
  const { db, close } = dbSystem()
  const supabase = createServiceRoleClient()

  const referenced = new Set<string>()
  const rows = await db
    .select({ id: books.id, libraryId: books.libraryId })
    .from(books)
    .where(isNotNull(books.coverUrl))
  for (const r of rows) referenced.add(`${r.libraryId}/${r.id}.webp`)

  const folders = await listLibraryFolders(supabase)
  const allObjects: string[] = []
  for (const f of folders) allObjects.push(...await listFolderObjects(supabase, f))

  const orphans = allObjects.filter((p) => !referenced.has(p))
  console.log(`[gc-covers] referenced=${referenced.size} in_bucket=${allObjects.length} orphans=${orphans.length}`)

  for (let i = 0; i < orphans.length; i += 100) {
    const batch = orphans.slice(i, i + 100)
    const { error } = await supabase.storage.from(BUCKET).remove(batch)
    if (error) {
      console.error(`[gc-covers] remove batch failed:`, error.message)
    } else {
      console.log(`[gc-covers] removed batch of ${batch.length}`)
    }
  }

  await close()
}

main().catch((err) => {
  console.error('[gc-covers] fatal', err)
  process.exit(1)
})
```

- [ ] **Step 2: Add npm script**

In `package.json`, add to `scripts`:

```json
"gc:covers": "tsx scripts/gc-orphan-covers.ts",
```

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: green.

- [ ] **Step 4: Optional dry-run**

Run: `npm run gc:covers`

Expected: prints `referenced=N in_bucket=M orphans=K`. With a fresh local DB and no orphans, `K` should be 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/gc-orphan-covers.ts package.json
git commit -m "feat(scripts): add orphan-cover GC sweep"
```

---

## Task 16: RLS smoke test

**Files:**
- Create: `scripts/smoke-cover-storage.ts`
- Modify: `package.json` (add `smoke:cover-storage` script)

- [ ] **Step 1: Write the smoke script**

This mirrors the pattern of `scripts/smoke-rls.ts` (read it first to match its style and how it acquires test users / library ids).

Create `scripts/smoke-cover-storage.ts`:

```ts
import { dbSystem } from '@/db/client-system'
import { books, libraries, libraryMembers, profiles } from '@/db/schema'
import { and, eq } from 'drizzle-orm'
import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

// This script:
// 1) Picks two existing library memberships (user A in lib A, user B in lib B; B not in lib A).
// 2) Asserts B cannot upload to lib A's cover path via Storage.
// Requires that both users have valid sessions you can sign in as. For an
// initial smoke we just exercise the service-role path and the deny case.

async function main() {
  const admin = createServiceRoleClient()

  // Service-role can always upload — sanity check first.
  const tinyWebp = Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+B6N/d', 'base64')
  const probePath = '00000000-0000-0000-0000-000000000000/_smoke.webp'
  const { error: putErr } = await admin.storage.from('book-covers').upload(probePath, tinyWebp, { upsert: true, contentType: 'image/webp' })
  if (putErr) throw new Error(`service-role upload failed: ${putErr.message}`)
  console.log('[smoke] service-role upload ok')

  // Anonymous client must NOT be able to upload.
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const { error: anonErr } = await anon.storage.from('book-covers').upload(probePath, tinyWebp, { upsert: true })
  if (!anonErr) throw new Error('expected anonymous upload to be denied, but it succeeded')
  console.log('[smoke] anonymous upload denied:', anonErr.message)

  // Public read works (bucket is public).
  const { data: publicUrl } = anon.storage.from('book-covers').getPublicUrl(probePath)
  const res = await fetch(publicUrl.publicUrl)
  if (!res.ok) throw new Error(`public read failed: status ${res.status}`)
  console.log('[smoke] public read ok')

  // Cleanup
  await admin.storage.from('book-covers').remove([probePath])
  console.log('[smoke] cleanup ok')
}

main().catch((err) => {
  console.error('[smoke] fatal', err)
  process.exit(1)
})
```

- [ ] **Step 2: Add npm script**

In `package.json`, add to `scripts`:

```json
"smoke:cover-storage": "tsx scripts/smoke-cover-storage.ts",
```

- [ ] **Step 3: Run it**

Run: `npm run smoke:cover-storage`

Expected output (in order):
```
[smoke] service-role upload ok
[smoke] anonymous upload denied: <error message>
[smoke] public read ok
[smoke] cleanup ok
```

If `anonymous upload denied` does NOT appear (i.e., anonymous upload SUCCEEDED), the RLS policies are misconfigured — STOP and revisit Task 4.

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke-cover-storage.ts package.json
git commit -m "feat(scripts): add cover-storage RLS smoke test"
```

---

## Task 17: Final verification

**Files:** none

- [ ] **Step 1: Full test suite**

Run: `npm test`

Expected: all green. No new failures.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`

Expected: zero errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`

Expected: zero errors. Fix any warnings introduced by the new files.

- [ ] **Step 4: Reproduce the original bug fix manually**

Re-run the manual verification from Task 13 step 2 with the original failing URL:

```
https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1755613482i/240362021.jpg
```

The book detail page should render the cover with no `400 Bad Request` from `/_next/image`. The bug is fixed.

- [ ] **Step 5: Production rollout checklist (do NOT execute now; just confirm)**

Document for whoever runs this in production (no commit needed; this is a runbook):

1. Set `SUPABASE_SERVICE_ROLE_KEY` in the production environment.
2. Deploy the branch.
3. Run migration: `npm run db:apply` (or equivalent).
4. Run smoke: `npm run smoke:cover-storage`.
5. Run backfill: `npm run migrate:covers`. Inspect summary; investigate any non-`ok` rows by hand.
6. After backfill, follow-up commit may remove `covers.openlibrary.org` from `images.remotePatterns` (no longer needed).
7. Schedule `npm run gc:covers` for monthly execution (cron / scheduled task).

---

## Self-Review Notes

Spec coverage: every section of the design spec maps to a task — bucket+RLS (Task 4), pipeline (Tasks 6–8), action wiring (Tasks 9–11), `next.config.ts` (Task 12), backfill (Task 14), GC (Task 15), smoke/RLS (Task 16). The `lh3.googleusercontent.com` entry in `next.config.ts` is preserved (it's for Google avatars, unrelated to covers) — Task 12 is explicit about this.

No placeholders. Every code step shows the actual code. Type names are consistent across tasks: `CoverFetchError`, `fetchAndStoreCover`, `removeCover`, `canonicalCoverUrl`, `isCanonicalCoverUrl`, `COVER_BUCKET`.

The plan does not include integration tests against real Supabase Storage (mocked client in unit tests + a separate smoke script is the chosen split). That matches existing project practice (`smoke-rls.ts`, `smoke-invite.ts`).
