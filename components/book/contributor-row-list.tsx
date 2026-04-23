'use client'

import { useState } from 'react'
import { AuthorCombobox } from '@/components/book/author-combobox'
import type { AuthorOption, AuthorSelection } from '@/components/book/author-combobox'
import type { ContributorRole } from '@/db/schema/catalog'

const ROLE_LABELS: Record<ContributorRole, string> = {
  author: 'author',
  translator: 'translator',
  editor: 'editor',
  illustrator: 'illustrator',
}

type ContributorRow = {
  key: number
  selection: AuthorSelection
}

type Props = {
  role: ContributorRole
  authors: AuthorOption[]
  initial: { authorId: string; authorName: string }[]
  startIndex: number
  onCountChange: (count: number) => void
}

export function ContributorRowList({ role, authors, initial, startIndex, onCountChange }: Props) {
  const [rows, setRows] = useState<ContributorRow[]>(() =>
    initial.length > 0
      ? initial.map((c, i) => ({
          key: i,
          selection: { type: 'existing', id: c.authorId, name: c.authorName },
        }))
      : [{ key: 0, selection: null }],
  )
  const [nextKey, setNextKey] = useState(Math.max(initial.length, 1))

  function addRow() {
    const newRows = [...rows, { key: nextKey, selection: null }]
    setRows(newRows)
    setNextKey(nextKey + 1)
    onCountChange(newRows.length)
  }

  function removeRow(key: number) {
    const newRows = rows.filter((r) => r.key !== key)
    setRows(newRows)
    onCountChange(newRows.length)
  }

  function updateSelection(key: number, selection: AuthorSelection) {
    setRows(rows.map((r) => (r.key === key ? { ...r, selection } : r)))
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const globalIndex = startIndex + i
        return (
          <div key={row.key} className="flex items-center gap-2">
            {/* Hidden inputs for form submission */}
            <input type="hidden" name={`contributors[${globalIndex}][role]`} value={role} />
            {row.selection?.type === 'existing' && (
              <input
                type="hidden"
                name={`contributors[${globalIndex}][authorId]`}
                value={row.selection.id}
              />
            )}
            {row.selection?.type === 'new' && (
              <input
                type="hidden"
                name={`contributors[${globalIndex}][newAuthorName]`}
                value={row.selection.name}
              />
            )}
            <div className="flex-1">
              <AuthorCombobox
                authors={authors}
                initialAuthorId={row.selection?.type === 'existing' ? row.selection.id : null}
                onChange={(s) => updateSelection(row.key, s)}
                hideInputs
              />
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive text-sm px-1"
                onClick={() => removeRow(row.key)}
                aria-label={`Remove ${ROLE_LABELS[role]}`}
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="text-sm text-primary hover:underline"
        onClick={addRow}
      >
        + Add {ROLE_LABELS[role]}
      </button>
    </div>
  )
}
