# Multi-Contributor Books — Design Spec

**Date:** 2026-04-23
**Status:** Approved

## Overview

Replace the single `books.author_id` FK with a `book_contributors` junction table, allowing a book to have multiple contributors across four roles: author, translator, editor, illustrator. The form shows Authors by default with a progressive-disclosure toggle for the other roles.

---

## 1. Schema

### New: `contributor_role` enum

```sql
CREATE TYPE contributor_role AS ENUM ('author', 'translator', 'editor', 'illustrator');
```

### New: `book_contributors` table

```sql
CREATE TABLE book_contributors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id    UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  author_id  UUID NOT NULL REFERENCES authors(id) ON DELETE RESTRICT,
  role       contributor_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (book_id, author_id, role)
);
CREATE INDEX idx_book_contributors_book ON book_contributors(book_id);
CREATE INDEX idx_book_contributors_author ON book_contributors(author_id);
```

`ON DELETE RESTRICT` on `author_id` prevents deleting an author who is still linked to a book. `UNIQUE (book_id, author_id, role)` prevents the same person appearing twice in the same role on the same book.

### Modified: `books` table

- Drop `author_id` column
- Migration: for each book with a non-null `author_id`, insert one row into `book_contributors` with `role = 'author'`

### Unchanged

`authors` and `author_aliases` tables are untouched.

---

## 2. Data Loading & Caching

### `lib/actions/book-autocomplete.ts`

The `LibraryBook` type gains a `contributors` array:

```ts
type ContributorRole = 'author' | 'translator' | 'editor' | 'illustrator'

type LibraryBook = {
  id: string
  title: string
  isbn: string | null
  coverUrl: string | null
  contributors: { authorId: string; authorName: string; role: ContributorRole }[]
}
```

The library books query LEFT JOINs `book_contributors` + `authors`, then groups rows by `book_id` in application code (or uses a subquery/aggregate).

Authors for autocomplete are still fetched globally across all user libraries — unchanged.

Cache tag `library-autocomplete`, TTL 300s, `revalidateTag('library-autocomplete', 'max')` after every write — unchanged.

---

## 3. Form UI

### `ContributorRowList` (`components/book/contributor-row-list.tsx`)

A reusable component that renders a dynamic list of `AuthorCombobox` rows for a single role. Props:

```ts
{
  role: ContributorRole
  authors: AuthorOption[]
  initial: { authorId: string; authorName: string }[]
}
```

Renders one row per initial contributor (minimum one empty row for Authors, zero for other roles). Each row has an × remove button. An "Add [role]" link at the bottom appends a new empty row. Each row's hidden inputs follow the pattern:

```html
<input name="contributors[N][role]"          value="author" />
<input name="contributors[N][authorId]"       value="uuid" />     <!-- if existing -->
<input name="contributors[N][newAuthorName]"  value="Name" />     <!-- if new -->
```

Where `N` is a monotonically increasing index across ALL contributor rows in the form (not per-role).

### `BookForm` (`components/book/book-form.tsx`)

- Replaces the single `AuthorCombobox` with `<ContributorRowList role="author" />` — always visible
- Below the Authors section: a `<button type="button">+ Add translator / editor / illustrator</button>` link
- Clicking reveals three additional `ContributorRowList` sections (translator, editor, illustrator) — hidden via `useState`, revealed permanently once clicked
- The revealed sections start with zero rows each; the "Add [role]" link within each adds the first row

### Title autofill

When a book is selected from `TitleCombobox`, `handleAutofill` passes the book's `contributors` array to populate the form. For each contributor: if `role === 'author'`, set the Authors section; otherwise reveal the extra sections and populate the matching role.

### New props on `BookForm`

```ts
allAuthors: AuthorOption[]
libraryBooks: LibraryBook[]   // updated type (contributors array)
```

`currencies` and mode/initial props are unchanged.

---

## 4. Server Actions

### `book-schema.ts`

Remove `authorId` and `newAuthorName` top-level fields. Add:

```ts
contributors: z.array(
  z.object({
    authorId: z.preprocess(emptyToUndef, z.uuid().optional()),
    newAuthorName: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
    role: z.enum(['author', 'translator', 'editor', 'illustrator']),
  })
).default([])
```

Parsing repeating form fields: `contributors[0][role]`, `contributors[0][authorId]`, etc. A helper function extracts the indexed array from `Object.fromEntries(formData)`.

### `book.ts`

**`createBookAction`:**
1. Parse contributors array
2. For each contributor: call `resolveAuthorId` to get/create author
3. Insert book
4. Insert all `book_contributors` rows in one batch
5. `revalidateTag('library-autocomplete', 'max')`

**`updateBookAction`:**
1. Parse contributors array
2. Resolve all author IDs
3. Update book
4. DELETE existing `book_contributors` WHERE `book_id = ?`
5. INSERT fresh `book_contributors` rows
6. `revalidateTag('library-autocomplete', 'max')`

`resolveAuthorId` helper is unchanged.

---

## 5. Display

### `BookCard` (`components/book/book-card.tsx`)

- Receives `contributors: { authorName: string; role: ContributorRole }[]` instead of `authorName?: string | null`
- Displays comma-joined names of `role === 'author'` contributors only
- If no authors, nothing shown

### Books list page (`app/books/page.tsx`)

- Query joins `book_contributors` + `authors`, aggregates contributors per book
- Passes contributor array to `BookCard`
- Search: matches on any contributor name (author, translator, etc.) via the join

### Book detail page (`app/books/[id]/page.tsx`)

Contributors rendered grouped by role:

- **No label** for `author` — displayed as the primary line (comma-joined)
- **"Translated by"** for `translator`
- **"Edited by"** for `editor`
- **"Illustrated by"** for `illustrator`

Only non-empty role groups are shown.

---

## 6. RLS & Migration

### Migration SQL (two files)

**`0010_book_contributors.sql`** (generated by drizzle-kit + edited):
1. Create `contributor_role` enum
2. Create `book_contributors` table + indexes
3. Backfill: `INSERT INTO book_contributors (book_id, author_id, role) SELECT id, author_id, 'author' FROM books WHERE author_id IS NOT NULL`
4. Drop `books.author_id`

**`0011_book_contributors_rls.sql`** (manual):
- Enable + force RLS on `book_contributors`
- `book_contributors_select`: `USING (fn_library_access((SELECT library_id FROM books WHERE id = book_id)))`
- `book_contributors_insert`: same check
- `book_contributors_delete`: same check

---

## Out of Scope

- Contributor ordering / sort position (not needed — user confirmed order does not matter)
- Adding new contributor roles beyond the four defined (schema can be extended via migration later)
- Contributor detail pages (future)
- Bulk-editing contributors outside the book form
