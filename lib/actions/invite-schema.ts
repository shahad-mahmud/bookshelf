import { z } from 'zod'

export const sendInviteSchema = z.object({
  libraryId: z.uuid(),
  email: z.email(),
})

export const acceptInviteSchema = z.object({
  token: z.string().min(32).max(64),
})

export const revokeInviteSchema = z.object({
  inviteId: z.uuid(),
  libraryId: z.uuid(),
})
