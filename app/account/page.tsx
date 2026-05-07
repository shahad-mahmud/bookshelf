import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { createServerClient } from '@/lib/supabase/server'
import { dbAsUser } from '@/db/client-server'
import { profiles } from '@/db/schema/auth'
import { AppHeader } from '@/components/app-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SetPasswordForm } from '@/components/auth/set-password-form'

const PROVIDER_LABELS: Record<string, string> = {
  email: 'Email & password',
  google: 'Google',
}

export default async function AccountPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = await dbAsUser()
  const profile = await db
    .query((tx) => tx.select().from(profiles).where(eq(profiles.id, user.id)).limit(1))
    .then((r) => r[0])

  const providers = (user.identities ?? []).map((i) => i.provider)
  const hasPassword = providers.includes('email')

  return (
    <>
      <AppHeader displayName={profile?.displayName ?? null} email={profile?.email ?? null} />
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-2xl font-semibold">Account</h1>

        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Name: </span>
              <span>{profile?.displayName ?? '—'}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Email: </span>
              <span>{profile?.email ?? user.email ?? '—'}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-muted-foreground">Sign-in methods:</span>
              {providers.length === 0 ? (
                <span>—</span>
              ) : (
                providers.map((p) => (
                  <span
                    key={p}
                    className="rounded-full border bg-muted px-2 py-0.5 text-xs"
                  >
                    {PROVIDER_LABELS[p] ?? p}
                  </span>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{hasPassword ? 'Password' : 'Add a password'}</CardTitle>
            <CardDescription>
              {hasPassword
                ? 'You can sign in with your email and password.'
                : 'Set a password so you can sign in with your email instead of Google.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {hasPassword ? (
              <p className="text-sm">
                To change your password, use{' '}
                <Link href="/forgot-password" className="text-primary hover:underline">
                  Forgot password
                </Link>
                . We will email you a secure link.
              </p>
            ) : (
              <SetPasswordForm />
            )}
          </CardContent>
        </Card>
      </main>
    </>
  )
}
