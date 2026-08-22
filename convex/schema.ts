import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

/** Mirrors withdiode's `projects` row: id/name/user_id/parent_id/camera/circuit (+featured, created_at). */
export default defineSchema({
  projects: defineTable({
    id: v.string(),
    name: v.string(),
    user_id: v.optional(v.union(v.string(), v.null())),
    parent_id: v.optional(v.union(v.string(), v.null())),
    featured: v.optional(v.boolean()),
    created_at: v.string(),
    camera: v.optional(v.any()),
    circuit: v.any(),
    preview: v.optional(v.id('_storage')),
  })
    .index('by_public_id', ['id'])
    .index('by_user', ['user_id'])
    .index('by_featured', ['featured']),
})
