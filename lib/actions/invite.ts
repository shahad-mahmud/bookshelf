'use server'

import { randomBytes, createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { cookies, headers } from 'next/headers'
import { sql } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { sendInviteEmail } from '@/lib/email/send'
import { CURRENT_LIBRARY_COOKIE } from '@/lib/library/current'
import { sendInviteSchema, acceptInviteSchema, revokeInviteSchema } from './invite-schema'
import { type ActionState } from './library-schema'

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

function generateToken(): { plaintext: string; hash: Buffer } {
  const bytes = randomBytes(32)
  const plaintext = bytes.toString('base64url')
  const hash = createHash('sha256').update(plaintext).digest()
  return { plaintext, hash }
}

export async function sendInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = sendInviteSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: 'Invalid input.' }
  }

  const { plaintext, hash } = generateToken()

  const db = await dbAsUser()
  const result = await db.query(async (tx) => {
    // fn_send_invite enforces caller owner/admin of library_id.
    // Pass bytea as a Buffer; Drizzle+postgres-js handles it.
    try {
      const [{ fn_send_invite: inviteId }] = await tx.execute(
        sql`select fn_send_invite(
          ${parsed.data.libraryId}::uuid,
          'admin'::library_role,
          ${parsed.data.email},
          null,
          ${hash}
        ) as fn_send_invite`,
      )
      return { ok: true as const, inviteId: inviteId as string }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create invite.'
      return { ok: false as const, message: msg }
    }
  })

  if (!result.ok) return { ok: false, message: result.message }

  // Look up inviter name + library name for the email.
  const meta = await db.query(async (tx) => {
    const rows = await tx.execute(
      sql`select l.name as library_name, p.display_name as inviter_name
          from libraries l, profiles p
          where l.id = ${parsed.data.libraryId}::uuid
            and p.id = auth.uid()
          limit 1`,
    )
    return (rows[0] ?? { library_name: 'your library', inviter_name: null }) as {
      library_name: string
      inviter_name: string | null
    }
  })

  const origin = (await headers()).get('origin') ?? ''
  const inviteUrl = `${origin}/invites/accept?token=${encodeURIComponent(plaintext)}`

  const emailResult = await sendInviteEmail({
    to: parsed.data.email,
    libraryName: meta.library_name,
    inviterName: meta.inviter_name,
    inviteUrl,
  })

  revalidatePath(`/libraries/${parsed.data.libraryId}/settings/members`)

  if (!emailResult.ok) {
    return {
      ok: true,
      message: `Invite created, but email failed to send. You can revoke and retry. (${emailResult.error})`,
    }
  }
  return { ok: true, message: 'Invite sent.' }
}

export async function acceptInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = acceptInviteSchema.safeParse({ token: formData.get('token') })
  if (!parsed.success) {
    return { ok: false, message: 'Invalid or expired invite.' }
  }

  const db = await dbAsUser()
  const result = await db.query(async (tx) => {
    try {
      const [{ fn_accept_invite: libraryId }] = await tx.execute(
        sql`select fn_accept_invite(${parsed.data.token}) as fn_accept_invite`,
      )
      return { ok: true as const, libraryId: libraryId as string }
    } catch (err) {
      return {
        ok: false as const,
        message: err instanceof Error ? err.message : 'Invalid or expired invite.',
      }
    }
  })

  if (!result.ok) return { ok: false, message: result.message }

  // Switch to the newly-joined library.
  const cookieStore = await cookies()
  cookieStore.set(CURRENT_LIBRARY_COOKIE, result.libraryId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Joined the library.' }
}

export async function revokeInviteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = revokeInviteSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Invalid input.' }

  const db = await dbAsUser()
  await db.query(async (tx) => {
    await tx.execute(sql`select fn_revoke_invite(${parsed.data.inviteId}::uuid)`)
  })

  revalidatePath(`/libraries/${parsed.data.libraryId}/settings/members`)
  return { ok: true, message: 'Invite revoked.' }
}
