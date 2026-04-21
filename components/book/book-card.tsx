import Link from 'next/link'
import { BookCover } from './book-cover'
import type { Book } from '@/db/schema/catalog'

export function BookCard({ book, isLent }: { book: Book; isLent?: boolean }) {
  return (
    <Link
      href={`/books/${book.id}`}
      className="group flex gap-3 rounded-lg border bg-card p-3 text-sm transition-colors hover:bg-muted/50"
    >
      <BookCover src={book.coverUrl ?? null} title={book.title} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium leading-snug">{book.title}</p>
        {book.author ? (
          <p className="truncate text-muted-foreground">{book.author}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-1">
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
              book.acquisition === 'wishlist'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
            }`}
          >
            {book.acquisition === 'wishlist' ? 'Wishlist' : 'Owned'}
          </span>
          {isLent ? (
            <span className="inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              Lent
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  )
}
