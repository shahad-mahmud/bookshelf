'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, Users } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Home',      href: '/',           icon: Home,     exact: true  },
  { label: 'Books',     href: '/books',       icon: BookOpen, exact: false },
  { label: 'Borrowers', href: '/borrowers',   icon: Users,    exact: false },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary navigation" className="fixed bottom-0 left-0 right-0 z-50 flex h-14 border-t bg-background md:hidden">
      {NAV_ITEMS.map(({ label, href, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href)
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
              active ? 'text-primary' : 'text-muted-foreground'
            }`}
          >
            <Icon size={20} />
            <span>{label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
