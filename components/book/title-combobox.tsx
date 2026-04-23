'use client'

import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import type { ContributorRole } from '@/db/schema/catalog'

export type BookContributor = {
  authorId: string
  authorName: string
  role: ContributorRole
}

export type LibraryBook = {
  id: string
  title: string
  isbn: string | null
  coverUrl: string | null
  contributors: BookContributor[]
}

type Props = {
  books: LibraryBook[]
  value: string
  onChange: (value: string) => void
  onAutofill: (book: LibraryBook) => void
  id?: string
}

export function TitleCombobox({ books, value, onChange, onAutofill, id }: Props) {
  const options: ComboboxOption[] = books.map((b) => ({
    label: b.title,
    value: b.id,
  }))

  function handleSelect(option: ComboboxOption) {
    const book = books.find((b) => b.id === option.value)
    if (book) onAutofill(book)
  }

  return (
    <Combobox
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      onSelect={handleSelect}
      placeholder="Title"
    />
  )
}
