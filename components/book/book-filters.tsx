'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function BookFilters({ q, status }: { q: string; status: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  function push(updates: { q?: string; status?: string }) {
    const next = { q, status, ...updates }
    const params = new URLSearchParams()
    if (next.q) params.set('q', next.q)
    if (next.status !== 'all') params.set('status', next.status)
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname))
  }

  return (
    <div className="mb-4 flex gap-2">
      <Input
        type="search"
        placeholder="Search title or author…"
        defaultValue={q}
        onChange={(e) => push({ q: e.target.value })}
        className="flex-1"
      />
      <Select
        value={status}
        onValueChange={(value) => { if (value !== null) push({ status: value }) }}
      >
        <SelectTrigger className="w-full sm:w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="owned">Owned</SelectItem>
          <SelectItem value="wishlist">Wishlist</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}
