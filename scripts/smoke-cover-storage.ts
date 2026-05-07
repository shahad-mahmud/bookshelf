import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import { createServiceRoleClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { env } from '@/lib/env'

/**
 * Storage RLS smoke test for the `book-covers` bucket.
 *
 *   1) Service-role can upload (sanity — RLS bypass).
 *   2) Anonymous client cannot upload (RLS denial).
 *   3) Anyone can read the public URL (bucket is public).
 *   4) Cleanup the probe object.
 *
 * The probe path uses an all-zero placeholder library UUID. The
 * `fn_library_access` policy will block any real authenticated user from
 * writing under it, while the service role bypasses RLS entirely.
 */
async function main() {
  const admin = createServiceRoleClient()

  // 1) Service-role can always upload — sanity check first.
  const tinyWebp = Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+B6N/d', 'base64')
  const probePath = '00000000-0000-0000-0000-000000000000/_smoke.webp'
  const { error: putErr } = await admin.storage
    .from('book-covers')
    .upload(probePath, tinyWebp, { upsert: true, contentType: 'image/webp' })
  if (putErr) throw new Error(`service-role upload failed: ${putErr.message}`)
  console.log('[smoke] service-role upload ok')

  // 2) Anonymous client must NOT be able to upload.
  const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  const { error: anonErr } = await anon.storage
    .from('book-covers')
    .upload(probePath, tinyWebp, { upsert: true })
  if (!anonErr) throw new Error('expected anonymous upload to be denied, but it succeeded')
  console.log('[smoke] anonymous upload denied:', anonErr.message)

  // 3) Public read works (bucket is public).
  const { data: publicUrl } = anon.storage.from('book-covers').getPublicUrl(probePath)
  const res = await fetch(publicUrl.publicUrl)
  if (!res.ok) throw new Error(`public read failed: status ${res.status}`)
  console.log('[smoke] public read ok')

  // 4) Cleanup
  await admin.storage.from('book-covers').remove([probePath])
  console.log('[smoke] cleanup ok')
}

main().catch((err) => {
  console.error('[smoke] fatal', err)
  process.exit(1)
})
