'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { sendInviteAction } from '@/lib/actions/invite'
import { type ActionState } from '@/lib/actions/library-schema'

type Props = {
  libraryId: string
}

export function InviteForm({ libraryId }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    sendInviteAction,
    { ok: true },
  )

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Invite admin
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite an admin</DialogTitle>
          <DialogDescription>
            Enter the email address of the person you want to invite as an admin.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="libraryId" value={libraryId} />
          <div className="space-y-2">
            <Label htmlFor="invite-email">Email address</Label>
            <Input
              id="invite-email"
              name="email"
              type="email"
              autoComplete="off"
              required
              placeholder="you@example.com"
            />
          </div>
          {state.message ? (
            <p
              role={state.ok ? 'status' : 'alert'}
              className={`text-sm ${state.ok ? 'text-foreground' : 'text-destructive'}`}
            >
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? 'Sending...' : 'Send invite'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
