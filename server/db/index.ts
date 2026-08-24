/**
 * Server-side data access: `db` (drizzle over Postgres), the table definitions
 * and every query/mutation the app performs. Imported by the `/api/data/*`
 * routes, the agent tools and the scripts — never by browser code.
 */
export { db, DATABASE_URL } from './client'
export * from './schema'
export * from './queries'
