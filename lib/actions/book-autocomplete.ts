import 'server-only'
import { unstable_cache } from 'next/cache'
import { eq, inArray, isNotNull } from 'drizzle-orm'
import { dbSystem } from '@/db/client-system'
import { books, authors, authorAliases } from '@/db/schema/catalog'
import { libraryMembers } from '@/db/schema/libraries'
import type { LibraryBook } from '@/components/book/title-combobox'
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

    const [libraryBooks, authorIdRows] = await Promise.all([
      db
        .select({
          id: books.id,
          title: books.title,
          authorId: books.authorId,
          authorName: authors.name,
          isbn: books.isbn,
          coverUrl: books.coverUrl,
        })
        .from(books)
        .leftJoin(authors, eq(books.authorId, authors.id))
        .where(eq(books.libraryId, libraryId)),
      db
        .selectDistinct({ authorId: books.authorId })
        .from(books)
        .where(
          allLibraryIds.length === 1
            ? eq(books.libraryId, allLibraryIds[0])
            : inArray(books.libraryId, allLibraryIds),
        ),
    ])

    const authorIds = authorIdRows
      .map((r) => r.authorId)
      .filter((id): id is string => id !== null)

    if (authorIds.length === 0) {
      return { allAuthors: [], libraryBooks }
    }

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
