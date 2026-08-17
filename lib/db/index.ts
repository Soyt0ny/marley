import 'server-only'

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from '@/db/schema'

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
}

/**
 * Reuse the connection across hot reloads in development, otherwise every edit opens a new
 * pool and Postgres eventually refuses connections.
 */
const globalForDb = globalThis as unknown as { pool?: ReturnType<typeof postgres> }

const pool =
  globalForDb.pool ??
  postgres(process.env.DATABASE_URL, {
    max: process.env.NODE_ENV === 'production' ? 10 : 3,
  })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool
}

export const db = drizzle(pool, { schema })
export { schema }
