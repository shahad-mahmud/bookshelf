'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signUpAction, type ActionState } from '@/lib/actions/auth'

export function SignUpForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signUpAction, { ok: true })
  return (
    <form action={formAction} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-2">
        <Label htmlFor="displayName">Your name</Label>
        <Input id="displayName" name="displayName" type="text" autoComplete="name" required maxLength={80} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
        <p className="text-xs text-muted-foreground">At least 12 characters.</p>
      </div>
      {state.message ? (
        <p role="alert" className={`text-sm ${state.ok ? 'text-foreground' : 'text-destructive'}`}>
          {state.message}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Creating account...' : 'Sign up'}
      </Button>
    </form>
  )
}
