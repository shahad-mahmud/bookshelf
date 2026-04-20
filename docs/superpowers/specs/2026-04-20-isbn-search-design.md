# Spec 1.3 — ISBN Lookup + Book Search & Pagination

| | |
| --- | --- |
| **Date** | 2026-04-20 |
| **Project** | Bookshelf |
| **Spec** | 1.3 — ISBN auto-lookup via Open Library + server-side search/filter/pagination on `/books` |
| **Phase** | Phase 1, third of four catalog specs (1.1 ✓ → 1.2 ✓ → 1.3 ISBN+Search → 1.4 Lending) |
| **Status** | Approved — pending implementation |

---

## 1. Goals

- On the Add/Edit Book form, typing an ISBN and blurring the field (or clicking "Look up") fetches title, author, and cover URL from Open Library and prefills the form fields — without overwriting values the user has already entered.
- The `/books` list supports full-text search (title + author), acquisition filter (owned / wishlist / all), and numbered pagination (20 per page). All state lives in URL search params so links are shareable and the browser back button works.
- No changes to borrowers, loans, libraries, or any other area.

## 2. In-scope vs out-of-scope

**In scope:**
- `lib/openlibrary.ts` — Open Library API client (`lookupIsbn`)
- `lookupIsbnAction` Server Action
- `IsbnLookup` client component (auto-trigger on blur + explicit button)
- Wire ISBN lookup into `BookForm`
- `BookFilters` client component (search input + acquisition select)
- `Pagination` UI component (prev/next + numbered page links)
- `/books` page rewrite: reads `searchParams`, runs paginated Drizzle query
- Unit tests: `lib/openlibrary.test.ts`, extend `lib/actions/book-schema.test.ts`

**Out of scope:**
- Borrower search/pagination — deferred to a later spec
- GIN index on title/author — not needed at personal library scale
- Caching Open Library responses — not needed in v1
- Barcode scanning — non-goal for v1
- Any changes to lending, library management, or auth

## 3. Architecture

### 3.1 ISBN Lookup

**`lib/openlibrary.ts`**

Exports one function:

```ts
export type IsbnLookupResult = {
  title: string | null
  author: string | null
  coverUrl: string | null
}

export async function lookupIsbn(isbn: string): Promise<IsbnLookupResult | null>
```

Fetches `https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data`. Returns `null` on network error, non-200 response, or unknown ISBN (empty object response). Parses:
- `title` — `data.title`
- `author` — first entry of `data.authors[0].name`, or `null`
- `coverUrl` — `data.cover?.large ?? data.cover?.medium ?? null`

**`lib/actions/book-schema.ts`** — adds:

```ts
export const isbnLookupSchema = z.object({ isbn: z.string().min(1) })
```

**`lib/actions/book.ts`** — adds a dedicated return type and action:

```ts
export type IsbnLookupState =
  | { ok: true; result: IsbnLookupResult }
  | { ok: false; error: string }

export async function lookupIsbnAction(
  _state: IsbnLookupState | null,
  formData: FormData,
): Promise<IsbnLookupState>
```

Validates with `isbnLookupSchema`, calls `lookupIsbn`, returns `{ ok: true, result }` or `{ ok: false, error: '...' }`.

**`components/book/isbn-lookup.tsx`** — `'use client'` component:
- Renders an ISBN text input and a "Look up" button
- `useActionState` wired to `lookupIsbnAction`
- `onBlur` fires the action if the field has a value
- Button click fires the action explicitly
- Shows a spinner while pending
- On success calls `onResult(IsbnLookupResult)` prop
- On error shows an inline message below the input

**`components/book/book-form.tsx`** — modified:
- Renders `<IsbnLookup>` at the top of the form
- `onResult` callback fills title/author/coverUrl fields **only if currently empty**, preserving any user-typed values

### 3.2 Search, Filter & Pagination

**URL shape:** `/books?q=gatsby&status=owned&page=2`

All params optional. Defaults: `q=""`, `status="all"`, `page=1`. Page size: 20.

**`app/books/page.tsx`** — modified:

- Receives `searchParams: Promise<{ q?: string; status?: string; page?: string }>` and awaits it
- Builds Drizzle query:
  - `ILIKE '%q%'` applied as `sql\`(${books.title} || ' ' || coalesce(${books.author}, '')) ILIKE ${'%' + q + '%'}\`` when `q` is non-empty
  - `eq(books.acquisition, status)` when status is `owned` or `wishlist`
  - `count(*) OVER ()` window function for total row count in one query
  - `LIMIT 20 OFFSET (page-1)*20`
- Passes total count + current page to `<Pagination>`
- Passes current params to `<BookFilters>` for controlled state

**`components/book/book-filters.tsx`** — `'use client'`:
- Search input (text) and acquisition select (all / owned / wishlist)
- On change: `router.replace(buildUrl({ q, status, page: 1 }))` inside `startTransition`
- Shows subtle loading state during transition via `useTransition`

**`components/ui/pagination.tsx`** — presentational, no client JS:
- Receives `currentPage: number`, `totalPages: number`, `buildHref: (page: number) => string`
- Renders prev link, up to 7 page number links (with ellipsis for large ranges), next link
- Current page shown as non-link with distinct style
- Prev/next disabled (visually) when at boundary

## 4. Data flow

```
User types ISBN → IsbnLookup onBlur/button
  → lookupIsbnAction (Server Action)
    → lookupIsbn() → Open Library API
  → onResult({ title, author, coverUrl })
    → BookForm fills empty fields

User types in BookFilters
  → router.replace('/books?q=...&status=...&page=1')
    → BooksPage Server Component re-renders
      → Drizzle query (ILIKE + WHERE + LIMIT/OFFSET)
        → BookCard list + Pagination
```

## 5. Error handling

- Open Library unreachable or returns unexpected shape → `lookupIsbn` returns `null` → action returns `{ ok: false, error: 'ISBN lookup failed. Check the ISBN and try again.' }`
- Unknown ISBN (empty response object) → same error path, message: `'No book found for this ISBN.'`
- Invalid ISBN format (empty string) → Zod validation error before any fetch
- Search with no results → empty `allBooks` array → existing "No books yet" empty state (reuse, no new UI needed)

## 6. Testing

**`lib/openlibrary.test.ts`** (new):
- Valid response → returns `{ title, author, coverUrl }`
- Response missing cover → `coverUrl: null`
- Unknown ISBN (empty object `{}`) → returns `null`
- Network error (fetch throws) → returns `null`
- Uses `vi.stubGlobal('fetch', mockFn)` — no real HTTP calls

**`lib/actions/book-schema.test.ts`** (extend):
- `isbnLookupSchema` valid ISBN-10 (`"0141439580"`) → passes
- `isbnLookupSchema` valid ISBN-13 (`"9780141439587"`) → passes
- `isbnLookupSchema` empty string → rejects

## 7. No migrations

No DB schema changes. No new env vars. Existing `idx_books_library_acquisition` index is sufficient.
