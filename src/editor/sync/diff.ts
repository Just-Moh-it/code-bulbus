/**
 * Entity-level diff between two circuit snapshots — the unit of sync.
 * Pure: no MobX, no three. Used by the browser (outbound queue) and by the
 * agent tools (save = diff(loaded, edited)).
 */
import type { CircuitJSON, PartJSON, WireJSON } from '#/sim/types'

export interface CircuitOps {
  parts: PartJSON[]
  wires: WireJSON[]
  removeParts: string[]
  removeWires: string[]
}

/** JSON with sorted keys, so equal entities serialize identically regardless of who built them. */
export function stable(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  )
}

export const emptyOps = (): CircuitOps => ({
  parts: [],
  wires: [],
  removeParts: [],
  removeWires: [],
})

export const isEmptyOps = (o: CircuitOps) =>
  !o.parts.length &&
  !o.wires.length &&
  !o.removeParts.length &&
  !o.removeWires.length

function diffById<T extends { id: string }>(prev: T[], next: T[]) {
  const before = new Map(prev.map((e) => [e.id, stable(e)]))
  const after = new Set(next.map((e) => e.id))
  return {
    upserts: next.filter((e) => before.get(e.id) !== stable(e)),
    removes: prev.filter((e) => !after.has(e.id)).map((e) => e.id),
  }
}

export function diffCircuit(prev: CircuitJSON, next: CircuitJSON): CircuitOps {
  const p = diffById(prev.parts, next.parts)
  const w = diffById(prev.wires, next.wires)
  return {
    parts: p.upserts,
    wires: w.upserts,
    removeParts: p.removes,
    removeWires: w.removes,
  }
}

/** Ids touched by `ops` — the entities a client has locally changed but not yet confirmed. */
export function opsIds(o: CircuitOps): Set<string> {
  return new Set([
    ...o.parts.map((p) => p.id),
    ...o.wires.map((w) => w.id),
    ...o.removeParts,
    ...o.removeWires,
  ])
}

/** Apply ops to a snapshot (what the server will hold after `apply`). */
export function applyToSnapshot(
  base: CircuitJSON,
  ops: CircuitOps,
): CircuitJSON {
  const merge = <T extends { id: string }>(
    list: T[],
    upserts: T[],
    removes: string[],
  ) => {
    const m = new Map(list.map((e) => [e.id, e]))
    removes.forEach((id) => m.delete(id))
    upserts.forEach((e) => m.set(e.id, e))
    return [...m.values()]
  }
  return {
    parts: merge(base.parts, ops.parts, ops.removeParts),
    wires: merge(base.wires, ops.wires, ops.removeWires),
  }
}
