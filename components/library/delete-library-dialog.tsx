'use client'

import { useState, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { deleteLibraryAction } from '@/lib/actions/library'
import { type ActionState } from '@/lib/actions/library-schema'

type Props = {
  id: string
  name: string
}

export function DeleteLibraryDialog({ id, name }: Props) {
  const [confirmInput, setConfirmInput] = useState('')
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteLibraryAction,
    { ok: true },
  )

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" />}>
        Delete library
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. All books and members will be permanently removed.
            Type <strong>{name}</strong> to confirm.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="confirmName" value={confirmInput} />
          <div className="space-y-2">
            <Label htmlFor="confirm-name">Library name</Label>
            <Input
              id="confirm-name"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoComplete="off"
              placeholder={name}
            />
          </div>
          {state.message && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">{state.message}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              type="submit"
              variant="destructive"
              disabled={confirmInput !== name || pending}
            >
              {pending ? 'Deleting...' : 'Delete library'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
