import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

// Import supabase-js directly and read env from process.env to avoid the
// eager validation in lib/env.ts / lib/env-server.ts, which runs at module
// load — before dotenv side-effects have a chance to populate process.env
// under tsx's hoisted-imports execution order. This matches scripts/smoke-rls.ts.
import { createClient } from '@supabase/supabase-js'
import postgres from 'postgres'
import { randomUUID } from 'node:crypto'

const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
const PUBLISHABLE_KEY = requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
const DIRECT_URL = requireEnv('DIRECT_URL')

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} required`)
  return v
}

/**
 * Storage RLS smoke test for the `book-covers` bucket.
 *
 *   1) Service-role can upload (sanity — RLS bypass).
 *   2) Anonymous client cannot upload (RLS denial).
 *   3) Public CDN read works (bucket is public).
 *   4) Authenticated library member upload — currently MUST fail with the
 *      anon-equivalent RLS message because Supabase Storage rejects ES256
 *      user JWTs and treats them as anonymous. This assertion exists so a
 *      future Supabase fix that flips this back to "works" reminds us to
 *      drop the service-role workaround in lib/actions/book.ts.
 */
async function main() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const tinyWebp = Buffer.from('UklGRhwAAABXRUJQVlA4TBAAAAAvAAAAAAfQ//73v/+B6N/d', 'base64')

  // 1) Service-role can always upload — sanity check first.
  const probePath = '00000000-0000-0000-0000-000000000000/_smoke.webp'
  const { error: putErr } = await admin.storage
    .from('book-covers')
    .upload(probePath, tinyWebp, { upsert: true, contentType: 'image/webp' })
  if (putErr) throw new Error(`service-role upload failed: ${putErr.message}`)
  console.log('[smoke] service-role upload ok')

  // 2) Anonymous client must NOT be able to upload.
  const anon = createClient(SUPABASE_URL, PUBLISHABLE_KEY)
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

  // 4) Authenticated library member upload — assert current bug state.
  await assertAuthenticatedMemberUploadIsBroken({ tinyWebp })

  // Cleanup probe object created by step 1.
  await admin.storage.from('book-covers').remove([probePath])
  console.log('[smoke] cleanup ok')
}

/**
 * Spins up a throwaway user + library, signs the user in, attempts a Storage
 * upload to that library's path, and asserts it fails with the same RLS
 * message anonymous gets. This is the symptom of upstream Supabase Storage
 * not validating ES256 JWTs (see lib/supabase/admin.ts comment).
 */
async function assertAuthenticatedMemberUploadIsBroken(args: { tinyWebp: Buffer }) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const sql = postgres(DIRECT_URL, { max: 1 })
  const tempLibId = randomUUID()
  const tempEmail = `_smoke_${Date.now()}@example.invalid`
  const tempPassword = `pw_${Date.now()}_${Math.random().toString(36).slice(2)}`
  let userId: string | null = null

  try {
    const created = await admin.auth.admin.createUser({
      email: tempEmail, password: tempPassword, email_confirm: true,
    })
    if (created.error) throw new Error(`createUser: ${created.error.message}`)
    userId = created.data.user!.id

    await sql.begin(async (tx) => {
      await tx`INSERT INTO public.libraries (id, name, created_by) VALUES (${tempLibId}::uuid, 'smoke-cover', ${userId}::uuid)`
      await tx`INSERT INTO public.library_members (library_id, user_id, role) VALUES (${tempLibId}::uuid, ${userId}::uuid, 'owner')`
    })

    const userClient = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const signin = await userClient.auth.signInWithPassword({ email: tempEmail, password: tempPassword })
    if (signin.error) throw new Error(`signIn: ${signin.error.message}`)

    const path = `${tempLibId}/${randomUUID()}.webp`
    const { error: upErr } = await userClient.storage.from('book-covers').upload(path, args.tinyWebp, {
      contentType: 'image/webp', upsert: true,
    })
    if (!upErr) {
      throw new Error(
        '[smoke] authenticated member upload SUCCEEDED — Supabase Storage may have fixed ES256 JWT validation. ' +
        'Drop the service-role workaround in lib/actions/book.ts and invert this assertion.',
      )
    }
    if (!upErr.message.toLowerCase().includes('row-level security')) {
      throw new Error(`[smoke] authenticated member upload failed with unexpected error: ${upErr.message}`)
    }
    console.log('[smoke] authenticated member upload denied (expected, ES256 storage bug):', upErr.message)
  } finally {
    if (userId) {
      try {
        const owned = await sql`SELECT library_id FROM public.library_members WHERE user_id = ${userId}::uuid AND role = 'owner'`
        for (const r of owned) await sql`DELETE FROM public.libraries WHERE id = ${r.library_id as string}::uuid`
        const rest = await sql`SELECT 1 FROM public.library_members WHERE user_id = ${userId}::uuid`
        if (rest.length > 0) await sql`DELETE FROM public.library_members WHERE user_id = ${userId}::uuid`
      } catch (err) { console.error('[smoke] lib cleanup failed:', err) }
      const del = await admin.auth.admin.deleteUser(userId)
      if (del.error) console.error('[smoke] user cleanup failed:', del.error.message)
    }
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('[smoke] fatal', err)
  process.exit(1)
})
