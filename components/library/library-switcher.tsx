'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, ChevronDown, Plus, Settings } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { setCurrentLibraryAction } from '@/lib/actions/library'
import type { CurrentLibrary } from '@/lib/library/current'

export function LibrarySwitcher({
  current,
  libraries,
}: {
  current: CurrentLibrary
  libraries: CurrentLibrary[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const switchTo = (id: string) => {
    if (id === current.id) return
    startTransition(async () => {
      await setCurrentLibraryAction(id)
      router.refresh()
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        <span className="max-w-[200px] truncate">{current.name}</span>
        <span className="text-xs text-muted-foreground">({current.role})</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your libraries</DropdownMenuLabel>
          {libraries.map((lib) => (
            <DropdownMenuItem key={lib.id} onClick={() => switchTo(lib.id)}>
              <span className="flex-1 truncate">{lib.name}</span>
              {lib.id === current.id ? <Check className="h-4 w-4" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          render={<Link href="/libraries/new" className="flex items-center gap-2" />}
        >
          <Plus className="h-4 w-4" /> Create new library
        </DropdownMenuItem>
        <DropdownMenuItem
          render={<Link href={`/libraries/${current.id}/settings`} className="flex items-center gap-2" />}
        >
          <Settings className="h-4 w-4" /> Library settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
