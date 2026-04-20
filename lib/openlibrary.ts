export type IsbnLookupResult = {
  title: string | null
  author: string | null
  coverUrl: string | null
}

export async function lookupIsbn(isbn: string): Promise<IsbnLookupResult | null> {
  // Strip hyphens so URL bibkey and response key are consistent.
  const normalised = isbn.replace(/-/g, '')
  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${normalised}&format=json&jscmd=data`
    // next.revalidate caches the response server-side for 24 h.
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const data = await res.json()
    const entry = data[`ISBN:${normalised}`]
    if (!entry) return null
    return {
      title: entry.title ?? null,
      author: entry.authors?.[0]?.name ?? null,
      coverUrl: entry.cover?.large ?? entry.cover?.medium ?? null,
    }
  } catch (err) {
    console.error('[openlibrary] fetch threw:', err)
    return null
  }
}
