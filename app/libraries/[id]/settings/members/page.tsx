import { eq, and, sql, isNull } from 'drizzle-orm'
import { notFound } from 'next/navigation'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { libraries, libraryMembers, libraryInvites } from '@/db/schema/libraries'
import { profiles } from '@/db/schema/auth'
import { Separator } from '@/components/ui/separator'
import { MemberRow } from '@/components/library/member-row'
import { InviteForm } from '@/components/library/invite-form'
import { PendingInviteRow } from '@/components/library/pending-invite-row'
import { TransferOwnershipDropdown } from '@/components/library/transfer-ownership-dropdown'

type Props = {
  params: Promise<{ id: string }>
}

export default async function LibraryMembersPage({ params }: Props) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  const db = await dbAsUser()

  const queryResult = await db.query(async (tx) => {
    // Verify viewer is a member and get their role
    const viewerRows = await tx
      .select({ role: libraryMembers.role })
      .from(libraryMembers)
      .where(
        and(
          eq(libraryMembers.libraryId, id),
          eq(libraryMembers.userId, sql`auth.uid()`),
        ),
      )
      .limit(1)

    if (viewerRows.length === 0) return null

    const viewerRole = viewerRows[0].role as 'owner' | 'admin'

    // Fetch all members with profile data
    const members = await tx
      .select({
        userId: libraryMembers.userId,
        role: libraryMembers.role,
        joinedAt: libraryMembers.joinedAt,
        displayName: profiles.displayName,
        email: profiles.email,
      })
      .from(libraryMembers)
      .leftJoin(profiles, eq(profiles.id, libraryMembers.userId))
      .where(eq(libraryMembers.libraryId, id))

    // Fetch pending invites (not accepted or revoked)
    const invites = await tx
      .select({
        id: libraryInvites.id,
        invitedEmail: libraryInvites.invitedEmail,
        createdAt: libraryInvites.createdAt,
        expiresAt: libraryInvites.expiresAt,
      })
      .from(libraryInvites)
      .where(
        and(
          eq(libraryInvites.libraryId, id),
          isNull(libraryInvites.acceptedAt),
          isNull(libraryInvites.revokedAt),
        ),
      )

    return { members, viewerRole, invites }
  })

  if (!queryResult) notFound()

  const { members, viewerRole, invites } = queryResult

  const viewerUserId = user.id
  type MemberRow = (typeof members)[number]

  const admins = members
    .filter((m: MemberRow) => m.role === 'admin')
    .map((m: MemberRow) => ({
      userId: m.userId,
      displayName: m.displayName,
      email: m.email,
    }))

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">Members</h2>
          {(viewerRole === 'owner' || viewerRole === 'admin') && (
            <InviteForm libraryId={id} />
          )}
        </div>
        <div className="divide-y">
          {members.map((member: MemberRow) => (
            <MemberRow
              key={member.userId}
              libraryId={id}
              userId={member.userId}
              displayName={member.displayName}
              email={member.email}
              role={member.role as 'owner' | 'admin'}
              isYou={member.userId === viewerUserId}
              viewerRole={viewerRole}
            />
          ))}
        </div>
      </section>

      <Separator />

      <section className="space-y-4">
        <h2 className="text-base font-medium">Pending invites</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invites.</p>
        ) : (
          <div className="divide-y">
            {invites.map((invite: (typeof invites)[number]) => (
              <PendingInviteRow
                key={invite.id}
                inviteId={invite.id}
                libraryId={id}
                email={invite.invitedEmail}
                createdAt={invite.createdAt}
                expiresAt={invite.expiresAt}
              />
            ))}
          </div>
        )}
      </section>

      {viewerRole === 'owner' && (
        <>
          <Separator />
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-medium">Transfer ownership</h2>
              <p className="text-sm text-muted-foreground">
                Hand ownership to another admin. You will become an admin.
              </p>
            </div>
            <TransferOwnershipDropdown libraryId={id} admins={admins} />
          </section>
        </>
      )}
    </div>
  )
}
