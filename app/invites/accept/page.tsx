import { redirect } from 'next/navigation'
import { sql } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { AcceptInviteForm } from './accept-form'

type Props = {
  searchParams: Promise<{ token?: string }>
}

type InvitePreview = {
  library_id: string
  library_name: string
  role: string
  inviter_display_name: string | null
  inviter_email: string | null
}

export default async function AcceptInvitePage({ searchParams }: Props) {
  const { token } = await searchParams

  // Validate token format
  if (!token || token.length < 32 || token.length > 64) {
    return (
      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle>Invalid invite link</CardTitle>
            <CardDescription>
              This invite link is invalid or malformed. Please ask the sender for a new invite.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const next = encodeURIComponent(`/invites/accept?token=${encodeURIComponent(token)}`)
    redirect(`/login?next=${next}`)
  }

  const db = await dbAsUser()
  const rows = await db.query(async (tx) => {
    return tx.execute(
      sql`select * from fn_lookup_invite(${token})`,
    ) as Promise<InvitePreview[]>
  })

  const invite = rows[0] ?? null

  if (!invite) {
    return (
      <main className="mx-auto max-w-md p-6">
        <Card>
          <CardHeader>
            <CardTitle>Invite not found</CardTitle>
            <CardDescription>
              This invite link has expired, been revoked, or has already been accepted.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    )
  }

  const inviterLabel = invite.inviter_display_name ?? invite.inviter_email ?? 'Someone'
  const roleLabel = invite.role === 'owner' ? 'Owner' : 'Admin'

  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>You&apos;re invited!</CardTitle>
          <CardDescription>
            {inviterLabel} has invited you to join{' '}
            <strong>{invite.library_name}</strong> as {roleLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AcceptInviteForm token={token} />
        </CardContent>
      </Card>
    </main>
  )
}
