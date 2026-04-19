import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import postgres from 'postgres'

/**
 * DESTRUCTIVE: drops everything in the `public` schema and drops the two
 * triggers this project attaches to `auth.users`. Used to start clean after
 * a partial migration failure.
 *
 * Only runs if `DB_RESET_CONFIRM=yes` is in the environment — prevents
 * accidentally wiping a live DB by typing `npm run db:reset`.
 */
async function main() {
  if (process.env.DB_RESET_CONFIRM !== 'yes') {
    console.error('Refusing to run without DB_RESET_CONFIRM=yes')
    console.error('Run with:  DB_RESET_CONFIRM=yes npm run db:reset')
    process.exit(1)
  }

  const DIRECT_URL = process.env.DIRECT_URL
  if (!DIRECT_URL) throw new Error('DIRECT_URL required')

  const sql = postgres(DIRECT_URL, { max: 1, prepare: false })
  try {
    console.log('Dropping project triggers on auth.users...')
    await sql`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users`
    await sql`DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users`

    console.log('Dropping schema "public" (cascades everything we created)...')
    await sql`DROP SCHEMA IF EXISTS public CASCADE`

    console.log('Recreating schema "public" with default grants...')
    await sql`CREATE SCHEMA public`
    await sql`GRANT ALL ON SCHEMA public TO postgres`
    await sql`GRANT ALL ON SCHEMA public TO anon`
    await sql`GRANT ALL ON SCHEMA public TO authenticated`
    await sql`GRANT ALL ON SCHEMA public TO service_role`

    console.log('\n✓ Reset complete. You can now run: npm run db:apply')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('\n✗ Reset failed:')
  console.error(err)
  process.exit(1)
})
