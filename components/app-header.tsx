import Link from 'next/link'
import { UserCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logoutAction } from '@/lib/actions/auth'
import { LibrarySwitcher } from '@/components/library/library-switcher'
import { listUserLibraries, getCurrentLibrary } from '@/lib/library/current'

export async function AppHeader({ displayName, email }: { displayName: string | null; email: string | null }) {
  const current = await getCurrentLibrary()
  const libraries = await listUserLibraries()
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 p-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm font-semibold tracking-tight hover:opacity-75">
            Bookshelf
          </Link>
          <LibrarySwitcher current={current} libraries={libraries} />
        </div>
        <div className="flex items-center gap-3">
          <Link href="/account" className="hidden text-right text-sm hover:opacity-75 md:block">
            <div className="font-medium">{displayName ?? email ?? 'You'}</div>
            {email ? <div className="text-xs text-muted-foreground">{email}</div> : null}
          </Link>
          <Link
            href="/account"
            aria-label="Account"
            className="text-muted-foreground hover:text-foreground md:hidden"
          >
            <UserCircle2 className="h-6 w-6" />
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="outline" size="sm">Log out</Button>
          </form>
        </div>
      </div>
    </header>
  )
}
