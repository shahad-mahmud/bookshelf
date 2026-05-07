import { z } from 'zod'

// Shared Zod schemas — single source of truth for form + action.
// Kept out of the 'use server' module because that module can only
// export async functions.

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

export const setPasswordSchema = z.object({
  password: z.string().min(12, 'Password must be at least 12 characters.'),
})

// State shape for useActionState progressive enhancement
export type ActionState = { ok: boolean; message?: string }
