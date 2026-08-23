import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { applyOps } from './circuit'

const rowToJSON = (r: {
  id: string
  name: string
  user_id?: string | null
  parent_id?: string | null
  featured?: boolean
  created_at: string
  camera?: unknown
  circuit?: unknown
  preview?: string
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

/** Create a project with its initial parts/wires (template, fork, agent). No-op if it exists. */
export const create = mutation({
  args: {
    id: v.string(),
    name: v.string(),
    user_id: v.optional(v.union(v.string(), v.null())),
    parent_id: v.optional(v.union(v.string(), v.null())),
    camera: v.optional(v.any()),
    parts: v.array(v.any()),
    wires: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', args.id))
      .unique()
    if (existing) return false
    await ctx.db.insert('projects', {
      id: args.id,
      name: args.name,
      user_id: args.user_id ?? null,
      parent_id: args.parent_id ?? null,
      featured: false,
      created_at: new Date().toISOString(),
      camera: args.camera,
    })
    await applyOps(ctx, {
      projectId: args.id,
      parts: args.parts,
      wires: args.wires,
    })
    return true
  },
})

/** Start or stop the project's simulation; every open editor follows this flag. */
export const setSimulating = mutation({
  args: { id: v.string(), simulating: v.boolean() },
  handler: async (ctx, { id, simulating }) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    if (!existing) throw new Error(`Project ${id} not found`)
    await ctx.db.patch(existing._id, { simulating })
  },
})

/** Project metadata (name, camera). Circuit edits go through `circuit.apply`. */
export const update = mutation({
  args: {
    id: v.string(),
    name: v.optional(v.string()),
    camera: v.optional(v.any()),
  },
  handler: async (ctx, { id, ...patch }) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    if (!existing) return
    await ctx.db.patch(existing._id, patch)
  },
})

export const remove = mutation({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    if (!existing) return
    for (const table of ['parts', 'wires'] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_project_id', (q) => q.eq('projectId', id))
        .collect()
      for (const r of rows) await ctx.db.delete(r._id)
    }
    await ctx.db.delete(existing._id)
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
