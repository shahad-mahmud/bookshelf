'use server'

import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { books } from '@/db/schema/catalog'
import { bookSchema, bookIdSchema } from './book-schema'
import type { ActionState } from './library-schema'

export async function createBookAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = bookSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const db = await dbAsUser()
  const [book] = await db.query((tx) =>
    tx.insert(books).values(parsed.data).returning({ id: books.id }),
  )

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
  await db.query((tx) =>
    tx
      .update(books)
      .set(parsed.data)
      .where(and(eq(books.id, idParsed.data.id), eq(books.libraryId, idParsed.data.libraryId))),
  )

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
