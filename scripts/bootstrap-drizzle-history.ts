import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import postgres from 'postgres'

const DIRECT_URL = process.env.DIRECT_URL
if (!DIRECT_URL) throw new Error('DIRECT_URL required')

const migrationsFolder = join(process.cwd(), 'db', 'migrations')
const journal = JSON.parse(
  readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'),
)

const sql = postgres(DIRECT_URL, { max: 1, prepare: false })

async function main() {
  await sql`CREATE SCHEMA IF NOT EXISTS drizzle`
  await sql`
    CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
      id   SERIAL PRIMARY KEY,
      hash TEXT   NOT NULL,
      created_at BIGINT
    )
  `

  const [{ count }] = await sql<[{ count: string }]>`
    SELECT COUNT(*) AS count FROM drizzle.__drizzle_migrations
  `
  if (Number(count) > 0) {
    console.log('Migration history already present — nothing to do.')
    await sql.end()
    return
  }

  for (const entry of journal.entries) {
    const content = readFileSync(join(migrationsFolder, `${entry.tag}.sql`), 'utf8')
    const hash = createHash('sha256').update(content).digest('hex')
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})
    `
    console.log(`  ✓ recorded ${entry.tag}  (created_at=${entry.when})`)
  }

  console.log('Bootstrap complete. drizzle-kit migrate will only apply new migrations.')
  await sql.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
