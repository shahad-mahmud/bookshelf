const BLOCKED_NEXT = new Set(['/login', '/signup'])

export function sanitizeNext(next: string | null | undefined): string {
  if (!next) return '/'
  if (next !== next.trimStart()) return '/'
  if (!next.startsWith('/')) return '/'
  if (next.startsWith('//')) return '/'
  if (next.includes('\\')) return '/'
  if (next.includes('://')) return '/'
  if (BLOCKED_NEXT.has(next)) return '/'
  return next
}
