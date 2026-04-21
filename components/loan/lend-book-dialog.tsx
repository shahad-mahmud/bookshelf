'use client'

import { useActionState, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BorrowerCombobox } from './borrower-combobox'
import type { BorrowerSelection } from './borrower-combobox'
import { lendBookAction } from '@/lib/actions/loan'
import type { ActionState } from '@/lib/actions/library-schema'

type BorrowerOption = { id: string; name: string }

export function LendBookDialog({
  bookId,
  libraryId,
  borrowers,
}: {
  bookId: string
  libraryId: string
  borrowers: BorrowerOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    lendBookAction,
    { ok: true },
  )
  const [borrowerSelection, setBorrowerSelection] = useState<BorrowerSelection>(null)
  const [lentDateDefault, setLentDateDefault] = useState(() =>
    new Date().toISOString().slice(0, 10),
  )
  const wasPendingRef = useRef(false)

  useEffect(() => {
    if (wasPendingRef.current && !pending && state.ok) {
      setOpen(false)
      setBorrowerSelection(null)
      router.refresh()
    }
    wasPendingRef.current = pending
  }, [pending, state.ok, router])

  useEffect(() => {
    if (open) {
      setLentDateDefault(new Date().toISOString().slice(0, 10))
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Lend</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lend this book</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="grid gap-4 pt-2">
          <input type="hidden" name="bookId" value={bookId} />
          <input type="hidden" name="libraryId" value={libraryId} />

          <div className="grid gap-1.5">
            <Label htmlFor="borrower-search">Borrower</Label>
            <BorrowerCombobox id="borrower-search" borrowers={borrowers} onChange={setBorrowerSelection} />
          </div>

          {borrowerSelection?.type === 'new' && (
            <div className="grid gap-1.5">
              <Label htmlFor="newBorrowerContact">Contact (optional)</Label>
              <Input
                id="newBorrowerContact"
                name="newBorrowerContact"
                placeholder="Phone or email"
              />
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="lentDate">Lent date</Label>
            <Input
              id="lentDate"
              name="lentDate"
              type="date"
              value={lentDateDefault}
              onChange={(e) => setLentDateDefault(e.target.value)}
              required
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="expectedReturnDate">Expected return (optional)</Label>
            <Input id="expectedReturnDate" name="expectedReturnDate" type="date" />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="loanNotes">Notes (optional)</Label>
            <Input id="loanNotes" name="notes" placeholder="Any notes…" />
          </div>

          {state.message && !state.ok ? (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={pending || !borrowerSelection}>
              {pending ? 'Lending…' : 'Lend book'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
