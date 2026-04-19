import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LoginForm } from '@/components/auth/login-form'
import { GoogleButton } from '@/components/auth/google-button'

type SearchParams = Promise<{ next?: string }>

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const { next } = await searchParams
  return (
    <Card>
      <CardHeader>
        <CardTitle>Log in to Bookshelf</CardTitle>
        <CardDescription>Welcome back.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoginForm next={next} />
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" /> OR <span className="h-px flex-1 bg-border" />
        </div>
        <GoogleButton next={next} />
        <div className="flex justify-between text-sm">
          <Link href="/forgot-password" className="text-primary hover:underline">Forgot password?</Link>
          <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary hover:underline">Sign up</Link>
        </div>
      </CardContent>
    </Card>
  )
}
