'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { acceptInviteAction } from '@/lib/actions/invite'
import { type ActionState } from '@/lib/actions/library-schema'

export function AcceptInviteForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(acceptInviteAction, { ok: true })
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state.message && !state.ok ? (
        <p role="alert" className="text-sm text-destructive">{state.message}</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Joining...' : 'Accept and join'}
        </Button>
        <Button variant="outline" render={<Link href="/" />}>
          Decline
        </Button>
      </div>
    </form>
  )
}
