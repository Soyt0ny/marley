/**
 * Applies pending migrations from db/migrations.
 *
 * Used instead of `drizzle-kit migrate` so the same code path runs locally and on the VPS —
 * Dokploy calls `npm run db:migrate` as a release step before starting the app.
 *
 *   npm run db:generate   after changing db/schema.ts, to write a new migration
 *   npm run db:migrate    to apply pending migrations
 */

import { existsSync } from 'node:fs'

import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'

for (const file of ['.env.local', '.env']) {
  if (existsSync(file)) {
    process.loadEnvFile(file)
    break
  }
}

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
}

async function main() {
  // `max: 1` because migrations must run sequentially on a single connection.
  const pool = postgres(databaseUrl!, { max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: './db/migrations' })
    console.log('Migrations applied.')
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
