/**
 * The one drizzle handle. Uses the `postgres` (porsager) driver, which runs on
 * Node, Bun and Cloudflare Workers, so the server routes that import this can
 * be deployed anywhere — keep Node-only APIs out of this directory.
 *
 * Import it from `server/db` (this module exists only to keep `index.ts` free
 * of an import cycle with `queries.ts`).
 */
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://postgres:password@localhost:5442/bulbus'

/**
 * `prepare: false` keeps the driver usable behind poolers and in short-lived
 * (serverless) invocations; the queries here are small and unprepared is fine.
 */
const client = postgres(DATABASE_URL, { prepare: false })

export const db = drizzle(client, { schema })
