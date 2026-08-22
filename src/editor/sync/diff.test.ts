import { describe, expect, test } from 'bun:test'
import { applyToSnapshot, diffCircuit, isEmptyOps, stable } from './diff'
import type { CircuitJSON, PartJSON } from '#/sim/types'

const part = (id: string, x = 0): PartJSON => ({
  id,
  type: 'led',
  parentId: null,
  position: { x, y: 0, z: 0 },
  rotation: 0,
  terminals: [],
})
const circuit = (parts: PartJSON[], wires: CircuitJSON['wires'] = []) => ({
  parts,
  wires,
})

describe('diffCircuit', () => {
  test('identical snapshots produce no ops, regardless of key order', () => {
    const a = circuit([part('a')])
    const b = circuit([{ ...part('a'), position: { z: 0, y: 0, x: 0 } }])
    expect(isEmptyOps(diffCircuit(a, b))).toBe(true)
    expect(stable(a)).toBe(stable(b))
  })
  test('reports upserts and removes per entity', () => {
    const prev = circuit(
      [part('a'), part('b')],
      [{ id: 'w', color: 'red', partOneId: 'a', partTwoId: 'b' }],
    )
    const next = circuit([part('a', 1), part('c')])
    const ops = diffCircuit(prev, next)
    expect(ops.parts.map((p) => p.id)).toEqual(['a', 'c'])
    expect(ops.removeParts).toEqual(['b'])
    expect(ops.removeWires).toEqual(['w'])
    expect(applyToSnapshot(prev, ops)).toEqual(next)
  })
})
