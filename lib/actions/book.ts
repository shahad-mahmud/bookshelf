'use server'

import { redirect } from 'next/navigation'
import { revalidateTag } from 'next/cache'
import { eq, and } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { books, authors } from '@/db/schema/catalog'
import { bookSchema, bookIdSchema, isbnLookupSchema } from './book-schema'
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
  const parsed = bookSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const db = await dbAsUser()
  const { authorId: rawAuthorId, newAuthorName, ...bookData } = parsed.data

  const authorId = await resolveAuthorId(db, rawAuthorId, newAuthorName)

  const [book] = await db.query((tx) =>
    tx.insert(books).values({ ...bookData, authorId }).returning({ id: books.id }),
  )

  revalidateTag('library-autocomplete')
  redirect(`/books/${book.id}`)
}

export async function updateBookAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const idParsed = bookIdSchema.safeParse(Object.fromEntries(formData))
  if (!idParsed.success) {
    return { ok: false, message: 'Invalid book ID' }
  }

  const parsed = bookSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const db = await dbAsUser()
  const { authorId: rawAuthorId, newAuthorName, ...bookData } = parsed.data

  const authorId = await resolveAuthorId(db, rawAuthorId, newAuthorName)

  await db.query((tx) =>
    tx
      .update(books)
      .set({ ...bookData, authorId })
      .where(and(eq(books.id, idParsed.data.id), eq(books.libraryId, idParsed.data.libraryId))),
  )

  revalidateTag('library-autocomplete')
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
