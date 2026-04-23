import { z } from 'zod'
import type { IsbnLookupResult } from '@/lib/openlibrary'

const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v)

export const bookSchema = z
  .object({
    libraryId: z.uuid(),
    title: z.string().trim().min(1, 'Title is required').max(300),
    authorId: z.preprocess(emptyToUndef, z.uuid().optional()),
    newAuthorName: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
    isbn: z.preprocess(
      emptyToUndef,
      z.string().trim().regex(/^[0-9Xx-]+$/, 'ISBN must be digits/X/dashes').max(20).optional(),
    ),
    coverUrl: z.preprocess(emptyToUndef, z.url().optional()),
    acquisition: z.enum(['owned', 'wishlist']).default('owned'),
    purchaseDate: z.preprocess(
      emptyToUndef,
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
    ),
    purchasePrice: z.preprocess(
      emptyToUndef,
      z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use a number like 499 or 499.99').optional(),
    ),
    purchaseCurrency: z.preprocess(emptyToUndef, z.string().length(3).optional()),
    purchaseSource: z.preprocess(emptyToUndef, z.string().max(200).optional()),
    notes: z.preprocess(emptyToUndef, z.string().max(2000).optional()),
  })
  .refine(
    (d) => (d.purchasePrice === undefined) === (d.purchaseCurrency === undefined),
    { message: 'Price and currency must be set together.', path: ['purchaseCurrency'] },
  )

export const bookIdSchema = z.object({
  id: z.uuid(),
  libraryId: z.uuid(),
})

export const isbnLookupSchema = z.object({ isbn: z.string().min(1) })

export type IsbnLookupState =
  | { ok: true; result: IsbnLookupResult }
  | { ok: false; error: string }
