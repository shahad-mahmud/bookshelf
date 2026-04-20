'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createLibraryAction, renameLibraryAction } from '@/lib/actions/library'
import { type ActionState } from '@/lib/actions/library-schema'

type Props =
  | { mode: 'create' }
  | { mode: 'rename'; id: string; initialName: string }

export function LibraryForm(props: Props) {
  const action = props.mode === 'create' ? createLibraryAction : renameLibraryAction
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { ok: true })

  return (
    <form action={formAction} className="space-y-4">
      {props.mode === 'rename' ? <input type="hidden" name="id" value={props.id} /> : null}
      <div className="space-y-2">
        <Label htmlFor="name">Library name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="off"
          required
          maxLength={80}
          defaultValue={props.mode === 'rename' ? props.initialName : ''}
        />
      </div>
      {state.message ? (
        <p role={state.ok ? 'status' : 'alert'} className={`text-sm ${state.ok ? 'text-foreground' : 'text-destructive'}`}>
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : props.mode === 'create' ? 'Create library' : 'Save name'}
      </Button>
    </form>
  )
}
