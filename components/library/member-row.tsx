'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { leaveLibraryAction, removeAdminAction } from '@/lib/actions/library'
import { type ActionState } from '@/lib/actions/library-schema'

type Props = {
  libraryId: string
  userId: string
  displayName: string | null
  email: string | null
  role: 'owner' | 'admin'
  isYou: boolean
  viewerRole: 'owner' | 'admin'
}

export function MemberRow({ libraryId, userId, displayName, email, role, isYou, viewerRole }: Props) {
  const [leaveState, leaveAction, leavePending] = useActionState<ActionState, FormData>(
    leaveLibraryAction,
    { ok: true },
  )
  const [removeState, removeAction, removePending] = useActionState<ActionState, FormData>(
    removeAdminAction,
    { ok: true },
  )

  const label = displayName ?? email ?? 'Unknown user'
  const canLeave = isYou && role === 'admin'
  const canRemove = !isYou && role === 'admin' && viewerRole === 'owner'

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate text-sm font-medium">{label}</span>
        {isYou && (
          <span className="text-xs text-muted-foreground">(you)</span>
        )}
        <span className="text-xs rounded-full bg-muted px-2 py-0.5 capitalize">{role}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {(leaveState.message && !leaveState.ok) || (removeState.message && !removeState.ok) ? (
          <span className="text-xs text-destructive">
            {leaveState.message ?? removeState.message}
          </span>
        ) : null}
        {canLeave && (
          <form action={leaveAction}>
            <input type="hidden" name="libraryId" value={libraryId} />
            <Button type="submit" variant="outline" size="sm" disabled={leavePending}>
              {leavePending ? 'Leaving...' : 'Leave'}
            </Button>
          </form>
        )}
        {canRemove && (
          <form action={removeAction}>
            <input type="hidden" name="libraryId" value={libraryId} />
            <input type="hidden" name="userId" value={userId} />
            <Button type="submit" variant="outline" size="sm" disabled={removePending}>
              {removePending ? 'Removing...' : 'Remove'}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
