'use server'

import { redirect } from 'next/navigation'
import { eq, and } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { borrowers } from '@/db/schema/catalog'
import { borrowerSchema, borrowerIdSchema } from './borrower-schema'
import type { ActionState } from './library-schema'

export async function createBorrowerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = borrowerSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const db = await dbAsUser()
  const [borrower] = await db.query((tx) =>
    tx.insert(borrowers).values(parsed.data).returning({ id: borrowers.id }),
  )

  redirect(`/borrowers/${borrower.id}`)
}

export async function updateBorrowerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const idParsed = borrowerIdSchema.safeParse(Object.fromEntries(formData))
  if (!idParsed.success) {
    return { ok: false, message: 'Invalid borrower ID' }
  }

  const parsed = borrowerSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const db = await dbAsUser()
  await db.query((tx) =>
    tx
      .update(borrowers)
      .set(parsed.data)
      .where(and(eq(borrowers.id, idParsed.data.id), eq(borrowers.libraryId, idParsed.data.libraryId))),
  )

  redirect(`/borrowers/${idParsed.data.id}`)
}

export async function deleteBorrowerAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = borrowerIdSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: 'Invalid borrower ID' }
  }

  try {
    const db = await dbAsUser()
    await db.query((tx) =>
      tx.delete(borrowers).where(
        and(eq(borrowers.id, parsed.data.id), eq(borrowers.libraryId, parsed.data.libraryId)),
      ),
    )
  } catch {
    return {
      ok: false,
      message:
        'Cannot delete: this borrower has loan history. Archive support arrives in a later spec.',
    }
  }

  redirect('/borrowers')
}
