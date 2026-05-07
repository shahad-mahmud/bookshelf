import 'server-only'
import { env } from '@/lib/env'

export const COVER_BUCKET = 'book-covers'

export function canonicalCoverUrl(args: { libraryId: string; bookId: string }): string {
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
  return `${base}/storage/v1/object/public/${COVER_BUCKET}/${args.libraryId}/${args.bookId}.webp`
}

export function isCanonicalCoverUrl(args: { url: string; libraryId: string; bookId: string }): boolean {
  return args.url === canonicalCoverUrl({ libraryId: args.libraryId, bookId: args.bookId })
}
