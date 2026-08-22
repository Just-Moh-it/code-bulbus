import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/**
 * Projects are metadata; the circuit lives as one row per part / wire so
 * browsers and agents can edit different entities without clobbering each
 * other (last writer wins per entity). `projects.circuit` is the legacy blob:
 * read once when a project has no rows yet, never written again.
 */
export default defineSchema({
  projects: defineTable({
    id: v.string(),
    name: v.string(),
    user_id: v.optional(v.union(v.string(), v.null())),
    parent_id: v.optional(v.union(v.string(), v.null())),
    featured: v.optional(v.boolean()),
    created_at: v.string(),
    camera: v.optional(v.any()),
    /** Legacy whole-circuit blob; see module comment. */
    circuit: v.optional(v.any()),
    preview: v.optional(v.id('_storage')),
    agentVersion: v.optional(v.number()),
  })
    .index('by_public_id', ['id'])
    .index('by_user', ['user_id'])
    .index('by_featured', ['featured']),
  parts: defineTable({
    projectId: v.string(),
    id: v.string(),
    /** PartJSON */
    data: v.any(),
  }).index('by_project_id', ['projectId', 'id']),
  wires: defineTable({
    projectId: v.string(),
    id: v.string(),
    /** WireJSON */
    data: v.any(),
  }).index('by_project_id', ['projectId', 'id']),
})
