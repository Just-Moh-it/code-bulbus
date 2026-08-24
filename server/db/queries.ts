/**
 * Every write the app performs, as plain drizzle. The HTTP routes under
 * `src/routes/api/data/` are thin wrappers around these; the agent tools and
 * the scripts import them directly (same behaviour, no round trip).
 *
 * Each mutation runs in one transaction and returns that transaction's
 * `pg_current_xact_id()` as a string, so an Electric-backed collection in the
 * browser can `awaitTxId` on it and drop its optimistic state exactly when the
 * synced rows arrive.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from './client'
import { parts, projects, wires } from './schema'
import type { PgTransaction } from 'drizzle-orm/pg-core'
import type {
  CameraJSON,
  CircuitJSON,
  PartJSON,
  ProjectJSON,
  WireJSON,
} from '#/sim/types'

/** The transaction shape drizzle hands to `db.transaction` — spelled loosely so the driver generics stay out of every signature. */
type Tx = PgTransaction<never, never, never>

/** Project metadata as the app reads it (Convex `rowToJSON` plus the run/agent state). */
export interface ProjectMeta {
  id: string
  name: string
  user_id: string | null
  parent_id: string | null
  featured: boolean
  isPublic: boolean
  created_at: string
  camera: CameraJSON | null
  simulating: boolean
  agentVersion: number
  preview: string | null
}

export type ProjectSnapshot = ProjectMeta & { circuit: CircuitJSON }

type ProjectRow = typeof projects.$inferSelect

export const rowToMeta = (r: ProjectRow): ProjectMeta => ({
  id: r.id,
  name: r.name,
  user_id: r.userId,
  parent_id: r.parentId,
  featured: r.featured,
  isPublic: r.isPublic,
  created_at:
    r.createdAt instanceof Date
      ? r.createdAt.toISOString()
      : String(r.createdAt),
  camera: r.camera ?? null,
  simulating: r.simulating,
  agentVersion: Number(r.agentVersion ?? 0),
  preview: r.preview,
})

/** The transaction id the current transaction writes under (what Electric echoes back). */
async function currentTxid(tx: Tx): Promise<string> {
  const rows = (await tx.execute(
    sql`select pg_current_xact_id()::xid::text as txid`,
  )) as unknown as Array<{ txid: string }>
  return rows[0].txid
}

/** Entity-level ops plus optional project metadata — the single write path. */
export interface TxInput {
  projectId: string
  parts?: PartJSON[]
  removeParts?: string[]
  wires?: WireJSON[]
  removeWires?: string[]
  name?: string
  camera?: CameraJSON | null
  simulating?: boolean
  agentVersion?: number
}

async function applyOps(tx: Tx, input: TxInput) {
  const table = { parts, wires } as const
  for (const key of ['parts', 'wires'] as const) {
    const t = table[key]
    const removes =
      (key === 'parts' ? input.removeParts : input.removeWires) ?? []
    if (removes.length)
      await tx
        .delete(t)
        .where(and(eq(t.projectId, input.projectId), inArray(t.id, removes)))
    const upserts = (key === 'parts' ? input.parts : input.wires) ?? []
    if (upserts.length)
      await tx
        .insert(t)
        .values(
          upserts.map((data) => ({
            projectId: input.projectId,
            id: data.id,
            // `t` is `parts | wires`, so its jsonb column type is the
            // intersection of PartJSON and WireJSON; the loop keeps them paired.
            data: data as never,
          })),
        )
        .onConflictDoUpdate({
          target: [t.projectId, t.id],
          set: { data: sql`excluded.data` },
        })
  }
}

/**
 * Apply entity ops and/or metadata in one transaction (the Convex
 * `circuit.apply` + `projects.update` + `projects.setSimulating` trio).
 */
export async function applyTx(input: TxInput): Promise<{ txid: string }> {
  return db.transaction(async (tx) => {
    await applyOps(tx as Tx, input)
    const patch: Partial<typeof projects.$inferInsert> = {}
    if (input.name !== undefined) patch.name = input.name
    if (input.camera !== undefined) patch.camera = input.camera
    if (input.simulating !== undefined) patch.simulating = input.simulating
    if (input.agentVersion !== undefined)
      patch.agentVersion = input.agentVersion
    if (Object.keys(patch).length)
      await tx
        .update(projects)
        .set(patch)
        .where(eq(projects.id, input.projectId))
    return { txid: await currentTxid(tx as Tx) }
  })
}

export interface CreateProjectInput {
  id: string
  name: string
  user_id?: string | null
  parent_id?: string | null
  camera?: CameraJSON | null
  parts?: PartJSON[]
  wires?: WireJSON[]
}

/** Create a project with its initial parts/wires (template, fork, agent). No-op if it exists. */
export async function createProject(
  input: CreateProjectInput,
): Promise<{ created: boolean; txid: string }> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(projects)
      .values({
        id: input.id,
        name: input.name,
        userId: input.user_id ?? null,
        parentId: input.parent_id ?? null,
        featured: false,
        camera: input.camera ?? null,
      })
      .onConflictDoNothing({ target: projects.id })
      .returning({ id: projects.id })
    const created = inserted.length > 0
    if (created)
      await applyOps(tx as Tx, {
        projectId: input.id,
        parts: input.parts ?? [],
        wires: input.wires ?? [],
      })
    return { created, txid: await currentTxid(tx as Tx) }
  })
}

/** Copy a project (metadata + every part/wire row) under a new id. */
export async function duplicateProject(input: {
  id: string
  newId: string
  name?: string
}): Promise<{ id: string; txid: string }> {
  return db.transaction(async (tx) => {
    const [src] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, input.id))
      .limit(1)
    if (!src) throw new Error('project not found')
    await tx.insert(projects).values({
      id: input.newId,
      name: input.name ?? `${src.name} (copy)`,
      userId: src.userId,
      parentId: input.id,
      featured: false,
      isPublic: false,
      camera: src.camera,
    })
    for (const t of [parts, wires] as const) {
      const rows = await tx.select().from(t).where(eq(t.projectId, input.id))
      if (rows.length)
        await tx.insert(t).values(
          rows.map((r) => ({
            projectId: input.newId,
            id: r.id,
            data: r.data,
          })),
        )
    }
    return { id: input.newId, txid: await currentTxid(tx as Tx) }
  })
}

export async function removeProject(id: string): Promise<{ txid: string }> {
  return db.transaction(async (tx) => {
    await tx.delete(parts).where(eq(parts.projectId, id))
    await tx.delete(wires).where(eq(wires.projectId, id))
    await tx.delete(projects).where(eq(projects.id, id))
    return { txid: await currentTxid(tx as Tx) }
  })
}

export async function setProjectPublic(
  id: string,
  isPublic: boolean,
): Promise<{ txid: string }> {
  return db.transaction(async (tx) => {
    await tx.update(projects).set({ isPublic }).where(eq(projects.id, id))
    return { txid: await currentTxid(tx as Tx) }
  })
}

/** Store a rendered thumbnail plus the circuit hash it was rendered from. */
export async function setProjectPreview(
  id: string,
  preview: string,
  hash?: string,
): Promise<{ txid: string }> {
  return db.transaction(async (tx) => {
    await tx
      .update(projects)
      .set({ preview, previewHash: hash ?? null })
      .where(eq(projects.id, id))
    return { txid: await currentTxid(tx as Tx) }
  })
}

/** Project metadata only. */
export async function getProjectMeta(id: string): Promise<ProjectMeta | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1)
  return row ? rowToMeta(row) : null
}

/** The live circuit: project metadata + every part/wire row. */
export async function getProject(id: string): Promise<ProjectSnapshot | null> {
  const meta = await getProjectMeta(id)
  if (!meta) return null
  const [partRows, wireRows] = await Promise.all([
    db.select().from(parts).where(eq(parts.projectId, id)),
    db.select().from(wires).where(eq(wires.projectId, id)),
  ])
  return {
    ...meta,
    circuit: {
      parts: partRows.map((r) => r.data),
      wires: wireRows.map((r) => r.data),
    },
  }
}

/** `ProjectJSON` as the editor models consume it. */
export const toProjectJSON = (s: ProjectSnapshot): ProjectJSON => ({
  id: s.id,
  name: s.name,
  user_id: s.user_id,
  parent_id: s.parent_id,
  featured: s.featured,
  created_at: s.created_at,
  camera: s.camera ?? undefined,
  circuit: s.circuit,
})

export async function listProjects(filter?: {
  isPublic?: boolean
  userId?: string
  featured?: boolean
  limit?: number
}): Promise<ProjectMeta[]> {
  const where = []
  if (filter?.isPublic !== undefined)
    where.push(eq(projects.isPublic, filter.isPublic))
  if (filter?.userId !== undefined)
    where.push(eq(projects.userId, filter.userId))
  if (filter?.featured !== undefined)
    where.push(eq(projects.featured, filter.featured))
  const rows = await db
    .select()
    .from(projects)
    .where(where.length ? and(...where) : undefined)
    .orderBy(sql`${projects.createdAt} desc`)
    .limit(filter?.limit ?? 1000)
  return rows.map(rowToMeta)
}

/**
 * Order-independent digest of a project's circuit (FNV-1a over each entity's
 * sorted-key JSON, xor-folded). Two circuits that render the same picture hash
 * the same, so previews are only re-rendered when the geometry really changed.
 */
function hashEntities(rows: Array<{ data: unknown }>) {
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

export function circuitHash(circuit: CircuitJSON) {
  const p = circuit.parts.map((data) => ({ data }))
  const w = circuit.wires.map((data) => ({ data }))
  return `${hashEntities(p)}-${hashEntities(w)}-${p.length}.${w.length}`
}

/** Projects whose stored preview no longer matches their circuit. */
export async function stalePreviews(
  limit = 20,
): Promise<Array<{ id: string; hash: string }>> {
  const rows = await db
    .select()
    .from(projects)
    .orderBy(sql`${projects.createdAt} desc`)
  const stale: Array<{ id: string; hash: string }> = []
  for (const row of rows) {
    const [partRows, wireRows] = await Promise.all([
      db.select().from(parts).where(eq(parts.projectId, row.id)),
      db.select().from(wires).where(eq(wires.projectId, row.id)),
    ])
    const hash = circuitHash({
      parts: partRows.map((r) => r.data),
      wires: wireRows.map((r) => r.data),
    })
    // nothing to draw yet: a project with no rows would render an empty frame
    if (hash.endsWith('0.0')) continue
    if (row.previewHash !== hash) stale.push({ id: row.id, hash })
    if (stale.length >= limit) break
  }
  return stale
}
