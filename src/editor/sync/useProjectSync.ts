/**
 * Two-way sync between an `EditorProject` and Convex, Figma-style:
 *
 *   server rows ──(useQuery)──▶ circuit.loadJSON(snapshot, skip)   (inbound)
 *   model change ──(reaction)──▶ diff(lastSent, now) ──▶ circuit.apply (outbound, ≈150 ms)
 *
 * `lastSent` is the last snapshot we know the server holds. Inbound snapshots
 * skip ids that are held (dragging) or dirty (diff against lastSent is not
 * empty), and advance `lastSent` for everything they did apply so our own
 * echo — and other writers' changes — are never sent back.
 */
import { useEffect, useRef } from 'react'
import { useMutation } from 'convex/react'
import { reaction } from 'mobx'
import { api } from '../../../convex/_generated/api'
import {
  applyToSnapshot,
  diffCircuit,
  isEmptyOps,
  opsIds,
  stable,
} from './diff'
import type { EditorProject } from '#/editor/models'
import type { CircuitJSON } from '#/sim/types'

export const FLUSH_MS = 150
const META_FLUSH_MS = 500

export interface ServerSnapshot {
  circuit: CircuitJSON
  /** rows never written: `lastSent` starts empty so the first flush creates them */
  legacy: boolean
}

export function useProjectSync(
  project: EditorProject | null,
  server: ServerSnapshot | null | undefined,
) {
  const apply = useMutation(api.circuit.apply)
  const update = useMutation(api.projects.update)
  /** Last snapshot the server is known to hold, for the project it belongs to. */
  const lastSent = useRef<{
    project: EditorProject
    circuit: CircuitJSON
  } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)

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
      const ops = diffCircuit(sent.circuit, now)
      if (isEmptyOps(ops)) return
      inFlight.current = true
      try {
        await apply({ projectId: project.id, ...ops })
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
      (meta) =>
        void update({
          id: project.id,
          ...(JSON.parse(meta) as { name: string; camera: unknown }),
        }),
      { delay: META_FLUSH_MS },
    )
    return () => {
      stopCircuit()
      stopMeta()
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [project, apply, update])

  // inbound
  useEffect(() => {
    if (!project || !server) return
    if (lastSent.current?.project !== project) {
      // first snapshot: the model was built from it. A legacy blob has no rows
      // yet, so write them now; from then on only diffs travel.
      const now = project.circuit.toJSON()
      lastSent.current = { project, circuit: now }
      if (server.legacy) {
        const ops = diffCircuit({ parts: [], wires: [] }, now)
        void apply({ projectId: project.id, ...ops })
      }
      return
    }
    const sent = lastSent.current
    const dirty = opsIds(diffCircuit(sent.circuit, project.circuit.toJSON()))
    const skip = new Set([...project.held, ...dirty])
    project.circuit.loadJSON(server.circuit, skip)
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
