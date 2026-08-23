import { mutation, query } from './_generated/server'
import { v } from 'convex/values'
import type { MutationCtx, QueryCtx } from './_generated/server'

/** Entity-level ops. Upserts replace the whole entity (last writer wins). */
export const opsValidator = {
  projectId: v.string(),
  parts: v.optional(v.array(v.any())),
  wires: v.optional(v.array(v.any())),
  removeParts: v.optional(v.array(v.string())),
  removeWires: v.optional(v.array(v.string())),
}

async function rowsFor(
  ctx: QueryCtx | MutationCtx,
  table: 'parts' | 'wires',
  projectId: string,
) {
  return ctx.db
    .query(table)
    .withIndex('by_project_id', (q) => q.eq('projectId', projectId))
    .collect()
}

export async function applyOps(
  ctx: MutationCtx,
  args: {
    projectId: string
    parts?: { id: string }[]
    wires?: { id: string }[]
    removeParts?: string[]
    removeWires?: string[]
  },
) {
  for (const table of ['parts', 'wires'] as const) {
    const upserts = (table === 'parts' ? args.parts : args.wires) ?? []
    const removes =
      (table === 'parts' ? args.removeParts : args.removeWires) ?? []
    for (const id of removes) {
      const row = await ctx.db
        .query(table)
        .withIndex('by_project_id', (q) =>
          q.eq('projectId', args.projectId).eq('id', id),
        )
        .unique()
      if (row) await ctx.db.delete(row._id)
    }
    for (const data of upserts) {
      const row = await ctx.db
        .query(table)
        .withIndex('by_project_id', (q) =>
          q.eq('projectId', args.projectId).eq('id', data.id),
        )
        .unique()
      if (row) await ctx.db.patch(row._id, { data })
      else
        await ctx.db.insert(table, {
          projectId: args.projectId,
          id: data.id,
          data,
        })
    }
  }
}

/**
 * The live circuit: project metadata + every part/wire row. A project whose
 * rows have never been written reports its legacy blob with `legacy: true`;
 * the first client to open it writes the rows.
 */
export const get = query({
  args: { projectId: v.string() },
  handler: async (ctx, { projectId }) => {
    const project = await ctx.db
      .query('projects')
      .withIndex('by_public_id', (q) => q.eq('id', projectId))
      .unique()
    if (!project) return null
    const parts = await rowsFor(ctx, 'parts', projectId)
    const wires = await rowsFor(ctx, 'wires', projectId)
    const legacy = parts.length === 0 && wires.length === 0 && !!project.circuit
    const blob = project.circuit as
      { parts?: unknown[]; wires?: unknown[] } | undefined
    return {
      project: {
        id: project.id,
        name: project.name,
        user_id: project.user_id ?? null,
        parent_id: project.parent_id ?? null,
        featured: project.featured ?? false,
        created_at: project.created_at,
        camera: project.camera,
      },
      circuit: legacy
        ? { parts: blob?.parts ?? [], wires: blob?.wires ?? [] }
        : { parts: parts.map((r) => r.data), wires: wires.map((r) => r.data) },
      legacy,
    }
  },
})

export const apply = mutation({
  args: opsValidator,
  handler: async (ctx, args) => {
    if (args.removeParts?.length || args.removeWires?.length)
      console.log(
        'apply remove',
        args.projectId,
        args.removeParts,
        args.removeWires,
      )
    await applyOps(ctx, args)
  },
})
