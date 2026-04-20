'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createBorrowerAction, updateBorrowerAction } from '@/lib/actions/borrower'
import type { ActionState } from '@/lib/actions/library-schema'
import type { Borrower } from '@/db/schema/catalog'

type Props = {
  libraryId: string
} & (
  | { mode: 'create'; initial?: undefined }
  | { mode: 'edit'; initial: Borrower }
)

export function BorrowerForm({ libraryId, mode, initial }: Props) {
  const action = mode === 'create' ? createBorrowerAction : updateBorrowerAction
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { ok: true })

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="libraryId" value={libraryId} />
      {mode === 'edit' && initial ? (
        <input type="hidden" name="id" value={initial.id} />
      ) : null}

      {/* Name */}
      <div className="space-y-1.5">
        <Label htmlFor="name">
          Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="name"
          name="name"
          type="text"
          required
          maxLength={200}
          defaultValue={initial?.name ?? ''}
        />
      </div>

      {/* Contact */}
      <div className="space-y-1.5">
        <Label htmlFor="contact">Contact</Label>
        <Input
          id="contact"
          name="contact"
          type="text"
          maxLength={200}
          defaultValue={initial?.contact ?? ''}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          maxLength={2000}
          defaultValue={initial?.notes ?? ''}
        />
      </div>

      {/* Error / status */}
      {state.message ? (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={`text-sm ${state.ok ? 'text-foreground' : 'text-destructive'}`}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : mode === 'create' ? 'Add borrower' : 'Save changes'}
      </Button>
    </form>
  )
}
