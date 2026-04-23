import 'server-only'
import { unstable_cache } from 'next/cache'
import { eq, inArray } from 'drizzle-orm'
import { dbSystem } from '@/db/client-system'
import { books, authors, authorAliases, bookContributors } from '@/db/schema/catalog'
import { libraryMembers } from '@/db/schema/libraries'
import type { LibraryBook, BookContributor } from '@/components/book/title-combobox'
import type { AuthorOption } from '@/components/book/author-combobox'

type AutocompleteData = {
  allAuthors: AuthorOption[]
  libraryBooks: LibraryBook[]
}

async function fetchAutocompleteData(userId: string, libraryId: string): Promise<AutocompleteData> {
  const { db, close } = dbSystem()
  try {
    const memberRows = await db
      .select({ libraryId: libraryMembers.libraryId })
      .from(libraryMembers)
      .where(eq(libraryMembers.userId, userId))
    const allLibraryIds = memberRows.map((m) => m.libraryId)

    if (allLibraryIds.length === 0) return { allAuthors: [], libraryBooks: [] }

    // Books for current library (title autocomplete)
    const bookRows = await db
      .select({ id: books.id, title: books.title, isbn: books.isbn, coverUrl: books.coverUrl })
      .from(books)
      .where(eq(books.libraryId, libraryId))

    const bookIds = bookRows.map((b) => b.id)

    // Contributors for those books
    const contributorRows = bookIds.length > 0
      ? await db
          .select({
            bookId: bookContributors.bookId,
            authorId: bookContributors.authorId,
            authorName: authors.name,
            role: bookContributors.role,
          })
          .from(bookContributors)
          .innerJoin(authors, eq(bookContributors.authorId, authors.id))
          .where(inArray(bookContributors.bookId, bookIds))
      : []

    // Group contributors by book
    const contributorsByBook = new Map<string, BookContributor[]>()
    for (const row of contributorRows) {
      const list = contributorsByBook.get(row.bookId) ?? []
      list.push({ authorId: row.authorId, authorName: row.authorName, role: row.role })
      contributorsByBook.set(row.bookId, list)
    }

    const libraryBooks: LibraryBook[] = bookRows.map((b) => ({
      id: b.id,
      title: b.title,
      isbn: b.isbn,
      coverUrl: b.coverUrl,
      contributors: contributorsByBook.get(b.id) ?? [],
    }))

    // Authors global scope — all authors from all user's libraries
    const authorIdRows = await db
      .selectDistinct({ authorId: bookContributors.authorId })
      .from(bookContributors)
      .innerJoin(books, eq(bookContributors.bookId, books.id))
      .where(
        allLibraryIds.length === 1
          ? eq(books.libraryId, allLibraryIds[0])
          : inArray(books.libraryId, allLibraryIds),
      )

    const authorIds = authorIdRows.map((r) => r.authorId)

    if (authorIds.length === 0) return { allAuthors: [], libraryBooks }

    const [authorRows, aliasRows] = await Promise.all([
      db
        .select({ id: authors.id, name: authors.name })
        .from(authors)
        .where(inArray(authors.id, authorIds)),
      db
        .select({ authorId: authorAliases.authorId, name: authorAliases.name })
        .from(authorAliases)
        .where(inArray(authorAliases.authorId, authorIds)),
    ])

    const aliasMap = new Map<string, string[]>()
    for (const alias of aliasRows) {
      const list = aliasMap.get(alias.authorId) ?? []
      list.push(alias.name)
      aliasMap.set(alias.authorId, list)
    }

    const allAuthors: AuthorOption[] = authorRows.map((a) => ({
      id: a.id,
      name: a.name,
      aliases: aliasMap.get(a.id) ?? [],
    }))

    return { allAuthors, libraryBooks }
  } finally {
    await close()
  }
}

export const getAutocompleteData = unstable_cache(
  fetchAutocompleteData,
  ['book-autocomplete'],
  { tags: ['library-autocomplete'], revalidate: 300 },
)
