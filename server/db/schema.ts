import { pgTable, text, timestamp } from 'drizzle-orm/pg-core'

/**
 * PLACEHOLDER — owned by the data agent.
 *
 * This file only exists so `server/auth.ts` can compile and so the anonymous →
 * real-account merge has something to update. The real definition (with the
 * project payload columns) comes from the data agent; the integrator should
 * replace this wholesale, keeping `projects.userId` as a plain text column.
 */
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})
