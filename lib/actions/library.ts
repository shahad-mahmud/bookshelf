'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { eq, and, sql } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { libraries, libraryMembers } from '@/db/schema/libraries'
import { CURRENT_LIBRARY_COOKIE } from '@/lib/library/current'
import {
  libraryNameSchema,
  libraryIdSchema,
  deleteLibrarySchema,
  transferOwnershipSchema,
  removeMemberSchema,
  type ActionState,
} from './library-schema'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export async function createLibraryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = libraryNameSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid name' }
  }

  const db = await dbAsUser()
  const newId = await db.query(async (tx) => {
    // Create library (RLS: created_by = auth.uid()).
    const [lib] = await tx
      .insert(libraries)
      .values({ name: parsed.data.name, createdBy: sql`auth.uid()` })
      .returning({ id: libraries.id })
    // Become owner (RLS: members_insert_initial_owner).
    await tx.insert(libraryMembers).values({
      libraryId: lib.id,
      userId: sql`auth.uid()`,
      role: 'owner',
    })
    return lib.id
  })

  // Switch to the new library.
  const cookieStore = await cookies()
  cookieStore.set(CURRENT_LIBRARY_COOKIE, newId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })

  revalidatePath('/', 'layout')
  redirect(`/libraries/${newId}/settings`)
}

export async function renameLibraryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const entries = Object.fromEntries(formData)
  const idParse = libraryIdSchema.safeParse({ id: entries.id })
  const nameParse = libraryNameSchema.safeParse({ name: entries.name })
  if (!idParse.success || !nameParse.success) {
    return { ok: false, message: 'Invalid input' }
  }

  const db = await dbAsUser()
  await db.query(async (tx) => {
    // RLS libraries_update permits owner or admin.
    await tx.update(libraries).set({ name: nameParse.data.name }).where(eq(libraries.id, idParse.data.id))
  })

  revalidatePath('/', 'layout')
  return { ok: true, message: 'Renamed.' }
}

export async function deleteLibraryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = deleteLibrarySchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: 'Invalid input' }
  }

  const db = await dbAsUser()
  const result = await db.query(async (tx) => {
    // Verify the confirmation name matches.
    const [lib] = await tx
      .select({ name: libraries.name })
      .from(libraries)
      .where(eq(libraries.id, parsed.data.id))
      .limit(1)
    if (!lib) return { ok: false as const, message: 'Library not found or not authorized.' }
    if (lib.name !== parsed.data.confirmName) {
      return { ok: false as const, message: 'Confirmation name did not match.' }
    }
    // RLS libraries_delete permits owner only.
    await tx.delete(libraries).where(eq(libraries.id, parsed.data.id))
    return { ok: true as const }
  })

  if (!result.ok) return result

  // Clear the cookie so getCurrentLibrary picks a fallback next request.
  const cookieStore = await cookies()
  cookieStore.delete(CURRENT_LIBRARY_COOKIE)
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function setCurrentLibraryAction(libraryId: string): Promise<void> {
  const parsed = libraryIdSchema.safeParse({ id: libraryId })
  if (!parsed.success) return

  const db = await dbAsUser()
  const authorized = await db.query(async (tx) => {
    const rows = await tx
      .select({ id: libraryMembers.libraryId })
      .from(libraryMembers)
      .where(
        and(
          eq(libraryMembers.libraryId, parsed.data.id),
          eq(libraryMembers.userId, sql`auth.uid()`),
        ),
      )
      .limit(1)
    return rows.length > 0
  })
  if (!authorized) return

  const cookieStore = await cookies()
  cookieStore.set(CURRENT_LIBRARY_COOKIE, parsed.data.id, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
  revalidatePath('/', 'layout')
}

export async function leaveLibraryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = libraryIdSchema.safeParse({ id: formData.get('libraryId') })
  if (!parsed.success) return { ok: false, message: 'Invalid input' }

  const db = await dbAsUser()
  // RLS members_delete_self permits admin self-removal (owner must transfer first).
  await db.query(async (tx) => {
    await tx
      .delete(libraryMembers)
      .where(
        and(
          eq(libraryMembers.libraryId, parsed.data.id),
          eq(libraryMembers.userId, sql`auth.uid()`),
        ),
      )
  })

  const cookieStore = await cookies()
  cookieStore.delete(CURRENT_LIBRARY_COOKIE)
  revalidatePath('/', 'layout')
  redirect('/')
}

export async function removeAdminAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = removeMemberSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Invalid input' }

  const db = await dbAsUser()
  // RLS members_delete_admin: owner only, targeting a non-self admin row.
  await db.query(async (tx) => {
    await tx
      .delete(libraryMembers)
      .where(
        and(
          eq(libraryMembers.libraryId, parsed.data.libraryId),
          eq(libraryMembers.userId, parsed.data.userId),
        ),
      )
  })

  revalidatePath(`/libraries/${parsed.data.libraryId}/settings/members`)
  return { ok: true, message: 'Admin removed.' }
}

export async function transferOwnershipAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = transferOwnershipSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Invalid input' }

  const db = await dbAsUser()
  await db.query(async (tx) => {
    await tx.execute(
      sql`select fn_transfer_ownership(${parsed.data.libraryId}::uuid, ${parsed.data.newOwnerUserId}::uuid)`,
    )
  })

  revalidatePath(`/libraries/${parsed.data.libraryId}/settings`)
  return { ok: true, message: 'Ownership transferred.' }
}
