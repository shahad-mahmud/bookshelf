import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

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
