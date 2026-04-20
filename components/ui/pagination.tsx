import Link from 'next/link'
import { cn } from '@/lib/utils'

export function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number
  totalPages: number
  buildHref: (page: number) => string
}) {
  if (totalPages <= 1) return null

  const pages = getPageNumbers(currentPage, totalPages)

  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-1">
      <PageLink href={currentPage > 1 ? buildHref(currentPage - 1) : undefined} disabled={currentPage <= 1}>
        ←
      </PageLink>
      {pages.map((p, i) =>
        p === '...' ? (
          <span key={`ellipsis-${i}`} className="inline-flex h-8 w-8 items-center justify-center text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <PageLink
            key={p}
            href={p !== currentPage ? buildHref(p as number) : undefined}
            active={p === currentPage}
          >
            {p}
          </PageLink>
        ),
      )}
      <PageLink href={currentPage < totalPages ? buildHref(currentPage + 1) : undefined} disabled={currentPage >= totalPages}>
        →
      </PageLink>
    </nav>
  )
}

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const pages: (number | '...')[] = [1]
  if (current > 3) pages.push('...')
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (current < total - 2) pages.push('...')
  pages.push(total)
  return pages
}

function PageLink({
  href,
  active,
  disabled,
  children,
}: {
  href?: string
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  const cls = cn(
    'inline-flex h-8 w-8 items-center justify-center rounded-md text-sm transition-colors',
    active && 'bg-primary text-primary-foreground font-medium pointer-events-none',
    !active && !disabled && 'hover:bg-muted',
    disabled && 'opacity-40 pointer-events-none',
  )
  if (!href || disabled || active) return <span className={cls}>{children}</span>
  return <Link href={href} className={cls}>{children}</Link>
}
