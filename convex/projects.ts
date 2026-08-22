import { mutation, query } from './_generated/server'
import { v } from 'convex/values'

const rowToJSON = (r: {
  id: string
  name: string
  user_id?: string | null
  parent_id?: string | null
  featured?: boolean
  created_at: string
  camera?: unknown
  circuit: unknown
  preview?: string
  agentVersion?: number
}) => ({
  id: r.id,
  name: r.name,
  user_id: r.user_id ?? null,
  parent_id: r.parent_id ?? null,
  featured: r.featured ?? false,
  created_at: r.created_at,
  camera: r.camera,
  circuit: r.circuit,
  preview: r.preview ?? null,
  agentVersion: r.agentVersion ?? 0,
})

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const row = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    return row ? rowToJSON(row) : null
  },
})

export const list = query({
  args: {
    userId: v.optional(v.string()),
    featured: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, featured, limit }) => {
    let rows
    if (userId !== undefined) {
      rows = await ctx.db
        .query('projects')
        .withIndex('by_user', (q) => q.eq('user_id', userId))
        .order('desc')
        .collect()
    } else if (featured !== undefined) {
      rows = await ctx.db
        .query('projects')
        .withIndex('by_featured', (q) => q.eq('featured', featured))
        .order('desc')
        .collect()
    } else {
      rows = await ctx.db.query('projects').order('desc').collect()
    }
    if (limit) rows = rows.slice(0, limit)
    return rows.map(rowToJSON)
  },
})

export const upsert = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    user_id: v.optional(v.union(v.string(), v.null())),
    parent_id: v.optional(v.union(v.string(), v.null())),
    camera: v.optional(v.any()),
    circuit: v.any(),
    /** Set by agent tools only. */
    agentVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', args.id))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        user_id: args.user_id ?? existing.user_id ?? null,
        parent_id: args.parent_id ?? existing.parent_id ?? null,
        camera: args.camera,
        circuit: args.circuit,
        ...(args.agentVersion !== undefined
          ? { agentVersion: args.agentVersion }
          : {}),
      })
      return rowToJSON({ ...existing, ...args })
    }
    const row = {
      id: args.id,
      name: args.name,
      user_id: args.user_id ?? null,
      parent_id: args.parent_id ?? null,
      featured: false,
      created_at: new Date().toISOString(),
      camera: args.camera,
      circuit: args.circuit,
      agentVersion: args.agentVersion ?? 0,
    }
    await ctx.db.insert('projects', row)
    return rowToJSON(row)
  },
})

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
  },
})

export const generatePreviewUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
})

export const setPreview = mutation({
  args: { id: v.string(), storageId: v.id('_storage') },
  handler: async (ctx, { id, storageId }) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    if (!existing) return
    if (existing.preview) await ctx.storage.delete(existing.preview)
    await ctx.db.patch(existing._id, { preview: storageId })
  },
})

export const previewUrl = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    return existing?.preview ? await ctx.storage.getUrl(existing.preview) : null
  },
})
