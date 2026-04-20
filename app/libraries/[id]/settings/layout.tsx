import { notFound } from 'next/navigation'
import Link from 'next/link'
import { eq, and, sql } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { libraries, libraryMembers } from '@/db/schema/libraries'

type Props = {
  children: React.ReactNode
  params: Promise<{ id: string }>
}

export default async function LibrarySettingsLayout({ children, params }: Props) {
  const { id } = await params

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    // Redirect to login — use notFound to avoid leaking that the route exists
    notFound()
  }

  const db = await dbAsUser()
  const result = await db.query(async (tx) => {
    const rows = await tx
      .select({
        id: libraries.id,
        name: libraries.name,
        role: libraryMembers.role,
      })
      .from(libraries)
      .innerJoin(
        libraryMembers,
        and(
          eq(libraryMembers.libraryId, libraries.id),
          eq(libraryMembers.userId, sql`auth.uid()`),
        ),
      )
      .where(eq(libraries.id, id))
      .limit(1)
    return rows[0] ?? null
  })

  if (!result) {
    notFound()
  }

  const tabs = [
    { href: `/libraries/${id}/settings`, label: 'General' },
    { href: `/libraries/${id}/settings/members`, label: 'Members' },
  ]

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{result.name} — Settings</h1>
        <p className="text-sm text-muted-foreground capitalize">Your role: {result.role}</p>
      </div>
      <nav className="flex gap-4 border-b pb-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  )
}
