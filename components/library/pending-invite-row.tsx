'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { revokeInviteAction } from '@/lib/actions/invite'
import { type ActionState } from '@/lib/actions/library-schema'

type Props = {
  inviteId: string
  libraryId: string
  email: string | null
  createdAt: Date
  expiresAt: Date
}

export function PendingInviteRow({ inviteId, libraryId, email, createdAt, expiresAt }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    revokeInviteAction,
    { ok: true },
  )

  const dateFormatter = new Intl.DateTimeFormat('en', { dateStyle: 'medium' })

  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{email ?? '—'}</p>
        <p className="text-xs text-muted-foreground">
          Sent {dateFormatter.format(createdAt)} · Expires {dateFormatter.format(expiresAt)}
        </p>
        {state.message && !state.ok ? (
          <p role="alert" className="text-xs text-destructive">{state.message}</p>
        ) : null}
      </div>
      <form action={formAction} className="shrink-0">
        <input type="hidden" name="inviteId" value={inviteId} />
        <input type="hidden" name="libraryId" value={libraryId} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? 'Revoking...' : 'Revoke'}
        </Button>
      </form>
    </div>
  )
}
