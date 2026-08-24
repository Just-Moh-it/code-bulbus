/**
 * Two-way sync between an `EditorProject` and the server, Figma-style:
 *
 *   Electric rows ──(live query)──▶ circuit.loadJSON(snapshot, skip)   (inbound)
 *   model change ──(reaction)──▶ diff(lastSent, now) ──▶ /api/data/tx (outbound, ≈150 ms)
 *
 * `lastSent` is the last snapshot we know the server holds. Inbound snapshots
 * skip ids that are held (dragging) or dirty (diff against lastSent is not
 * empty), and advance `lastSent` for everything they did apply so our own
 * echo — and other writers' changes — are never sent back.
 *
 * Local-first: each flush applies its ops to the parts/wires collections
 * optimistically inside one TanStack DB transaction, POSTs them, and waits for
 * Electric to replay the returned Postgres txid before dropping the optimistic
 * state — so the picture never flickers back through the pre-edit rows.
 */
import { useEffect, useRef } from 'react'
import { createTransaction } from '@tanstack/react-db'
import { reaction } from 'mobx'
import {
  applyToSnapshot,
  diffCircuit,
  isEmptyOps,
  opsIds,
  stable,
} from './diff'
import { applyTx } from '#/lib/api'
import { partsCollection, wiresCollection } from '#/lib/collections'
import type { CircuitOps } from './diff'
import type { EditorProject } from '#/editor/models'
import type { CameraJSON, CircuitJSON } from '#/sim/types'

export const FLUSH_MS = 150
const META_FLUSH_MS = 500
/** Electric usually replays a write within a few hundred ms; past this we stop waiting. */
const TXID_TIMEOUT_MS = 5000

export interface ServerSnapshot {
  circuit: CircuitJSON
  /** rows never written: `lastSent` starts empty so the first flush creates them */
  legacy?: boolean
}

/**
 * Apply `ops` to the project's collections optimistically and persist them in
 * one transaction. Resolves once Postgres has the write and Electric has
 * replayed it into the collections we touched.
 */
async function pushOps(projectId: string, ops: CircuitOps) {
  if (isEmptyOps(ops)) return
  const parts = partsCollection(projectId)
  const wires = wiresCollection(projectId)
  const touchedParts = ops.parts.length > 0 || ops.removeParts.length > 0
  const touchedWires = ops.wires.length > 0 || ops.removeWires.length > 0
  const tx = createTransaction({
    mutationFn: async () => {
      const { txid } = await applyTx({ projectId, ...ops })
      const id = Number(txid)
      // Best effort: if the shape never reports the txid we still committed —
      // the stream will deliver server truth on its own.
      const wait = async (
        collection: typeof parts | typeof wires,
        touched: boolean,
      ) => {
        if (!touched) return
        try {
          await collection.utils.awaitTxId(id, TXID_TIMEOUT_MS)
        } catch (e) {
          console.warn('[sync] txid not observed', txid, e)
        }
      }
      await Promise.all([wait(parts, touchedParts), wait(wires, touchedWires)])
    },
  })
  tx.mutate(() => {
    for (const id of ops.removeParts) if (parts.has(id)) parts.delete(id)
    for (const id of ops.removeWires) if (wires.has(id)) wires.delete(id)
    for (const data of ops.parts) {
      if (parts.has(data.id))
        parts.update(data.id, (draft) => void (draft.data = data))
      else parts.insert({ project_id: projectId, id: data.id, data })
    }
    for (const data of ops.wires) {
      if (wires.has(data.id))
        wires.update(data.id, (draft) => void (draft.data = data))
      else wires.insert({ project_id: projectId, id: data.id, data })
    }
  })
  await tx.isPersisted.promise
}

export function useProjectSync(
  project: EditorProject | null,
  server: ServerSnapshot | null | undefined,
) {
  /** Last snapshot the server is known to hold, for the project it belongs to. */
  const lastSent = useRef<{
    project: EditorProject
    circuit: CircuitJSON
  } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  /** Ids this model has held at some point — the only ones it may ask the server to remove. */
  const seen = useRef(new Set<string>())

  // outbound
  useEffect(() => {
    if (!project) return
    const flush = async () => {
      timer.current = null
      const sent = lastSent.current
      if (inFlight.current || sent?.project !== project) {
        schedule()
        return
      }
      const now = project.circuit.toJSON()
      now.parts.forEach((p) => seen.current.add(p.id))
      now.wires.forEach((w) => seen.current.add(w.id))
      const ops = diffCircuit(sent.circuit, now)
      // an entity the model never held (e.g. one reconcile could not build) is not ours to delete
      ops.removeParts = ops.removeParts.filter((id) => seen.current.has(id))
      ops.removeWires = ops.removeWires.filter((id) => seen.current.has(id))
      if (isEmptyOps(ops)) return
      if (ops.removeParts.length || ops.removeWires.length)
        console.warn('[sync] removing', {
          parts: ops.removeParts,
          wires: ops.removeWires,
        })
      inFlight.current = true
      try {
        await pushOps(project.id, ops)
        sent.circuit = applyToSnapshot(sent.circuit, ops)
      } catch (e) {
        console.error('sync flush failed', e)
        schedule(1000)
      } finally {
        inFlight.current = false
      }
    }
    const schedule = (ms = FLUSH_MS) => {
      if (timer.current) return
      timer.current = setTimeout(() => void flush(), ms)
    }
    const stopCircuit = reaction(
      () => stable(project.circuit.toJSON()),
      () => schedule(),
    )
    const stopMeta = reaction(
      () => stable({ name: project.name, camera: project.toJSON().camera }),
      (meta) => {
        const patch = JSON.parse(meta) as {
          name: string
          camera?: CameraJSON
        }
        void applyTx({
          projectId: project.id,
          name: patch.name,
          camera: patch.camera ?? null,
        }).catch((e: unknown) => console.error('sync meta failed', e))
      },
      { delay: META_FLUSH_MS },
    )
    return () => {
      stopCircuit()
      stopMeta()
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [project])

  // inbound
  useEffect(() => {
    if (!project || !server) return
    if (lastSent.current?.project !== project) {
      // first snapshot: the model was built from it. A project whose rows were
      // never written has none, so write them now; from then on only diffs travel.
      const now = project.circuit.toJSON()
      lastSent.current = { project, circuit: now }
      if (server.legacy) {
        const ops = diffCircuit({ parts: [], wires: [] }, now)
        void pushOps(project.id, ops).catch((e: unknown) =>
          console.error('sync seed failed', e),
        )
      }
      return
    }
    const sent = lastSent.current
    const dirty = opsIds(diffCircuit(sent.circuit, project.circuit.toJSON()))
    const skip = new Set([...project.held, ...dirty])
    project.circuit.loadJSON(server.circuit, skip)
    project.circuit.parts.forEach((p) => seen.current.add(p.id))
    project.circuit.wires.forEach((w) => seen.current.add(w.id))
    // server truth for everything we applied; keep our view of skipped ids
    const keep = <T extends { id: string }>(mine: T[], theirs: T[]) => {
      const m = new Map(
        theirs.filter((e) => !skip.has(e.id)).map((e) => [e.id, e]),
      )
      mine.filter((e) => skip.has(e.id)).forEach((e) => m.set(e.id, e))
      return [...m.values()]
    }
    sent.circuit = {
      parts: keep(sent.circuit.parts, server.circuit.parts),
      wires: keep(sent.circuit.wires, server.circuit.wires),
    }
  }, [project, server])
}
