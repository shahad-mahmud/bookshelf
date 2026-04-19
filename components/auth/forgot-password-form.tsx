'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { forgotPasswordAction } from '@/lib/actions/auth'
import type { ActionState } from '@/lib/actions/auth-schema'

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(forgotPasswordAction, { ok: true })
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      {state.message ? <p role="status" className="text-sm text-foreground">{state.message}</p> : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Sending...' : 'Send reset link'}
      </Button>
    </form>
  )
}
