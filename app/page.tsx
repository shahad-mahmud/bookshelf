import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { dbAsUser } from '@/db/client-server'
import { profiles } from '@/db/schema/auth'
import { libraries, libraryMembers } from '@/db/schema/libraries'
import { AppHeader } from '@/components/app-header'
import { createServerClient } from '@/lib/supabase/server'

export default async function HomePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = await dbAsUser()
  const rows = await db.query(async (tx) => {
    const profile = await tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1)
    const member = await tx
      .select({
        libraryId: libraryMembers.libraryId,
        libraryName: libraries.name,
        role: libraryMembers.role,
      })
      .from(libraryMembers)
      .innerJoin(libraries, eq(libraries.id, libraryMembers.libraryId))
      .where(eq(libraryMembers.userId, user.id))
      .limit(1)
    return { profile: profile[0], member: member[0] }
  })

  return (
    <>
      <AppHeader displayName={rows.profile?.displayName ?? null} email={rows.profile?.email ?? null} />
      <main className="mx-auto max-w-3xl p-6">
        <div className="rounded-lg border bg-card p-6">
          <h1 className="text-2xl font-semibold">
            Hello, {rows.profile?.displayName ?? 'friend'}.
          </h1>
          <p className="mt-2 text-muted-foreground">
            You&apos;re in <span className="font-medium text-foreground">{rows.member?.libraryName ?? '(no library)'}</span>
            {rows.member ? <> as <span className="font-medium">{rows.member.role}</span>.</> : null}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as {rows.profile?.email}.
          </p>
        </div>
      </main>
    </>
  )
}
