import { z } from 'zod'

const emptyToUndef = (v: unknown) => (v === '' || v === null ? undefined : v)
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format')

export const lendSchema = z
  .object({
    libraryId: z.uuid(),
    bookId: z.uuid(),
    borrowerId: z.preprocess(emptyToUndef, z.uuid().optional()),
    newBorrowerName: z.preprocess(
      emptyToUndef,
      z.string().trim().min(1).max(200).optional(),
    ),
    newBorrowerContact: z.preprocess(
      emptyToUndef,
      z.string().trim().max(200).optional(),
    ),
    lentDate: isoDate,
    expectedReturnDate: z.preprocess(emptyToUndef, isoDate.optional()),
    notes: z.preprocess(emptyToUndef, z.string().max(2000).optional()),
  })
  .refine(
    (d) => {
      const hasBorrower = !!d.borrowerId
      const hasName = d.newBorrowerName !== undefined && d.newBorrowerName.length > 0
      return hasBorrower !== hasName
    },
    { message: 'Provide either an existing borrower or a new borrower name, not both.', path: ['borrowerId'] },
  )
  .refine(
    (d) => !d.expectedReturnDate || d.expectedReturnDate >= d.lentDate,
    { message: 'Expected return date must be on or after the lent date.', path: ['expectedReturnDate'] },
  )

export const returnSchema = z.object({
  loanId: z.uuid(),
  bookId: z.uuid(),
  libraryId: z.uuid(),
})
