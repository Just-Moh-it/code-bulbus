import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  // Explicit list rather than a glob: `server/db/index.ts` exports the client,
  // not tables, and drizzle-kit should not import it.
  schema: ['./server/db/auth-schema.ts', './server/db/schema.ts'],
  out: './server/db/migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://postgres:password@localhost:5442/bulbus',
  },
})
