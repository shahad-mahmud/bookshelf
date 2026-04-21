'use server'

import { revalidatePath } from 'next/cache'
import { eq, and, isNull } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { loans, borrowers } from '@/db/schema/catalog'
import { lendSchema, returnSchema } from './loan-schema'
import type { ActionState } from './library-schema'

export async function lendBookAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = lendSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const {
    libraryId, bookId, borrowerId, newBorrowerName, newBorrowerContact,
    lentDate, expectedReturnDate, notes,
  } = parsed.data

  const db = await dbAsUser()

  try {
    await db.query(async (tx) => {
      let resolvedBorrowerId: string

      if (newBorrowerName) {
        const [b] = await tx
          .insert(borrowers)
          .values({ libraryId, name: newBorrowerName, contact: newBorrowerContact })
          .returning({ id: borrowers.id })
        resolvedBorrowerId = b.id
      } else if (borrowerId) {
        resolvedBorrowerId = borrowerId
      } else {
        throw new Error('No borrower specified')
      }

      await tx.insert(loans).values({
        libraryId,
        bookId,
        borrowerId: resolvedBorrowerId,
        lentDate,
        expectedReturnDate,
        notes,
      })
    })
  } catch (err: unknown) {
    if (
      err != null &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code: unknown }).code === '23505' &&
      'constraint_name' in err &&
      (err as { constraint_name: unknown }).constraint_name === 'idx_loans_one_active'
    ) {
      return { ok: false, message: 'This book already has an active loan.' }
    }
    throw err
  }

  revalidatePath(`/books/${bookId}`)
  revalidatePath('/')
  return { ok: true }
}

export async function returnBookAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = returnSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid data' }
  }

  const { loanId, bookId, libraryId } = parsed.data
  const today = new Date().toISOString().slice(0, 10)

  const db = await dbAsUser()
  await db.query((tx) =>
    tx
      .update(loans)
      .set({ returnedDate: today })
      .where(and(eq(loans.id, loanId), eq(loans.libraryId, libraryId), isNull(loans.returnedDate))),
  )

  revalidatePath(`/books/${bookId}`)
  revalidatePath('/')
  return { ok: true }
}
