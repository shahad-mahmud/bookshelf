'use server'

import { redirect } from 'next/navigation'
import { revalidateTag } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { books, authors, bookContributors } from '@/db/schema/catalog'
import { bookSchema, bookIdSchema, isbnLookupSchema, parseContributors } from './book-schema'
import { lookupIsbn } from '@/lib/openlibrary'
import { createServerClient } from '@/lib/supabase/server'
import {
  fetchAndStoreCover,
  isCanonicalCoverUrl,
  removeCover,
  type CoverFetchError,
} from '@/lib/cover-storage'
import type { ActionState } from './library-schema'
import type { IsbnLookupState } from './book-schema'

function messageFor(reason: CoverFetchError): string {
  switch (reason) {
    case 'fetch_failed': return "Couldn't reach the cover image after a few tries. Check the URL or try again later."
    case 'http_error':   return "The cover URL didn't return an image (server error)."
    case 'too_large':    return 'Cover image is too large (max 5 MB).'
    case 'wrong_type':   return "That URL doesn't appear to be an image."
    case 'storage_failed': return "Couldn't save the cover. Please try again."
  }
}

async function resolveAuthorId(
  db: Awaited<ReturnType<typeof dbAsUser>>,
  authorId: string | undefined,
  newAuthorName: string | undefined,
): Promise<string | undefined> {
  if (authorId) return authorId
  if (!newAuthorName) return undefined

  const inserted = await db.query((tx) =>
    tx.insert(authors).values({ name: newAuthorName }).onConflictDoNothing().returning({ id: authors.id }),
  )
  if (inserted.length > 0) return inserted[0].id

  const existing = await db.query((tx) =>
    tx.select({ id: authors.id }).from(authors).where(eq(authors.name, newAuthorName)).limit(1),
  )
  return existing[0]?.id
}

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

export async function lookupIsbnAction(
  _state: IsbnLookupState | null,
  formData: FormData,
): Promise<IsbnLookupState> {
  const parsed = isbnLookupSchema.safeParse({ isbn: formData.get('isbn') })
  if (!parsed.success) {
    return { ok: false, error: 'ISBN is required.' }
  }
  const result = await lookupIsbn(parsed.data.isbn)
  if (!result) {
    return { ok: false, error: 'No book found for this ISBN.' }
  }
  return { ok: true, result }
}
