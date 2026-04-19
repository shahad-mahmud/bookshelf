import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'
import { sanitizeNext } from '@/lib/auth/redirect'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const errorCode = url.searchParams.get('error_code') ?? url.searchParams.get('error')
  const next = sanitizeNext(url.searchParams.get('next'))

  if (errorCode) {
    const errUrl = new URL('/login', url.origin)
    errUrl.searchParams.set('authError', '1')
    return NextResponse.redirect(errUrl)
  }

  if (!code) {
    return NextResponse.redirect(new URL('/login', url.origin))
  }

  const supabase = await createServerClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    const errUrl = new URL('/login', url.origin)
    errUrl.searchParams.set('authError', '1')
    return NextResponse.redirect(errUrl)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
