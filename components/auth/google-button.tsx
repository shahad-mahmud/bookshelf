'use client'

import { Button } from '@/components/ui/button'
import { getBrowserClient } from '@/lib/supabase/client'

export function GoogleButton({ next }: { next?: string }) {
  const onClick = async () => {
    const supabase = getBrowserClient()
    const nextParam = next ? `?next=${encodeURIComponent(next)}` : ''
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback${nextParam}`,
      },
    })
  }
  return (
    <Button type="button" variant="outline" className="w-full" onClick={onClick}>
      Continue with Google
    </Button>
  )
}
