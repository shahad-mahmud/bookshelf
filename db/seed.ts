import { dbSystem } from './client-server'
import { currencies } from './schema/catalog'

async function main() {
  const { db, close } = dbSystem()
  try {
    await db.insert(currencies).values([
      { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka' },
      { code: 'USD', symbol: '$', name: 'US Dollar' },
    ]).onConflictDoNothing()
    console.log('Seeded currencies.')
  } finally {
    await close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
