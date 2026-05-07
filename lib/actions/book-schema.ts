import { z } from 'zod'
import type { IsbnLookupResult } from '@/lib/openlibrary'

const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v)

const contributorSchema = z.object({
  authorId: z.preprocess(emptyToUndef, z.uuid().optional()),
  newAuthorName: z.preprocess(emptyToUndef, z.string().trim().max(300).optional()),
  role: z.enum(['author', 'translator', 'editor', 'illustrator']),
})

function isSafeHttpsUrl(raw: string): boolean {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== 'https:') return false

  const host = u.hostname.toLowerCase()
  if (host === 'localhost') return false
  if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) return false

  // Reject any IPv4 literal — book covers don't legitimately use bare IPs.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false

  // IPv6 literal: URL.hostname strips the surrounding brackets but the address still contains ":".
  if (host.includes(':')) return false

  return true
}

export const bookSchema = z
  .object({
    libraryId: z.uuid(),
    title: z.string().trim().min(1, 'Title is required').max(300),
    contributors: z.array(contributorSchema).default([]),
    isbn: z.preprocess(
      emptyToUndef,
      z.string().trim().regex(/^[0-9Xx-]+$/, 'ISBN must be digits/X/dashes').max(20).optional(),
    ),
    coverUrl: z.preprocess(
      emptyToUndef,
      z.url().refine(isSafeHttpsUrl, { message: 'Cover URL must be a public https:// address.' }).optional(),
    ),
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

export type ContributorInput = z.infer<typeof contributorSchema>

/**
 * Extracts indexed contributor entries from flat form-data.
 * Handles keys like: contributors[0][role], contributors[0][authorId], etc.
 */
export function parseContributors(flat: Record<string, string>): ContributorInput[] {
  const map = new Map<number, Record<string, string>>()

  for (const [key, value] of Object.entries(flat)) {
    const match = key.match(/^contributors\[(\d+)\]\[(\w+)\]$/)
    if (!match) continue
    const idx = parseInt(match[1], 10)
    const field = match[2]
    if (!map.has(idx)) map.set(idx, {})
    map.get(idx)![field] = value
  }

  const result: ContributorInput[] = []
  for (const [, entry] of [...map.entries()].sort(([a], [b]) => a - b)) {
    if (!entry.role) continue
    const parsed = contributorSchema.safeParse(entry)
    if (parsed.success) result.push(parsed.data)
  }
  return result
}
