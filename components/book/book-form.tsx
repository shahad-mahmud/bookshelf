'use client'

import { useState, useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { IsbnLookup } from '@/components/book/isbn-lookup'
import { AuthorCombobox, type AuthorOption, type AuthorSelection } from '@/components/book/author-combobox'
import { TitleCombobox } from '@/components/book/title-combobox'
import { createBookAction, updateBookAction } from '@/lib/actions/book'
import type { ActionState } from '@/lib/actions/library-schema'
import type { Book, Currency } from '@/db/schema/catalog'
import type { IsbnLookupResult } from '@/lib/openlibrary'
import type { LibraryBook } from '@/components/book/title-combobox'

type Props = {
  libraryId: string
  currencies: Currency[]
  allAuthors: AuthorOption[]
  libraryBooks: LibraryBook[]
} & (
  | { mode: 'create'; initial?: undefined }
  | { mode: 'edit'; initial: Book }
)

export function BookForm({
  libraryId,
  currencies,
  allAuthors,
  libraryBooks,
  mode,
  initial,
}: Props) {
  const action = mode === 'create' ? createBookAction : updateBookAction
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { ok: true })

  const [title, setTitle] = useState(initial?.title ?? '')
  const [isbn, setIsbn] = useState(initial?.isbn ?? '')
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? '')
  const [authorSelection, setAuthorSelection] = useState<AuthorSelection>(null)

  function handleAutofill(result: IsbnLookupResult | LibraryBook) {
    if (!title && result.title) setTitle(result.title)
    if (!isbn && 'isbn' in result && result.isbn) setIsbn(result.isbn)
    if (!coverUrl && result.coverUrl) setCoverUrl(result.coverUrl)
    if (!authorSelection) {
      if ('authorId' in result && result.authorId && result.authorName) {
        setAuthorSelection({ type: 'existing', id: result.authorId, name: result.authorName })
      } else if ('author' in result && result.author) {
        setAuthorSelection({ type: 'new', name: result.author })
      }
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="libraryId" value={libraryId} />
      {mode === 'edit' && initial ? (
        <input type="hidden" name="id" value={initial.id} />
      ) : null}

      <IsbnLookup initial={initial?.isbn ?? ''} onResult={handleAutofill} />

      {/* Title */}
      <div className="space-y-1.5">
        <Label htmlFor="title">
          Title <span className="text-destructive">*</span>
        </Label>
        <input type="hidden" name="title" value={title} />
        <TitleCombobox
          id="title"
          books={libraryBooks}
          value={title}
          onChange={setTitle}
          onAutofill={handleAutofill}
        />
      </div>

      {/* Author */}
      <div className="space-y-1.5">
        <Label htmlFor="author">Author</Label>
        <AuthorCombobox
          id="author"
          authors={allAuthors}
          initialAuthorId={initial?.authorId ?? null}
          controlledSelection={authorSelection}
        />
      </div>

      {/* Cover URL */}
      <div className="space-y-1.5">
        <Label htmlFor="coverUrl">Cover URL</Label>
        <Input
          id="coverUrl"
          name="coverUrl"
          type="url"
          value={coverUrl}
          onChange={(e) => setCoverUrl(e.target.value)}
        />
      </div>

      {/* Acquisition */}
      <div className="space-y-1.5">
        <Label>Acquisition</Label>
        <Select name="acquisition" defaultValue={initial?.acquisition ?? 'owned'}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="owned">Owned</SelectItem>
            <SelectItem value="wishlist">Wishlist</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Purchase Date */}
      <div className="space-y-1.5">
        <Label htmlFor="purchaseDate">Purchase date</Label>
        <Input
          id="purchaseDate"
          name="purchaseDate"
          type="date"
          defaultValue={initial?.purchaseDate ?? ''}
        />
      </div>

      {/* Purchase Price */}
      <div className="space-y-1.5">
        <Label htmlFor="purchasePrice">Purchase price</Label>
        <Input
          id="purchasePrice"
          name="purchasePrice"
          inputMode="decimal"
          defaultValue={initial?.purchasePrice ?? ''}
        />
      </div>

      {/* Purchase Currency */}
      <div className="space-y-1.5">
        <Label>Currency</Label>
        <Select name="purchaseCurrency" defaultValue={initial?.purchaseCurrency ?? ''}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select currency" />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.code} — {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Purchase Source */}
      <div className="space-y-1.5">
        <Label htmlFor="purchaseSource">Purchase source</Label>
        <Input
          id="purchaseSource"
          name="purchaseSource"
          type="text"
          maxLength={200}
          defaultValue={initial?.purchaseSource ?? ''}
        />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          maxLength={2000}
          defaultValue={initial?.notes ?? ''}
        />
      </div>

      {state.message ? (
        <p
          role={state.ok ? 'status' : 'alert'}
          className={`text-sm ${state.ok ? 'text-foreground' : 'text-destructive'}`}
        >
          {state.message}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving...' : mode === 'create' ? 'Add book' : 'Save changes'}
      </Button>
    </form>
  )
}
