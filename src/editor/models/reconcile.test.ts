/**
 * EditorCircuit.loadJSON as the sync reconciler — the four cases that decide
 * whether a Figma-style two-way sync is safe.
 */
import { describe, expect, test } from 'bun:test'
import { EditorProject } from './project'
import { stable } from '#/editor/sync/diff'
import { defaultProject } from '#/lib/projects'
import type { PartJSON } from '#/sim/types'

const led = (id: string, x: number): PartJSON => ({
  id,
  type: 'led',
  parentId: null,
  position: { x, y: 0, z: 0 },
  rotation: 0,
  terminals: [],
  color: 'red',
})

function setup() {
  const json = defaultProject('p')
  json.circuit.parts.push(led('led1', 0))
  const project = new EditorProject(json)
  return { project, snapshot: () => project.circuit.toJSON() }
}

describe('circuit reconcile', () => {
  test('echo: a snapshot equal to the model changes nothing', () => {
    const { project, snapshot } = setup()
    const before = stable(snapshot())
    const part = project.circuit.getPartById('led1')
    project.circuit.loadJSON(JSON.parse(before))
    expect(project.circuit.getPartById('led1')).toBe(part) // same instance
    expect(stable(snapshot())).toBe(before)
  })

  test('remote edit applies; held ids are deferred', () => {
    const { project, snapshot } = setup()
    const next = snapshot()
    next.parts.find((p) => p.id === 'led1')!.position.x = 5
    project.circuit.loadJSON(next, new Set(['led1']))
    expect(project.circuit.getPartById('led1').position.x).toBe(0)
    project.circuit.loadJSON(next)
    expect(project.circuit.getPartById('led1').position.x).toBe(5)
  })

  test('remote add and remove, wires never outlive their parts', () => {
    const { project, snapshot } = setup()
    const next = snapshot()
    next.parts.push(led('led2', 3))
    next.wires.push({
      id: 'w',
      color: 'red',
      partOneId: 'led1',
      partTwoId: 'led2',
    })
    project.circuit.loadJSON(next)
    expect(project.circuit.getWireById('w')).toBeDefined()
    const gone = snapshot()
    gone.parts = gone.parts.filter((p) => p.id !== 'led2')
    gone.wires = []
    project.circuit.loadJSON(gone)
    expect(project.circuit.getPartById('led2')).toBeUndefined()
    expect(project.circuit.getWireById('w')).toBeUndefined()
    // a stray wire whose part is missing is ignored rather than crashing
    project.circuit.loadJSON({
      ...gone,
      wires: [{ id: 'x', color: 'red', partOneId: 'led1', partTwoId: 'nope' }],
    })
    expect(project.circuit.getWireById('x')).toBeUndefined()
  })

  test('deleting a part locally drops its wires (so the diff removes them too)', () => {
    const { project } = setup()
    project.circuit.addPart(led('led2', 3))
    project.circuit.addWire({
      id: 'w',
      color: 'red',
      partOneId: 'led1',
      partTwoId: 'led2',
    })
    project.circuit.getPartById('led2').delete()
    expect(project.circuit.getWireById('w')).toBeUndefined()
  })
})
