import { z } from 'zod'

const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v)

export const borrowerSchema = z.object({
  libraryId: z.uuid(),
  name: z.string().trim().min(1, 'Name is required').max(200),
  contact: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  notes: z.preprocess(emptyToUndef, z.string().max(2000).optional()),
})

export const borrowerIdSchema = z.object({
  id: z.uuid(),
  libraryId: z.uuid(),
})
