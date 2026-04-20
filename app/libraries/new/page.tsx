import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { LibraryForm } from '@/components/library/library-form'

export default function NewLibraryPage() {
  return (
    <main className="mx-auto max-w-md p-6">
      <Card>
        <CardHeader>
          <CardTitle>Create a library</CardTitle>
          <CardDescription>
            You&apos;ll be the owner. You can invite others after creating.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LibraryForm mode="create" />
          <p className="text-sm">
            <Link href="/" className="text-primary hover:underline">Back home</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
