import 'server-only'
import { cookies } from 'next/headers'
import { eq, desc } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { libraries, libraryMembers } from '@/db/schema/libraries'
import { CURRENT_LIBRARY_COOKIE } from './constants'

export { CURRENT_LIBRARY_COOKIE }
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 365 days

export type CurrentLibrary = {
  id: string
  name: string
  role: 'owner' | 'admin'
}

export async function getCurrentLibrary(): Promise<CurrentLibrary> {
  const cookieStore = await cookies()
  const cookieValue = cookieStore.get(CURRENT_LIBRARY_COOKIE)?.value

  const db = await dbAsUser()

  const selected = await db.query(async (tx) => {
    // Try the cookie value first.
    if (cookieValue) {
      const match = await tx
        .select({ id: libraries.id, name: libraries.name, role: libraryMembers.role })
        .from(libraries)
        .innerJoin(libraryMembers, eq(libraryMembers.libraryId, libraries.id))
        .where(eq(libraries.id, cookieValue))
        .limit(1)
      if (match.length > 0) return match[0]
    }

    // Fallback: most recent library the user is a member of.
    const fallback = await tx
      .select({ id: libraries.id, name: libraries.name, role: libraryMembers.role })
      .from(libraries)
      .innerJoin(libraryMembers, eq(libraryMembers.libraryId, libraries.id))
      .orderBy(desc(libraries.createdAt))
      .limit(1)
    return fallback[0] ?? null
  })

  if (!selected) {
    throw new Error('User has no library membership. This should never happen — signup trigger creates one.')
  }

  // Re-set the cookie if missing or stale.
  if (cookieValue !== selected.id) {
    cookieStore.set(CURRENT_LIBRARY_COOKIE, selected.id, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    })
  }

  return {
    id: selected.id,
    name: selected.name,
    role: selected.role as 'owner' | 'admin',
  }
}

export async function listUserLibraries(): Promise<CurrentLibrary[]> {
  const db = await dbAsUser()
  const rows = await db.query(async (tx) => {
    return tx
      .select({ id: libraries.id, name: libraries.name, role: libraryMembers.role })
      .from(libraries)
      .innerJoin(libraryMembers, eq(libraryMembers.libraryId, libraries.id))
      .orderBy(desc(libraries.createdAt))
  })
  return rows.map((r) => ({ id: r.id, name: r.name, role: r.role as 'owner' | 'admin' }))
}
