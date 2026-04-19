import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import postgres from 'postgres'
import { randomUUID } from 'node:crypto'

const DIRECT_URL = process.env.DIRECT_URL
if (!DIRECT_URL) throw new Error('DIRECT_URL required')

const sql = postgres(DIRECT_URL, { max: 1 })

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error(`✗ ${msg}`)
    process.exitCode = 1
  } else {
    console.log(`✓ ${msg}`)
  }
}

async function asUser(userId: string, email: string, run: (tx: postgres.TransactionSql) => Promise<void>) {
  try {
    await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userId, role: 'authenticated', email })}, true)`
      await run(tx)
    })
    return true
  } catch {
    return false
  }
}

async function main() {
  const userA = randomUUID()
  const userB = randomUUID()
  const emailA = `smoke-a-${Date.now()}@example.test`
  const emailB = `smoke-b-${Date.now()}@example.test`

  await sql`insert into auth.users (id, email, aud, role) values (${userA}, ${emailA}, 'authenticated', 'authenticated')`
  await sql`insert into auth.users (id, email, aud, role) values (${userB}, ${emailB}, 'authenticated', 'authenticated')`

  try {
    // Triggers should have created profile + personal library + owner membership for each user
    const libA = await sql<Array<{ id: string; name: string }>>`
      select l.id, l.name from libraries l
      join library_members lm on lm.library_id = l.id
      where lm.user_id = ${userA}
    `
    assert(libA.length === 1, 'A has one auto-created library')

    const libB = await sql<Array<{ id: string }>>`
      select l.id from libraries l
      join library_members lm on lm.library_id = l.id
      where lm.user_id = ${userB}
    `
    assert(libB.length === 1, 'B has one auto-created library')

    const libBId = libB[0].id

    // A viewing B's library under RLS → zero rows
    const bLibAsA = await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated', email: emailA })}, true)`
      return tx<Array<{ id: string }>>`select id from libraries where id = ${libBId}`
    })
    assert(bLibAsA.length === 0, "A cannot SELECT B's library under RLS")

    // A inserting a book into B's library should fail (RLS WITH CHECK)
    const aInsertingIntoB = await asUser(userA, emailA, async (tx) => {
      await tx`insert into books (library_id, title) values (${libBId}, 'Attack Vector')`
    })
    assert(!aInsertingIntoB, "A cannot INSERT a book into B's library")

    // Accepting a bogus invite should raise
    const bogusAccept = await asUser(userA, emailA, async (tx) => {
      await tx`select fn_accept_invite('definitely-not-a-real-token')`
    })
    assert(!bogusAccept, 'Bogus invite token is rejected by fn_accept_invite')

    // All 8 public tables must have both RLS and FORCE RLS
    const forced = await sql<Array<{ relname: string }>>`
      select relname from pg_class
      where relnamespace = 'public'::regnamespace and relkind = 'r'
        and relrowsecurity and relforcerowsecurity
      order by relname
    `
    const names = forced.map((r) => r.relname)
    const expected = ['books', 'borrowers', 'currencies', 'libraries', 'library_invites', 'library_members', 'loans', 'profiles']
    assert(
      JSON.stringify(names) === JSON.stringify(expected),
      `FORCE RLS on all 8 public tables (got: ${names.join(',')})`,
    )
  } finally {
    // Tear down: delete libraries first (cascades to members + catalog).
    // Can't delete auth.users directly because the prevent_strand_library
    // trigger blocks removing the sole owner before the library is gone.
    await sql`delete from public.libraries where created_by in (${userA}, ${userB})`
    await sql`delete from auth.users where id in (${userA}, ${userB})`
  }
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .catch((err) => {
    console.error(err)
    sql.end({ timeout: 5 })
    process.exit(1)
  })
