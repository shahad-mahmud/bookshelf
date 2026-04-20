'use client'

import { useState, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import { transferOwnershipAction } from '@/lib/actions/library'
import { type ActionState } from '@/lib/actions/library-schema'

type Admin = {
  userId: string
  displayName: string | null
  email: string | null
}

type Props = {
  libraryId: string
  admins: Admin[]
}

export function TransferOwnershipDropdown({ libraryId, admins }: Props) {
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    transferOwnershipAction,
    { ok: true },
  )

  if (admins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Promote someone to admin first before transferring ownership.
      </p>
    )
  }

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Transfer ownership
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            Choose an admin to become the new owner. You will become an admin.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="libraryId" value={libraryId} />
          <input type="hidden" name="newOwnerUserId" value={selectedUserId} />
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a member" />
            </SelectTrigger>
            <SelectContent>
              {admins.map((admin) => (
                <SelectItem key={admin.userId} value={admin.userId}>
                  {admin.displayName ?? admin.email ?? admin.userId}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.message ? (
            <p
              role={state.ok ? 'status' : 'alert'}
              className={`text-sm ${state.ok ? 'text-foreground' : 'text-destructive'}`}
            >
              {state.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="submit" disabled={!selectedUserId || pending}>
              {pending ? 'Transferring...' : 'Transfer ownership'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
