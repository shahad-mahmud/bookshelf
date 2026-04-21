'use client'

import { useActionState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { returnBookAction } from '@/lib/actions/loan'
import type { ActionState } from '@/lib/actions/library-schema'

export type ActiveLoanRow = {
  loanId: string
  bookId: string
  libraryId: string
  bookTitle: string
  borrowerName: string
  lentDate: string
  expectedReturnDate: string | null
}

function ReturnButton({ loan }: { loan: ActiveLoanRow }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    returnBookAction,
    { ok: true },
  )
  const wasPendingRef = useRef(false)

  useEffect(() => {
    if (wasPendingRef.current && !pending && state.ok) {
      router.refresh()
    }
    wasPendingRef.current = pending
  }, [pending, router])

  return (
    <div className="flex flex-col items-end gap-1">
      <form action={formAction}>
        <input type="hidden" name="loanId" value={loan.loanId} />
        <input type="hidden" name="bookId" value={loan.bookId} />
        <input type="hidden" name="libraryId" value={loan.libraryId} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? '…' : 'Returned'}
        </Button>
      </form>
      {state.message && !state.ok ? (
        <span className="text-xs text-destructive">{state.message}</span>
      ) : null}
    </div>
  )
}

export function ActiveLoansSection({ loans }: { loans: ActiveLoanRow[] }) {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return (
    <div className="mt-6 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">Active Loans</h2>
      {loans.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No books currently lent out.
        </p>
      ) : (
        <ul className="mt-3 divide-y">
          {loans.map((loan) => {
            const overdue =
              loan.expectedReturnDate != null && loan.expectedReturnDate < today
            return (
              <li
                key={loan.loanId}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/books/${loan.bookId}`}
                    className="block truncate font-medium hover:underline"
                  >
                    {loan.bookTitle}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {loan.borrowerName} · {loan.lentDate}
                  </p>
                  {loan.expectedReturnDate ? (
                    <p
                      className={`text-xs ${
                        overdue ? 'text-destructive' : 'text-muted-foreground'
                      }`}
                    >
                      Due {loan.expectedReturnDate}
                      {overdue ? ' · Overdue' : ''}
                    </p>
                  ) : null}
                </div>
                <ReturnButton loan={loan} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
