'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createServerClient } from '@/lib/supabase/server'
import { sanitizeNext } from '@/lib/auth/redirect'
import {
  loginSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  setPasswordSchema,
  type ActionState,
} from './auth-schema'

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

export async function setPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid password' }
  }
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, message: 'You are not signed in.' }
  }
  // Only first-time set is allowed here. Once a password identity exists,
  // changes go through the email-link reset flow so a hijacked session
  // can't silently overwrite a real password.
  const hasEmailIdentity = user.identities?.some((i) => i.provider === 'email') ?? false
  if (hasEmailIdentity) {
    return { ok: false, message: 'Password is already set. Use Forgot password to change it.' }
  }
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    return { ok: false, message: 'Could not set password. Please try again.' }
  }
  revalidatePath('/account')
  return { ok: true, message: 'Password set. You can now log in with your email and password.' }
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
