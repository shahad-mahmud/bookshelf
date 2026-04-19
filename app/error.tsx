'use client'

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message || 'Unknown error'}</p>
        <button onClick={reset} className="mt-4 text-sm text-primary hover:underline">Try again</button>
      </div>
    </main>
  )
}
