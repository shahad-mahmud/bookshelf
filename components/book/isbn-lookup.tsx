'use client'

import { useState, useTransition } from 'react'
import { Camera } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BarcodeScannerOverlay } from './barcode-scanner-overlay'
import { lookupIsbnAction } from '@/lib/actions/book'
import type { IsbnLookupResult } from '@/lib/openlibrary'

export function IsbnLookup({
  initial,
  onResult,
}: {
  initial?: string
  onResult: (result: IsbnLookupResult) => void
}) {
  const [isbn, setIsbn] = useState(initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [scannerOpen, setScannerOpen] = useState(false)

  const lookup = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return
    setError(null)
    const fd = new FormData()
    fd.set('isbn', trimmed)
    startTransition(async () => {
      const state = await lookupIsbnAction(null, fd)
      if (state.ok) {
        onResult(state.result)
      } else {
        setError(state.error)
      }
    })
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="isbn">ISBN</Label>
      <div className="flex gap-2">
        <Input
          id="isbn"
          name="isbn"
          type="text"
          maxLength={20}
          value={isbn}
          onChange={(e) => setIsbn(e.target.value)}
          onBlur={(e) => lookup(e.target.value)}
          placeholder="e.g. 978-0-14-143958-7"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || !isbn.trim()}
          onClick={() => lookup(isbn)}
        >
          {pending ? 'Looking up…' : 'Look up'}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="md:hidden"
          disabled={pending}
          onClick={() => setScannerOpen(true)}
          aria-label="Scan barcode"
        >
          <Camera className="h-4 w-4" />
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {scannerOpen && (
        <BarcodeScannerOverlay
          onDetected={(detected) => {
            setIsbn(detected)
            lookup(detected)
            setScannerOpen(false)
          }}
          onClose={() => setScannerOpen(false)}
        />
      )}
    </div>
  )
}
