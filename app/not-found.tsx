import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">That page doesn&apos;t exist.</p>
        <Link href="/" className="mt-4 inline-block text-sm text-primary hover:underline">Go home</Link>
      </div>
    </main>
  )
}
