import { Button } from '@/components/ui/button'
import { logoutAction } from '@/lib/actions/auth'

export function AppHeader({ displayName, email }: { displayName: string | null; email: string | null }) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between p-4">
        <div className="text-sm">
          <div className="font-medium">{displayName ?? email ?? 'You'}</div>
          {email ? <div className="text-xs text-muted-foreground">{email}</div> : null}
        </div>
        <form action={logoutAction}>
          <Button type="submit" variant="outline" size="sm">Log out</Button>
        </form>
      </div>
    </header>
  )
}
