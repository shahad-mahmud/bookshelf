# Cover Image Storage — Design Spec

**Date:** 2026-05-07
**Status:** Draft

## Overview

Replace the practice of storing arbitrary external image URLs in `books.cover_url` with a self-hosted pipeline: when a user submits a book whose cover URL is external, the server fetches the image, normalizes it through `sharp`, uploads to a public Supabase Storage bucket, and persists the resulting Supabase URL on the row. After this lands, every non-null `cover_url` resolves to an object we own.

**Motivation.** Today `books.cover_url` is a free-form text field. Users (and the OpenLibrary autofill) populate it with URLs from `covers.openlibrary.org`, `m.media-amazon.com` (Goodreads), and other hosts. `next/image` rejects any host not listed in `images.remotePatterns` with `400 Bad Request`, so covers from unlisted hosts simply don't render. The allowlist cannot scale to every host users might paste from, and external URLs rot over time.

**Scope.** Fetch-by-URL only. Direct device upload is intentionally out of scope for this spec (see *Out of Scope*).

---

## 1. Architecture

```
form submit (createBookAction / updateBookAction)
   │
   ├── parse + validate (existing zod, plus new SSRF refinement on coverUrl)
   │
   ├── if coverUrl is non-canonical (not exactly our public URL for this book):
   │     fetchAndStoreCover(externalUrl, libraryId, bookId)
   │       ├── fetch upstream  ← bounded retries on transient failure
   │       ├── sharp decode + resize + re-encode → WebP bytes
   │       ├── storage.upload (upsert) at <library_id>/<book_id>.webp
   │       └── return our public storage URL
   │     replace coverUrl in the DB write payload with the returned URL
   │     on any non-transient failure: return ActionState error, no row written
   │
   ├── if coverUrl is the canonical URL for this book: pass through unchanged
   ├── if coverUrl is null: pass through unchanged
   │
   └── DB transaction: insert/update books + contributors (existing flow)

deleteBookAction / cover-cleared:
   └── after DB commit, best-effort storage.remove([oldPath])
```

**Order of operations.** Storage upload happens *before* the DB write. A failed DB write after a successful upload leaves an orphan storage object, cleaned up later by GC. The reverse ordering would risk a row pointing at an object that does not yet exist.

For `updateBookAction`, the canonical path `<library_id>/<book_id>.webp` is overwritten with `upsert: true`, so a successful upload atomically replaces the prior object — no explicit removal needed in the common case. Removal is only required when `cover_url` transitions to `null` (user cleared the field) or on book delete. The path is deterministic from `(libraryId, bookId)`, so `removeCover` does not need the previous DB value — it computes the path itself and tolerates missing-object errors.

**Canonical URL invariant.** Every non-null `books.cover_url` MUST equal the canonical public URL for that exact `(library_id, book_id)`. If the incoming submission's `coverUrl` is anything else — external host, our host but a different bucket, our host but a different book's path, even our host with extra query params — the action treats it as non-canonical and runs the fetch-and-store pipeline. This guarantees a 1:1 relationship between books rows and storage objects, which keeps GC simple and avoids cross-book object sharing from accidental copy-paste.

---

## 2. Storage layout

**Bucket:** `book-covers`, public.

**Path:** `<library_id>/<book_id>.webp` — one object per book, library-scoped folder.

**Public URL:** `https://<project>.supabase.co/storage/v1/object/public/book-covers/<library_id>/<book_id>.webp`

The first path segment is the library UUID, which is what the Storage RLS policies key on (see §3).

---

## 3. RLS for `storage.objects`

`SELECT` is implicit (bucket is public). `INSERT`, `UPDATE`, `DELETE` are restricted to library members via `fn_library_access`, mirroring the policy pattern on `books`:

```sql
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

`fn_library_access` is already `SECURITY DEFINER` (see `db/migrations/0003_rls_policies.sql`).

---

## 4. Modules & files

### New: `lib/cover-storage.ts`

Single source of truth for the fetch → process → upload pipeline. Marked `'server-only'`.

```ts
export type CoverFetchError =
  | 'fetch_failed'    // exhausted retries on transient errors
  | 'http_error'      // non-2xx, non-transient
  | 'too_large'       // > MAX_BYTES
  | 'wrong_type'      // MIME wrong, or sharp can't decode
  | 'storage_failed'  // upload to bucket errored

export async function fetchAndStoreCover(args: {
  externalUrl: string
  libraryId: string
  bookId: string
}): Promise<{ ok: true; storageUrl: string } | { ok: false; reason: CoverFetchError }>

export async function removeCover(args: {
  libraryId: string
  bookId: string
}): Promise<void>  // best-effort, swallows errors

// Canonical = exact match for `<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/public/book-covers/<libraryId>/<bookId>.webp`
// (no query string, no extra path segments).
export function isCanonicalCoverUrl(args: {
  url: string
  libraryId: string
  bookId: string
}): boolean

export function canonicalCoverUrl(args: { libraryId: string; bookId: string }): string
```

Internal helpers (private to the module): `fetchWithRetry`, `decodeAndResize`, `uploadToBucket`.

### Modified: `lib/actions/book.ts`

`createBookAction` and `updateBookAction` gain a step between zod validation and the DB transaction:

```ts
// always pre-generate id (no conditional branch) so the storage path is known before insert
const bookId = isUpdate ? idParsed.data.id : crypto.randomUUID()

const incomingUrl = parsed.data.coverUrl
if (incomingUrl && !isCanonicalCoverUrl({ url: incomingUrl, libraryId: parsed.data.libraryId, bookId })) {
  const result = await fetchAndStoreCover({
    externalUrl: incomingUrl,
    libraryId: parsed.data.libraryId,
    bookId,
  })
  if (!result.ok) return { ok: false, message: messageFor(result.reason) }
  parsed.data.coverUrl = result.storageUrl
}
```

`createBookAction` now passes an explicit `id: bookId` into `INSERT INTO books`, opting out of the column default. The pre-generation is unconditional (even for books with no cover) to keep the action's control flow flat.

`updateBookAction` additionally handles cover-cleared: when `parsed.data.coverUrl` is null/undefined after parsing, call `removeCover({ libraryId, bookId })` after the DB commit succeeds. No need to read the previous row value — the path is deterministic, and `removeCover` is best-effort and tolerates missing objects.

`deleteBookAction` calls `removeCover` after the DB delete returns, with the same deterministic-path logic.

`messageFor(reason)` is a small private map → user-facing string.

### Modified: `lib/actions/book-schema.ts`

`coverUrl` zod refinement adds defense-in-depth SSRF rejection at the string level:

- Scheme must be `https:`.
- Host must not be a literal IP (v4 or v6).
- Host must not be `localhost` or any case variation.
- Host must not be a private/reserved name (`*.local`, `*.internal`, `*.localhost`).

This is a pre-fetch defense; the fetch itself runs from Vercel's egress and cannot reach the project's private network. We are *not* resolving DNS at validation time (TOCTOU window).

### New: `db/migrations/0012_cover_storage.sql`

1. `INSERT INTO storage.buckets (id, name, public) VALUES ('book-covers', 'book-covers', true) ON CONFLICT (id) DO NOTHING`
2. The three RLS policies above on `storage.objects`.

### Modified: `next.config.ts`

Add a third entry to `images.remotePatterns`, scoped narrowly:

```ts
{
  protocol: 'https',
  hostname: supabaseHost,
  pathname: '/storage/v1/object/public/book-covers/**',
}
```

The CSP `img-src` already lists `https://${supabaseHost}` — no change needed.

The two existing entries (`covers.openlibrary.org`, `lh3.googleusercontent.com`) stay: `lh3` is for Google avatars (unrelated to covers); `covers.openlibrary.org` stays only until the backfill script has run, then is removed in a follow-up commit.

### New: `scripts/migrate-covers.ts`

One-shot backfill, run via `tsx` after deploy.

```
SELECT id, library_id, cover_url FROM books
 WHERE cover_url IS NOT NULL
   AND cover_url NOT LIKE 'https://<our-host>/storage/v1/object/public/book-covers/%'

for each row:
  result = fetchAndStoreCover({ externalUrl, libraryId, bookId: id })
  if ok:  UPDATE books SET cover_url = result.storageUrl WHERE id = ...
  else:   log { id, libraryId, externalHost, reason }; leave row unchanged

print summary: {succeeded, failed_by_reason}
```

Uses `dbSystem` (service role) to bypass RLS during backfill. Idempotent — re-runs skip rows already migrated.

### New: `scripts/gc-orphan-covers.ts`

Periodic / manual orphan sweep.

```
referenced = SELECT library_id, id FROM books WHERE cover_url IS NOT NULL
            → set of canonical paths "<library_id>/<id>.webp"

in-bucket  = paginated walk over storage.list('book-covers', { limit, offset })
              for each library_id folder, list its objects
              follow pagination cursor until exhausted

orphans    = in-bucket paths - referenced paths
storage.remove(orphans) in batches of 100
print summary
```

Supabase Storage `list()` is paginated; the script must follow the cursor (or use `limit`/`offset`) until no rows return. Uses `dbSystem` (service role) for both the SQL select and the storage list, since listing across libraries violates RLS for any single user. Manual invocation initially; can be wired to a cron later.

The script computes referenced paths from `(library_id, id)` rather than parsing `cover_url`, so it stays correct even if a row's `cover_url` has been corrupted to a non-canonical value (which the canonical-URL invariant prevents at write time, but GC should be robust regardless).

---

## 5. Validation, security, and budgets

### URL validation (pre-fetch)

Enforced in `book-schema.ts` before the action accepts the input:
- Scheme `https:` only.
- Host is not a literal IPv4/IPv6.
- Host is not `localhost`, nor matches `*.local`, `*.internal`, `*.localhost`.

### Fetch budget

- Per-attempt timeout: **5s** via `AbortSignal.timeout(5000)`.
- Up to **3 attempts** total. Backoffs: 200ms, 500ms, 1000ms. Worst-case wall time ≈ 16s; typical happy path < 1s.
- Retry on: `AbortError`, fetch threw, HTTP 408/429/500/502/503/504.
- No retry on: other 4xx, MIME mismatch, sharp decode failure, oversized payload, storage error.

### Size budget

- Reject up-front if `Content-Length` exceeds **5 MB**.
- During streaming, abort if running total exceeds 5 MB even when `Content-Length` was absent.
- Reject if body is empty (0 bytes).

### MIME validation

- `Content-Type` must start with `image/`.
- `sharp` is the real validator — it parses the bytes and throws on anything not decodable.

### `sharp` config

```ts
sharp(buffer, { failOn: 'error', limitInputPixels: 24_000_000 })
  .rotate()                              // apply EXIF orientation, strip metadata
  .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
  .webp({ quality: 80, effort: 4 })
  .toBuffer()
```

- `failOn: 'error'` blocks partial/truncated images.
- `limitInputPixels: 24_000_000` blocks decompression bombs (24 MP cap; covers fit in 1.44 MP).
- Output always WebP.

### Upload metadata

- `contentType: 'image/webp'`
- `cacheControl: 'public, max-age=31536000, immutable'` (path is overwritten on cover change; Next's optimizer adds its own cache layer)
- `upsert: true`

### Error → user-message map

| `CoverFetchError` | user-facing |
|---|---|
| `fetch_failed` | "Couldn't reach the cover image after a few tries. Check the URL or try again later." |
| `http_error` | "The cover URL didn't return an image (server error)." |
| `too_large` | "Cover image is too large (max 5 MB)." |
| `wrong_type` | "That URL doesn't appear to be an image." |
| `storage_failed` | "Couldn't save the cover. Please try again." |

Returned as `{ ok: false, message }` to match the existing `ActionState` shape; existing form error rendering surfaces it without UI changes.

### Logging

- Non-transient failures: one `console.error` log with `{ libraryId, bookId, externalHost, reason }`. Host only, never the full URL or path.
- Transient retries: only the final outcome is logged, not per-attempt.

---

## 6. Testing

### Unit (`vitest`)

- `lib/cover-storage.test.ts`
  - happy path: small JPEG fixture → stored as WebP, returns canonical URL
  - retry on transient fetch error → succeeds on attempt 2
  - retry exhaustion → returns `fetch_failed`
  - 404 → returns `http_error` with no retry
  - oversized via `Content-Length` → returns `too_large` with no body read
  - oversized via streaming (no `Content-Length`) → returns `too_large`
  - non-image MIME → returns `wrong_type`
  - sharp decode fails on garbage bytes → returns `wrong_type`
  - decompression bomb (exceeds `limitInputPixels`) → returns `wrong_type`
  - EXIF orientation present → output is auto-rotated, metadata stripped
  - storage upload error → returns `storage_failed`
  - `isCanonicalCoverUrl`:
    - exact canonical URL for matching `(libraryId, bookId)` → true
    - canonical URL for a different `bookId` → false
    - canonical URL for a different `libraryId` → false
    - canonical URL with extra query string → false
    - same host but different bucket → false
    - external host → false
- `lib/actions/book-schema.test.ts` — extend with SSRF rejection cases (`http://`, `file://`, `javascript:`, `localhost`, `127.0.0.1`, `[::1]`, `192.168.x`, IP literals, `*.local`).

### Integration / smoke

- `scripts/smoke-cover-storage.ts` (new) — exercises the full pipeline against a real Supabase instance: as user A, create a book in library A, verify object exists at `<libA>/<bookId>.webp` and `cover_url` is the storage URL. Then as user B (not in library A), attempt to upload to `<libA>/...` directly via storage API — expect RLS denial. Mirrors the pattern in `scripts/smoke-rls.ts`.

### Manual

- Browser flow: create book, paste `m.media-amazon.com` Goodreads URL, save, verify cover renders via `<BookCover>`.
- ISBN autofill flow: scan/paste ISBN, accept autofill, save, verify cover is stored.
- Edit flow: edit a book, change cover URL, save, verify storage object overwritten and `cover_url` updated.
- Clear flow: edit a book, clear cover URL, save, verify storage object removed.
- Delete flow: delete a book with a cover, verify storage object removed.

---

## 7. Rollout

1. Land migration `0012_cover_storage.sql` (creates bucket + policies).
2. Land `lib/cover-storage.ts`, action changes, `next.config.ts` change, schema refinement.
3. Verify in staging via the manual flows above.
4. Run `scripts/migrate-covers.ts` against production. Inspect summary; investigate any failures by hand.
5. Once backfill is clean, follow-up commit removes `covers.openlibrary.org` from `images.remotePatterns` (no longer needed).
6. `scripts/gc-orphan-covers.ts` is run manually for the first month to confirm no unexpected orphans accumulate; later wired to a schedule if desired.

---

## 8. Out of scope

- Direct device upload (drag-and-drop, file picker). Future spec.
- Cover cropping / focal-point selection in the UI.
- Auto-fetching covers from sources beyond what the user pastes (e.g., scraping Amazon by ISBN). Out of scope; this spec only mirrors URLs the user has already chosen.
- Per-user cover history / undo.
- Migrating off the public bucket if covers later become sensitive — would require a separate spec for signed-URL or RLS-read-protected designs.
- CDN-level cache invalidation on cover change (relying on the `immutable` `Cache-Control` plus path-overwrite behavior of Supabase Storage; if stale-cache problems show up in practice, address then).

---

## 9. Open questions

None at spec time — all architectural branches resolved during brainstorming.
