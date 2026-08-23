/**
 * loadJSON ∘ toJSON must be the identity for every part type: the sync layer
 * reconciles server rows with loadJSON and diffs toJSON against what the
 * server holds, so any field that toJSON emits but loadJSON ignores would be
 * written back as a stale "local edit".
 */
import { describe, expect, test } from 'bun:test'
import { EditorProject } from './project'
import { partManagers } from './parts'
import { stable } from '#/editor/sync/diff'
import type { PartJSON, PartType } from '#/sim/types'

function mutate(v: unknown): unknown {
  if (typeof v === 'string') return v + 'x'
  if (typeof v === 'number') return v + 1
  if (typeof v === 'boolean') return !v
  if (Array.isArray(v)) return v.map(mutate)
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>).map(([k, x]) => [
        k,
        mutate(x),
      ]),
    )
  return v
}

describe('part JSON round-trip', () => {
  for (const type of Object.keys(partManagers) as PartType[]) {
    test(type, () => {
      const project = new EditorProject({
        id: 'p',
        name: 'p',
        circuit: { parts: [], wires: [] },
      })
      const part = project.circuit.addPart({
        id: 'x',
        type,
        parentId: null,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
      })!
      const base = part.toJSON()
      // keep identity/structure, change every value the part emits
      const { id, type: t, parentId, terminals, ...rest } = base
      const next = {
        id,
        type: t,
        parentId,
        terminals,
        ...(mutate(rest) as object),
      } as PartJSON
      part.loadJSON(next)
      expect(stable(part.toJSON())).toBe(stable(next))
    })
  }
})
