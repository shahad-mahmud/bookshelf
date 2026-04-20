import Image from 'next/image'
import { BookOpen } from 'lucide-react'

type Size = 'sm' | 'md' | 'lg'

const dims: Record<Size, { w: number; h: number }> = {
  sm: { w: 48, h: 72 },
  md: { w: 96, h: 144 },
  lg: { w: 160, h: 240 },
}

export function BookCover({
  src,
  title,
  size = 'md',
}: {
  src: string | null
  title: string
  size?: Size
}) {
  const { w, h } = dims[size]

  if (src) {
    return (
      <Image
        src={src}
        alt={`Cover of ${title}`}
        width={w}
        height={h}
        className="rounded object-cover"
        style={{ width: w, height: h }}
      />
    )
  }

  return (
    <div
      className="flex items-center justify-center rounded bg-muted text-muted-foreground"
      style={{ width: w, height: h }}
      aria-label={`No cover for ${title}`}
    >
      <BookOpen className="opacity-40" style={{ width: w * 0.4, height: w * 0.4 }} />
    </div>
  )
}
