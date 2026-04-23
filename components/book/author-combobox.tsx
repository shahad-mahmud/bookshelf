'use client'

import { useState } from 'react'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'

export type AuthorOption = { id: string; name: string; aliases: string[] }

export type AuthorSelection =
  | { type: 'existing'; id: string; name: string }
  | { type: 'new'; name: string }
  | null

type Props = {
  authors: AuthorOption[]
  initialAuthorId?: string | null
  onChange?: (selection: AuthorSelection) => void
  id?: string
}

export function AuthorCombobox({ authors, initialAuthorId, onChange, id }: Props) {
  const initialAuthor = initialAuthorId ? authors.find((a) => a.id === initialAuthorId) : undefined
  const [selection, setSelection] = useState<AuthorSelection>(
    initialAuthor ? { type: 'existing', id: initialAuthor.id, name: initialAuthor.name } : null,
  )
  const [query, setQuery] = useState(initialAuthor?.name ?? '')

  const options: ComboboxOption[] = authors.map((a) => ({
    label: a.name,
    value: a.id,
    matchTerms: a.aliases,
  }))

  const exactMatch = authors.some((a) => a.name.toLowerCase() === query.trim().toLowerCase())
  const showCreate = query.trim().length > 0 && !exactMatch && selection?.type !== 'existing'

  function handleSelect(option: ComboboxOption) {
    const s: AuthorSelection = { type: 'existing', id: option.value, name: option.label }
    setSelection(s)
    onChange?.(s)
  }

  function handleChange(value: string) {
    setQuery(value)
    setSelection(null)
    onChange?.(null)
  }

  function handleCreate() {
    const name = query.trim()
    const s: AuthorSelection = { type: 'new', name }
    setSelection(s)
    onChange?.(s)
  }

  return (
    <div>
      {selection?.type === 'existing' && (
        <input type="hidden" name="authorId" value={selection.id} />
      )}
      {selection?.type === 'new' && (
        <input type="hidden" name="newAuthorName" value={selection.name} />
      )}
      <Combobox
        id={id}
        options={options}
        value={query}
        onChange={handleChange}
        onSelect={handleSelect}
        footerLabel={showCreate ? `Create "${query.trim()}"` : undefined}
        onFooterSelect={handleCreate}
        placeholder="Search or add author…"
      />
    </div>
  )
}
