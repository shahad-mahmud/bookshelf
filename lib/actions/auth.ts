'use server'

import { z } from 'zod'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { createServerClient } from '@/lib/supabase/server'
import { sanitizeNext } from '@/lib/auth/redirect'

// Shared Zod schemas — single source of truth for form + action

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  next: z.string().optional(),
})

export const signUpSchema = z.object({
  email: z.email(),
  password: z.string().min(12, 'Password must be at least 12 characters.'),
  displayName: z.string().min(1).max(80).optional(),
  next: z.string().optional(),
})

export const forgotPasswordSchema = z.object({
  email: z.email(),
})

export const resetPasswordSchema = z.object({
  password: z.string().min(12, 'Password must be at least 12 characters.'),
})

// State shape for useActionState progressive enhancement
export type ActionState = { ok: boolean; message?: string }

// Actions

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: 'Invalid email or password' }
  }
  const supabase = await createServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })
  if (error) {
    return { ok: false, message: 'Invalid email or password' }
  }
  redirect(sanitizeNext(parsed.data.next))
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input' }
  }
  const supabase = await createServerClient()
  const origin = (await headers()).get('origin') ?? ''
  await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: parsed.data.displayName ? { display_name: parsed.data.displayName } : undefined,
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(sanitizeNext(parsed.data.next))}`,
    },
  })
  // Enumeration-safe: always the same message
  return { ok: true, message: 'Check your email to confirm your account.' }
}

export async function logoutAction(): Promise<void> {
  const supabase = await createServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function forgotPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData))
  const supabase = await createServerClient()
  const origin = (await headers()).get('origin') ?? ''
  if (parsed.success) {
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    })
  }
  return { ok: true, message: 'If that email is registered, we have sent a reset link.' }
}

export async function resetPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid password' }
  }
  const supabase = await createServerClient()
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { ok: false, message: 'Reset link expired. Please request a new one.' }
  }
  redirect('/')
}
