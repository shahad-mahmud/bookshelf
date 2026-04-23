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
import type { AuthorOption } from '@/components/book/author-combobox'
import { ContributorRowList } from '@/components/book/contributor-row-list'
import { TitleCombobox } from '@/components/book/title-combobox'
import { createBookAction, updateBookAction } from '@/lib/actions/book'
import type { ActionState } from '@/lib/actions/library-schema'
import type { Book, Currency, ContributorRole } from '@/db/schema/catalog'
import type { LibraryBook } from '@/components/book/title-combobox'

type Props = {
  libraryId: string
  currencies: Currency[]
  allAuthors: AuthorOption[]
  libraryBooks: LibraryBook[]
  initialContributors?: { authorId: string; authorName: string; role: ContributorRole }[]
} & (
  | { mode: 'create'; initial?: undefined }
  | { mode: 'edit'; initial: Book }
)

export function BookForm({
  libraryId,
  currencies,
  allAuthors,
  libraryBooks,
  initialContributors = [],
  mode,
  initial,
}: Props) {
  const action = mode === 'create' ? createBookAction : updateBookAction
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, { ok: true })

  const [title, setTitle] = useState(initial?.title ?? '')
  const [isbn, setIsbn] = useState(initial?.isbn ?? '')
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? '')
  const [autofillKey, setAutofillKey] = useState(0)
  const [autofillContributors, setAutofillContributors] = useState(initialContributors)

  const [authorCount, setAuthorCount] = useState(
    initial ? (initialContributors.filter(c => c.role === 'author').length || 1) : 1
  )
  const [translatorCount, setTranslatorCount] = useState(
    initial ? initialContributors.filter(c => c.role === 'translator').length : 0
  )
  const [editorCount, setEditorCount] = useState(
    initial ? initialContributors.filter(c => c.role === 'editor').length : 0
  )
  const [showExtra, setShowExtra] = useState(
    initialContributors.some(c => c.role !== 'author')
  )

  function handleAutofill(result: { title?: string | null; isbn?: string | null; coverUrl?: string | null; contributors?: { authorId: string; authorName: string; role: string }[] }) {
    if (!title && result.title) setTitle(result.title)
    if (!isbn && result.isbn) setIsbn(result.isbn)
    if (!coverUrl && result.coverUrl) setCoverUrl(result.coverUrl)
    if (result.contributors && result.contributors.length > 0) {
      setAutofillContributors(result.contributors as typeof initialContributors)
      setAutofillKey(k => k + 1)
      // Show extra sections if there are non-author contributors
      if (result.contributors.some(c => c.role !== 'author')) setShowExtra(true)
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

      {/* Authors */}
      <div className="space-y-1.5">
        <Label>Author</Label>
        <ContributorRowList
          key={autofillKey}
          role="author"
          authors={allAuthors}
          initial={autofillContributors.filter(c => c.role === 'author').map(c => ({ authorId: c.authorId, authorName: c.authorName }))}
          startIndex={0}
          onCountChange={setAuthorCount}
        />
      </div>

      {/* Progressive disclosure for other roles */}
      {!showExtra ? (
        <button
          type="button"
          className="text-sm text-primary hover:underline"
          onClick={() => setShowExtra(true)}
        >
          + Add translator / editor / illustrator
        </button>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Translator</Label>
            <ContributorRowList
              key={autofillKey}
              role="translator"
              authors={allAuthors}
              initial={autofillContributors.filter(c => c.role === 'translator').map(c => ({ authorId: c.authorId, authorName: c.authorName }))}
              startIndex={authorCount}
              onCountChange={setTranslatorCount}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Editor</Label>
            <ContributorRowList
              key={autofillKey}
              role="editor"
              authors={allAuthors}
              initial={autofillContributors.filter(c => c.role === 'editor').map(c => ({ authorId: c.authorId, authorName: c.authorName }))}
              startIndex={authorCount + translatorCount}
              onCountChange={setEditorCount}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Illustrator</Label>
            <ContributorRowList
              key={autofillKey}
              role="illustrator"
              authors={allAuthors}
              initial={autofillContributors.filter(c => c.role === 'illustrator').map(c => ({ authorId: c.authorId, authorName: c.authorName }))}
              startIndex={authorCount + translatorCount + editorCount}
              onCountChange={() => {}}
            />
          </div>
        </>
      )}

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
