import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import { applyOps } from './circuit'
import type { QueryCtx } from './_generated/server'

const rowToJSON = (r: {
  id: string
  name: string
  user_id?: string | null
  parent_id?: string | null
  featured?: boolean
  isPublic?: boolean
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
  isPublic: r.isPublic ?? false,
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
    isPublic: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { userId, featured, isPublic, limit }) => {
    let rows
    if (isPublic !== undefined) {
      rows = await ctx.db
        .query('projects')
        .withIndex('by_is_public', (q) => q.eq('isPublic', isPublic))
        .order('desc')
        .collect()
    } else if (userId !== undefined) {
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
    return Promise.all(
      rows.map(async (r) => ({
        ...rowToJSON(r),
        previewUrl: r.preview ? await ctx.storage.getUrl(r.preview) : null,
      })),
    )
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

/**
 * Order-independent digest of a project's circuit (FNV-1a over each entity's
 * sorted-key JSON, xor-folded). Two circuits that render the same picture hash
 * the same, so previews are only re-rendered when the geometry really changed.
 */
function hashEntities(rows: { id: string; data: unknown }[]) {
  let acc = 0
  for (const row of rows) {
    let h = 0x811c9dc5
    const json = JSON.stringify(row.data, (_k, v: unknown) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, (v as Record<string, unknown>)[k]]),
          )
        : v,
    )
    for (let i = 0; i < json.length; i++) {
      h ^= json.charCodeAt(i)
      h = Math.imul(h, 0x01000193)
    }
    acc = (acc ^ h) >>> 0
  }
  return acc.toString(16).padStart(8, '0')
}

export async function circuitHash(ctx: QueryCtx, projectId: string) {
  const parts = await ctx.db
    .query('parts')
    .withIndex('by_project_id', (q) => q.eq('projectId', projectId))
    .collect()
  const wires = await ctx.db
    .query('wires')
    .withIndex('by_project_id', (q) => q.eq('projectId', projectId))
    .collect()
  return `${hashEntities(parts)}-${hashEntities(wires)}-${parts.length}.${wires.length}`
}

/** Projects whose stored preview no longer matches their circuit. */
export const stalePreviews = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit = 20 }) => {
    const rows = await ctx.db.query('projects').order('desc').collect()
    const stale = []
    for (const row of rows) {
      const hash = await circuitHash(ctx, row.id)
      // nothing to draw yet: a project with no rows would render an empty frame
      if (hash.endsWith('0.0')) continue
      if (row.previewHash !== hash) stale.push({ id: row.id, hash })
      if (stale.length >= limit) break
    }
    return stale
  },
})

export const generatePreviewUploadUrl = mutation({
  args: {},
  handler: async (ctx) => ctx.storage.generateUploadUrl(),
})

export const setPreview = mutation({
  args: {
    id: v.string(),
    storageId: v.id('_storage'),
    /** The `stalePreviews` hash this image was rendered from. */
    hash: v.optional(v.string()),
  },
  handler: async (ctx, { id, storageId, hash }) => {
    const existing = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    if (!existing) return
    // best effort: the old file may already be gone
    if (existing.preview && existing.preview !== storageId)
      await ctx.storage.delete(existing.preview).catch(() => {})
    await ctx.db.patch(existing._id, { preview: storageId, previewHash: hash })
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

/** Copy a project (metadata + every part/wire row) under a new id. */
export const duplicate = mutation({
  args: { id: v.string(), newId: v.string(), name: v.optional(v.string()) },
  handler: async (ctx, { id, newId, name }) => {
    const src = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    if (!src) throw new Error('project not found')
    await ctx.db.insert('projects', {
      id: newId,
      name: name ?? `${src.name} (copy)`,
      user_id: src.user_id ?? null,
      parent_id: id,
      featured: false,
      isPublic: false,
      created_at: new Date().toISOString(),
      camera: src.camera,
      circuit: src.circuit,
    })
    for (const table of ['parts', 'wires'] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_project_id', (q) => q.eq('projectId', id))
        .collect()
      for (const r of rows)
        await ctx.db.insert(table, { projectId: newId, id: r.id, data: r.data })
    }
    return newId
  },
})

export const setPublic = mutation({
  args: { id: v.string(), isPublic: v.boolean() },
  handler: async (ctx, { id, isPublic }) => {
    const row = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', id))
      .unique()
    if (row) await ctx.db.patch(row._id, { isPublic })
  },
})
