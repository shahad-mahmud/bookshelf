import Link from 'next/link'
import { redirect } from 'next/navigation'
import { desc, eq } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { getCurrentLibrary } from '@/lib/library/current'
import { books } from '@/db/schema/catalog'
import { profiles } from '@/db/schema/auth'
import { AppHeader } from '@/components/app-header'
import { BookCard } from '@/components/book/book-card'
import { Button } from '@/components/ui/button'

export default async function BooksPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [current, db] = await Promise.all([getCurrentLibrary(), dbAsUser()])

  const [profile, allBooks] = await Promise.all([
    db.query((tx) => tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)).then((r) => r[0]),
    db.query((tx) =>
      tx
        .select()
        .from(books)
        .where(eq(books.libraryId, current.id))
        .orderBy(desc(books.createdAt)),
    ),
  ])

  return (
    <>
      <AppHeader displayName={profile?.displayName ?? null} email={profile?.email ?? null} />
      <main className="mx-auto max-w-3xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Books</h1>
          <Button render={<Link href="/books/new" />}>Add book</Button>
        </div>

        {allBooks.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
            <p className="text-sm">No books yet in this library.</p>
            <Link href="/books/new" className="text-sm text-primary underline underline-offset-3 hover:text-primary/80">
              Add your first book
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {allBooks.map((book) => (
              <BookCard key={book.id} book={book} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
