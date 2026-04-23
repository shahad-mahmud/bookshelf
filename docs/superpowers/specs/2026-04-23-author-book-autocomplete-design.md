# Author & Book Title Autocomplete — Design Spec

**Date:** 2026-04-23
**Status:** Approved

## Overview

Add autocomplete suggestions to the `title` and `author` fields in `BookForm`. Selecting a book title auto-fills related fields. Author names are normalised into a dedicated `authors` table with alias support for multilingual names.

---

## 1. Schema

### New: `authors` table (global, not per-library)

```sql
CREATE TABLE authors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,   -- canonical/display name
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### New: `author_aliases` table

```sql
CREATE TABLE author_aliases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_author_aliases_author ON author_aliases(author_id);
```

Aliases store alternate spellings, transliterations, or scripts (e.g. "শহীদুল ইসলাম" aliasing "Shohidul Islam"). Managing aliases is deferred to a future author detail page.

### Modified: `books` table

- Add `author_id UUID REFERENCES authors(id) ON DELETE SET NULL` (nullable)
- Remove `author TEXT` column

### Migration script (`scripts/migrate-authors.ts`)

1. Read all distinct non-null `author` strings from `books`
2. Insert into `authors` (deduplicated by trimmed lowercase comparison, canonical name = first occurrence)
3. Backfill `books.author_id` by matching `books.author` → `authors.name`
4. Drop `books.author` column

---

## 2. Data Loading & Caching

### Loader: `lib/actions/book-autocomplete.ts`

```ts
getAutocompleteData(userId: string) → {
  authors: { id: string; name: string; aliases: string[] }[]
  libraryBooks: { id: string; title: string; authorId: string | null; authorName: string | null; isbn: string | null; coverUrl: string | null }[]
}
```

- **Authors** — global: all distinct authors from all libraries the user belongs to (joined with `author_aliases`)
- **Library books** — scoped to current library only (passed in via `libraryId`)
- Wrapped in `unstable_cache` with tag `library-autocomplete` and `revalidate: 300` (5 minutes)
- `createBookAction` / `updateBookAction` call `revalidateTag('library-autocomplete')` after each successful write for immediate cache busting

---

## 3. Components

### `components/ui/combobox.tsx` — shared primitive

A lightweight base built from shadcn `Popover` + a plain filtered list. No `cmdk`, no `Command` component. Handles:
- Open/close state
- Click-outside dismissal
- Dropdown positioning via `Popover` (avoids viewport clipping)

Props:
```ts
{
  value: string
  onChange: (value: string) => void
  options: { label: string; value: string; matchKeys?: string[] }[]
  placeholder?: string
  renderOption?: (option) => ReactNode
  footer?: ReactNode   // for "Create X" slot
}
```

### `components/book/author-combobox.tsx`

Thin wrapper over `Combobox`.

- Props: `authors: { id: string; name: string; aliases: string[] }[]`, `value`, `onChange`
- Filters against both `name` and all `aliases`; displays canonical `name`
- No match → shows "Create `<name>`" footer option
- Emits `{ type: 'existing'; id: string; name: string }` or `{ type: 'new'; name: string }`
- Renders a hidden `<input name="authorId">` or `<input name="newAuthorName">` for form submission

### `components/book/title-combobox.tsx`

Thin wrapper over `Combobox`.

- Props: `books: LibraryBook[]`, `value`, `onChange`, `onAutofill: (book: LibraryBook) => void`
- Filters by title (case-insensitive substring)
- On select: calls `onAutofill(book)` → parent populates author, isbn, coverUrl
- Free-text always allowed (no "create" needed — title is a plain string)

---

## 4. BookForm Changes

`BookForm` receives two new props:
```ts
authors: { id: string; name: string; aliases: string[] }[]
libraryBooks: LibraryBook[]
```

- `title` `<Input>` → `<TitleCombobox>` with `onAutofill` wired to populate `author`, `isbn`, `coverUrl` state (same state already used by `handleIsbnResult`)
- `author` `<Input>` → `<AuthorCombobox>` which manages hidden `authorId` / `newAuthorName` inputs

The autofill from title selection goes through the same `handleIsbnResult`-style state setters already in `BookForm`, so ISBN lookup and title autocomplete share the same fill path.

---

## 5. Server Action Changes

### `createBookAction` / `updateBookAction`

Accept either:
- `authorId` (UUID of existing author), or
- `newAuthorName` (string for a new author)

If `newAuthorName` is provided:
1. `INSERT INTO authors (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING id`
2. Fall back to a `SELECT id FROM authors WHERE name = $1` if the insert hit a conflict
3. Use resulting `id` as `authorId`

After successful write: `revalidateTag('library-autocomplete')`.

---

## 6. Page Changes

`app/books/new/page.tsx` and `app/books/[id]/edit/page.tsx`:
- Call `getAutocompleteData(userId, libraryId)` (server-side, cached)
- Pass `authors` and `libraryBooks` down to `BookForm`

---

## Out of Scope

- Author detail / management page (future)
- Alias management UI (future, part of author detail page)
- `BorrowerCombobox` refactor to use shared `Combobox` primitive (optional follow-up)
- Global book title suggestions across libraries (current library only by design)
