import type { Metadata } from 'next'
import NextTopLoader from 'nextjs-toploader'
import { Toaster } from '@/components/ui/sonner'
import { BottomNav } from '@/components/bottom-nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bookshelf',
  description: 'Track books you own, lend, and want.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh bg-background font-sans antialiased pb-16 md:pb-0">
        <NextTopLoader color="#2299DD" showSpinner={false} />
        {children}
        <Toaster />
        <BottomNav />
      </body>
    </html>
  )
}
