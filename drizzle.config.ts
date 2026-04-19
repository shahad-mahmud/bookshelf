import { config as loadEnv } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Load .env.local first, then .env as fallback. .env.local is project convention
// (gitignored per-developer overrides); .env is optional shared defaults.
loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const directUrl = process.env.DIRECT_URL
if (!directUrl) throw new Error('DIRECT_URL required for Drizzle Kit')

export default defineConfig({
  schema: './db/schema/index.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: directUrl,
  },
  verbose: true,
  strict: true,
})
