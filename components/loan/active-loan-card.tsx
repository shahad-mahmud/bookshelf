'use client'

import { useActionState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { returnBookAction } from '@/lib/actions/loan'
import type { ActionState } from '@/lib/actions/library-schema'

export type ActiveLoan = {
  id: string
  bookId: string
  libraryId: string
  borrowerName: string
  lentDate: string
  expectedReturnDate: string | null
}

export function ActiveLoanCard({ loan }: { loan: ActiveLoan }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    returnBookAction,
    { ok: true },
  )
  const wasPendingRef = useRef(false)
  const today = new Date().toISOString().slice(0, 10)
  const isOverdue = loan.expectedReturnDate != null && loan.expectedReturnDate < today

  useEffect(() => {
    if (wasPendingRef.current && !pending && state.ok) {
      router.refresh()
    }
    wasPendingRef.current = pending
  }, [pending, state.ok, router])

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Lent to {loan.borrowerName}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">Since {loan.lentDate}</p>
          {loan.expectedReturnDate ? (
            <p className={`mt-0.5 text-sm ${isOverdue ? 'text-destructive' : 'text-muted-foreground'}`}>
              Expected back {loan.expectedReturnDate}
              {isOverdue ? ' · Overdue' : ''}
            </p>
          ) : null}
        </div>
        <form action={formAction}>
          <input type="hidden" name="loanId" value={loan.id} />
          <input type="hidden" name="bookId" value={loan.bookId} />
          <input type="hidden" name="libraryId" value={loan.libraryId} />
          <Button type="submit" variant="outline" size="sm" disabled={pending}>
            {pending ? 'Marking…' : 'Mark Returned'}
          </Button>
        </form>
      </div>
      {state.message && !state.ok ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  )
}
