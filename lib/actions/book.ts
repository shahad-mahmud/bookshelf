'use server'

import { redirect } from 'next/navigation'
import { revalidateTag } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { books, authors, bookContributors } from '@/db/schema/catalog'
import { bookSchema, bookIdSchema, isbnLookupSchema, parseContributors } from './book-schema'
import { lookupIsbn } from '@/lib/openlibrary'
import type { ActionState } from './library-schema'
import type { IsbnLookupState } from './book-schema'

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

  const [book] = await db.query((tx) =>
    tx.insert(books).values(bookData).returning({ id: books.id }),
  )

  // Resolve and insert contributors
  const resolved = await Promise.all(
    contributorInputs.map(async (c) => ({
      bookId: book.id,
      authorId: await resolveAuthorId(db, c.authorId, c.newAuthorName),
      role: c.role,
    })),
  )
  const validContributors = resolved.filter((c): c is { bookId: string; authorId: string; role: typeof c.role } => c.authorId !== undefined)

  if (validContributors.length > 0) {
    await db.query((tx) => tx.insert(bookContributors).values(validContributors))
  }

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

  const updated = await db.query((tx) =>
    tx
      .update(books)
      .set(bookData)
      .where(and(eq(books.id, idParsed.data.id), eq(books.libraryId, idParsed.data.libraryId)))
      .returning({ id: books.id }),
  )
  if (updated.length === 0) {
    return { ok: false, message: 'Book not found.' }
  }

  // Replace contributors: delete existing, insert fresh
  await db.query((tx) =>
    tx.delete(bookContributors).where(eq(bookContributors.bookId, idParsed.data.id)),
  )

  const resolved = await Promise.all(
    contributorInputs.map(async (c) => ({
      bookId: idParsed.data.id,
      authorId: await resolveAuthorId(db, c.authorId, c.newAuthorName),
      role: c.role,
    })),
  )
  const validContributors = resolved.filter((c): c is { bookId: string; authorId: string; role: typeof c.role } => c.authorId !== undefined)

  if (validContributors.length > 0) {
    await db.query((tx) => tx.insert(bookContributors).values(validContributors))
  }

  revalidateTag('library-autocomplete', 'max')
  redirect(`/books/${idParsed.data.id}`)
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
