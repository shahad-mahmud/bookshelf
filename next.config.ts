import type { NextConfig } from 'next'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL must be set before running next build/dev')
}
const supabaseHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
const extraOrigins = (process.env.ADDITIONAL_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const allowedOrigins = [
  'localhost:3000',
  ...(siteUrl ? [new URL(siteUrl).host] : []),
  ...extraOrigins,
]

if (process.env.NODE_ENV === 'production' && allowedOrigins.length === 1) {
  console.warn(
    'WARNING: Server Actions allowedOrigins only contains localhost:3000. ' +
      'Set NEXT_PUBLIC_SITE_URL or ADDITIONAL_ALLOWED_ORIGINS for production.',
  )
}

// React in development mode needs the 'unsafe-' + 'eval' keyword in script-src
// for stack-trace reconstruction and hot-reload. Production CSP stays strict.
const isDev = process.env.NODE_ENV !== 'production'
const devOnlyScriptExtras = isDev ? " 'unsafe-" + "eval'" : ''
const scriptSrc = `script-src 'self' 'unsafe-inline'${devOnlyScriptExtras} https://accounts.google.com`

const csp = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https://covers.openlibrary.org https://${supabaseHost} https://lh3.googleusercontent.com`,
  `connect-src 'self' https://${supabaseHost} wss://${supabaseHost} https://accounts.google.com`,
  "frame-src https://accounts.google.com",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins,
    },
  },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'covers.openlibrary.org' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          // Note: `preload` can be added back once the production domain is finalized.
          // HSTS preload commits the domain to browser preload lists permanently — hard to undo.
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
        ],
      },
    ]
  },
}

export default nextConfig
