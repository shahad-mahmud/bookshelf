'use client'

import { useState, useRef, useEffect } from 'react'
import { Input } from '@/components/ui/input'

export type ComboboxOption = {
  label: string
  value: string
  matchTerms?: string[]
}

type Props = {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  onSelect?: (option: ComboboxOption) => void
  footerLabel?: string
  onFooterSelect?: () => void
  placeholder?: string
  id?: string
}

export function Combobox({
  options,
  value,
  onChange,
  onSelect,
  footerLabel,
  onFooterSelect,
  placeholder,
  id,
}: Props) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const query = value.toLowerCase()
  const filtered = query
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query) ||
          o.matchTerms?.some((t) => t.toLowerCase().includes(query)),
      )
    : options

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const showDropdown = open && (filtered.length > 0 || Boolean(footerLabel))

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showDropdown && (
        <ul className="absolute z-50 mt-1 w-full rounded-lg border bg-popover py-1 shadow-md">
          {filtered.map((o) => (
            <li key={o.value}>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onChange(o.label)
                  onSelect?.(o)
                  setOpen(false)
                }}
              >
                {o.label}
              </button>
            </li>
          ))}
          {footerLabel && (
            <li>
              <button
                type="button"
                className="w-full px-3 py-1.5 text-left text-sm text-primary hover:bg-muted"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onFooterSelect?.()
                  setOpen(false)
                }}
              >
                {footerLabel}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
