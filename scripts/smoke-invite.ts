import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

import postgres from 'postgres'
import { randomUUID, randomBytes, createHash } from 'node:crypto'

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

async function main() {
  const userA = randomUUID()
  const userB = randomUUID()
  const emailA = `smoke-invite-a-${Date.now()}@example.test`
  const emailB = `smoke-invite-b-${Date.now()}@example.test`

  await sql`insert into auth.users (id, email, aud, role) values (${userA}, ${emailA}, 'authenticated', 'authenticated')`
  await sql`insert into auth.users (id, email, aud, role) values (${userB}, ${emailB}, 'authenticated', 'authenticated')`

  try {
    // A's personal library (created by trigger).
    const [libA] = await sql<Array<{ id: string }>>`
      select l.id from libraries l
      join library_members lm on lm.library_id = l.id
      where lm.user_id = ${userA} and lm.role = 'owner'
    `
    assert(!!libA, 'A has an owned library')

    // A sends an invite for B's email. Generate token + hash in the script.
    const token = randomBytes(32).toString('base64url')
    const hash = createHash('sha256').update(token).digest()

    await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated', email: emailA })}, true)`
      await tx`select fn_send_invite(${libA.id}::uuid, 'admin'::library_role, ${emailB}, null, ${hash})`
    })

    // B looks up the invite.
    const [lookup] = await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated', email: emailB })}, true)`
      return tx<Array<{ library_id: string; library_name: string; role: string }>>`select * from fn_lookup_invite(${token})`
    }) as unknown as Array<{ library_id: string; library_name: string; role: string }>
    assert(!!lookup, 'B can look up the invite')
    assert(lookup?.library_id === libA.id, "lookup returns A's library")

    // B accepts the invite.
    await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated', email: emailB })}, true)`
      await tx`select fn_accept_invite(${token})`
    })

    // Verify B is now a member.
    const members = await sql<Array<{ user_id: string; role: string }>>`
      select user_id, role from library_members where library_id = ${libA.id}
    `
    const bRow = members.find((m) => m.user_id === userB)
    assert(bRow?.role === 'admin', "B is now admin of A's library")

    // Accepting again should fail.
    let secondAcceptFailed = false
    try {
      await sql.begin(async (tx) => {
        await tx`select set_config('role', 'authenticated', true)`
        await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated', email: emailB })}, true)`
        await tx`select fn_accept_invite(${token})`
      })
    } catch {
      secondAcceptFailed = true
    }
    assert(secondAcceptFailed, 'Second accept of same token is rejected')

    // Transfer ownership from A to B.
    await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userA, role: 'authenticated', email: emailA })}, true)`
      await tx`select fn_transfer_ownership(${libA.id}::uuid, ${userB}::uuid)`
    })

    const postTransfer = await sql<Array<{ user_id: string; role: string }>>`
      select user_id, role from library_members where library_id = ${libA.id}
    `
    const aAfter = postTransfer.find((m) => m.user_id === userA)
    const bAfter = postTransfer.find((m) => m.user_id === userB)
    assert(aAfter?.role === 'admin', 'A is now admin after transfer')
    assert(bAfter?.role === 'owner', 'B is now owner after transfer')

    // Revoke a fresh invite.
    const token2 = randomBytes(32).toString('base64url')
    const hash2 = createHash('sha256').update(token2).digest()
    const emailC = `smoke-invite-c-${Date.now()}@example.test`

    const [newInvite] = await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated', email: emailB })}, true)`
      return tx<Array<{ id: string }>>`select fn_send_invite(${libA.id}::uuid, 'admin'::library_role, ${emailC}, null, ${hash2}) as id`
    }) as unknown as Array<{ id: string }>

    await sql.begin(async (tx) => {
      await tx`select set_config('role', 'authenticated', true)`
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: userB, role: 'authenticated', email: emailB })}, true)`
      await tx`select fn_revoke_invite(${newInvite.id}::uuid)`
    })

    const [revoked] = await sql<Array<{ revoked_at: Date | null }>>`
      select revoked_at from library_invites where id = ${newInvite.id}
    `
    assert(!!revoked?.revoked_at, 'Invite is marked revoked')
  } finally {
    // Teardown: delete libraries first to avoid the prevent_strand_library trigger.
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
