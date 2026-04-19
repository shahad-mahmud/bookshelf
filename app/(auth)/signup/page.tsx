import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { SignUpForm } from '@/components/auth/signup-form'
import { GoogleButton } from '@/components/auth/google-button'

type SearchParams = Promise<{ next?: string }>

export default async function SignUpPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams
  return (
    <Card>
      <CardHeader>
        <CardTitle>Create your Bookshelf account</CardTitle>
        <CardDescription>A personal library, yours and friends&apos;.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SignUpForm next={next} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleButton next={next} />
        <p className="text-center text-sm">
          Already have an account?{' '}
          <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary hover:underline">
            Log in
          </Link>
        </p>
      </CardContent>
    </Card>
  )
}
