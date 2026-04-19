import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import postgres from 'postgres'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Apply every SQL file under db/migrations/ in alphabetical order.
 * Statements are separated by Drizzle's `--> statement-breakpoint` marker.
 * This bypasses drizzle-kit entirely — useful when drizzle-kit migrate
 * silently fails, and for running hand-written migrations in a pinch.
 *
 * Idempotence: the SQL in our migrations uses CREATE TYPE / CREATE TABLE
 * (not IF NOT EXISTS), so re-running will error. Treat this as one-shot.
 */
async function main() {
  const DIRECT_URL = process.env.DIRECT_URL
  if (!DIRECT_URL) throw new Error('DIRECT_URL required')

  const sql = postgres(DIRECT_URL, { max: 1, prepare: false })
  const dir = join(process.cwd(), 'db', 'migrations')
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  console.log(`Found ${files.length} migration file(s) in ${dir}`)

  try {
    for (const file of files) {
      const content = readFileSync(join(dir, file), 'utf8')
      const statements = content
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--') || s.includes('\n'))

      console.log(`\n→ ${file} (${statements.length} statement${statements.length === 1 ? '' : 's'})`)

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i]
        const preview = stmt.slice(0, 80).replace(/\s+/g, ' ')
        try {
          await sql.unsafe(stmt)
          console.log(`  ✓ [${i + 1}/${statements.length}] ${preview}...`)
        } catch (err) {
          console.error(`  ✗ [${i + 1}/${statements.length}] ${preview}...`)
          console.error(`    ${err instanceof Error ? err.message : String(err)}`)
          throw err
        }
      }
    }
    console.log('\n✓ All migrations applied.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error('\n✗ Migration failed:')
  console.error(err)
  process.exit(1)
})
