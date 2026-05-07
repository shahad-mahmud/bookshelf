'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { setPasswordAction } from '@/lib/actions/auth'
import type { ActionState } from '@/lib/actions/auth-schema'

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(setPasswordAction, { ok: true })
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
        <p className="text-xs text-muted-foreground">At least 12 characters.</p>
      </div>
      {state.message ? (
        <p role="alert" className={`text-sm ${state.ok ? 'text-foreground' : 'text-destructive'}`}>
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : 'Set password'}
      </Button>
    </form>
  )
}
