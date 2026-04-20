'use client'

import { useActionState } from 'react'
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { deleteBorrowerAction } from '@/lib/actions/borrower'
import type { ActionState } from '@/lib/actions/library-schema'

export function DeleteBorrowerDialog({
  borrowerId,
  libraryId,
}: {
  borrowerId: string
  libraryId: string
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    deleteBorrowerAction,
    { ok: true },
  )

  return (
    <AlertDialog>
      <AlertDialogTrigger className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-sm font-medium text-destructive transition-all hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50">
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete borrower?</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. The borrower will be permanently deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {state.message && !state.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form action={formAction}>
            <input type="hidden" name="id" value={borrowerId} />
            <input type="hidden" name="libraryId" value={libraryId} />
            <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
              {pending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
