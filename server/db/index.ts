import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

/**
 * PLACEHOLDER — owned by the data agent.
 *
 * Kept deliberately minimal: a `db` export over the porsager `postgres` driver.
 * The client is lazy (no socket is opened until the first query), so importing
 * this module never fails just because Postgres is down or unconfigured.
 */
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgres://postgres:password@localhost:5442/bulbus'

const client = postgres(DATABASE_URL, { max: 10 })

export const db = drizzle(client, { schema })
