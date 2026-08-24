import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://postgres:password@localhost:5442/bulbus',
  },
})
