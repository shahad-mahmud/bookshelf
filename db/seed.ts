import { config as loadEnv } from 'dotenv'

// Load env *before* any static graph import reaches lib/env.ts
// (which parses process.env at module-load time and throws on missing vars).
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

async function main() {
  const { dbSystem } = await import('./client-system')
  const { currencies } = await import('./schema/catalog')
  const { db, close } = dbSystem()
  try {
    await db
      .insert(currencies)
      .values([
        { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
        { code: 'USD', symbol: '$', name: 'US Dollar' },
      ])
      .onConflictDoNothing()
    console.log('Seeded currencies.')
  } finally {
    await close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
