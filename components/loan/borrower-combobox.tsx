'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'

type BorrowerOption = { id: string; name: string }

export type BorrowerSelection =
  | { type: 'existing'; id: string; name: string }
  | { type: 'new'; name: string }
  | null

export function BorrowerCombobox({
  borrowers,
  onChange,
  id,
}: {
  borrowers: BorrowerOption[]
  onChange?: (selection: BorrowerSelection) => void
  id?: string
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<BorrowerSelection>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = borrowers.filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase()),
  )
  const showCreate =
    query.trim().length > 0 &&
    !borrowers.some((b) => b.name.toLowerCase() === query.trim().toLowerCase())

  function select(s: BorrowerSelection) {
    setSelected(s)
    setQuery(s ? s.name : '')
    setOpen(false)
    onChange?.(s)
  }

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      {selected?.type === 'existing' && (
        <input type="hidden" name="borrowerId" value={selected.id} />
      )}
      {selected?.type === 'new' && (
        <input type="hidden" name="newBorrowerName" value={selected.name} />
      )}

      <Input
        id={id}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSelected(null)
          onChange?.(null)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder="Search or create a borrower…"
        autoComplete="off"
      />

      {open && (filtered.length > 0 || showCreate) && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border bg-popover py-1 shadow-md">
          {filtered.map((b) => (
            <li key={b.id}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault()
                  select({ type: 'existing', id: b.id, name: b.name })
                }}
              >
                {b.name}
              </button>
            </li>
          ))}
          {showCreate && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-primary hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault()
                  select({ type: 'new', name: query.trim() })
                }}
              >
                Create &ldquo;{query.trim()}&rdquo;
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
