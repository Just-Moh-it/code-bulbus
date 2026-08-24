/**
 * Postgres schema (drizzle). Projects are metadata; the circuit lives as one
 * row per part / wire so browsers and agents can edit different entities
 * without clobbering each other (last writer wins per entity) and so Electric
 * can stream a shape per project.
 *
 * Column names are snake_case because Electric shapes speak raw SQL columns
 * (`where: "project_id = $1"`, and the browser rows carry `project_id`).
 */
import {
  bigint,
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import type { CameraJSON, PartJSON, WireJSON } from '#/sim/types'

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /**
     * Plain text on purpose: auth lives elsewhere, so there is no foreign key
     * to a users table here.
     */
    userId: text('user_id'),
    parentId: text('parent_id'),
    /** Shown on the landing page. */
    isPublic: boolean('is_public').notNull().default(false),
    featured: boolean('featured').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    camera: jsonb('camera').$type<CameraJSON | null>(),
    /** Shared run state: the editor starts/stops its simulator from this, and agents can drive it. */
    simulating: boolean('simulating').notNull().default(false),
    /** Bumped (to `Date.now()`) whenever an agent writes the circuit. */
    agentVersion: bigint('agent_version', { mode: 'number' })
      .notNull()
      .default(0),
    /** Rendered thumbnail (data URL or absolute URL); written by `bun run previews`. */
    preview: text('preview'),
    /** Hash of the circuit the stored preview was rendered from. */
    previewHash: text('preview_hash'),
  },
  (t) => [
    index('projects_is_public_idx').on(t.isPublic),
    index('projects_user_id_idx').on(t.userId),
  ],
)

export const parts = pgTable(
  'parts',
  {
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    /** PartJSON */
    data: jsonb('data').$type<PartJSON>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
)

export const wires = pgTable(
  'wires',
  {
    projectId: text('project_id').notNull(),
    id: text('id').notNull(),
    /** WireJSON */
    data: jsonb('data').$type<WireJSON>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.id] })],
)

export type ProjectRow = typeof projects.$inferSelect
export type PartRow = typeof parts.$inferSelect
export type WireRow = typeof wires.$inferSelect
