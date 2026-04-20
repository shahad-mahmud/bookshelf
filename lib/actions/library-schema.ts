import { z } from 'zod'

export const libraryNameSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80, 'Name too long'),
})

export const libraryIdSchema = z.object({
  id: z.uuid(),
})

export const deleteLibrarySchema = z.object({
  id: z.uuid(),
  confirmName: z.string().min(1),
})

export const transferOwnershipSchema = z.object({
  libraryId: z.uuid(),
  newOwnerUserId: z.uuid(),
})

export const removeMemberSchema = z.object({
  libraryId: z.uuid(),
  userId: z.uuid(),
})

export type ActionState = { ok: boolean; message?: string }
