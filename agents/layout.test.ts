/** Placement and connection must be legal by construction — the harness never asks the model to fix geometry. */
import { describe, expect, test } from 'bun:test'
import {
  danglingWires,
  nets,
  placeFree,
  placeOnBoard,
  planConnect,
} from './layout'
import { defaultProject } from '#/lib/projects'
import type { CircuitJSON, PartJSON, PartType } from '#/sim/types'

const blank = (): CircuitJSON => structuredClone(defaultProject('p').circuit)
const mk = (type: PartType, extra: Partial<PartJSON> = {}): PartJSON => ({
  id: crypto.randomUUID(),
  type,
  parentId: null,
  position: { x: 0, y: 0, z: 0 },
  rotation: 0,
  terminals: [],
  ...extra,
})
function add(c: CircuitJSON, type: PartType, extra: Partial<PartJSON> = {}) {
  const p = mk(type, extra)
  const board = c.parts.find((q) => q.type === 'breadboard')!
  if (['arduino-uno', 'battery', 'motor', 'breadboard'].includes(type))
    placeFree(c, p)
  else {
    p.parentId = board.id
    placeOnBoard(c, p, board)
  }
  c.parts.push(p)
  return p
}

describe('placeOnBoard', () => {
  test('every leg in a hole, no two legs on one strip, no overlaps, across many parts', () => {
    const c = blank()
    const types: PartType[] = [
      'led',
      'resistor',
      'tactile-switch',
      'resistor',
      'led',
      'capacitor',
      'npn-transistor',
      'potentiometer',
      'tmp36',
      'lcd1602-i2c',
      'timer',
      'led',
    ]
    const placed = types.map((t) => add(c, t))
    const holes = new Map<string, string>()
    for (const p of placed) {
      expect(p.terminals.length).toBeGreaterThan(0)
      for (const t of p.terminals) {
        expect(t.connections.length).toBe(1)
        expect(holes.has(t.connections[0])).toBe(false) // no shared hole
        holes.set(t.connections[0], p.id)
      }
    }
    // no two parts share a strip (that would wire them together silently)
    const stripOwner = new Map<string, string>()
    for (const p of placed)
      for (const t of p.terminals) {
        const hole = t.connections[0]
        const strip = `${'ABCDE'.includes(hole[0]) ? 'ABCDE' : 'FGHIJ'}.${hole.split('.')[1]}`
        expect(/^[A-J]\./.test(hole)).toBe(true) // never a rail
        const owner = stripOwner.get(strip)
        expect(owner === undefined || owner === p.id).toBe(true)
        stripOwner.set(strip, p.id)
      }
    // nets: each part's pins that aren't internally joined are on distinct nets
    const byNode = nets(c)
    const led = placed[0]
    const ledNets = byNode.filter((n) => n.some((m) => m.partId === led.id))
    expect(ledNets.length).toBe(2)
    const sw = placed[2]
    const swNets = byNode.filter((n) => n.some((m) => m.partId === sw.id))
    expect(swNets.length).toBe(2) // 1–2 and 3–4 joined inside the switch
  })
  test('a battery on a full-looking board still finds a table spot next to the board', () => {
    const c = blank()
    const uno = add(c, 'arduino-uno')
    const board = c.parts.find((q) => q.type === 'breadboard')!
    expect(uno.parentId).toBeNull()
    expect(Math.abs(uno.position.x - board.position.x)).toBeGreaterThan(5)
  })
})

describe('planConnect', () => {
  test('joins two nets with free holes and is a no-op once joined', () => {
    const c = blank()
    const led = add(c, 'led')
    const r = add(c, 'resistor')
    const plan = planConnect(
      c,
      { part: r, terminal: 't2' },
      { part: led, terminal: '+' },
    )
    expect(plan).not.toBeNull()
    c.parts.push(...plan!.ends)
    c.wires.push(plan!.wire)
    expect(
      planConnect(c, { part: r, terminal: 't2' }, { part: led, terminal: '+' }),
    ).toBeNull()
    // ends sit on holes of the right strips
    const hole = (e: PartJSON) => e.terminals[0].connections[0]
    expect(hole(plan!.ends[0]).split('.')[1]).toBe(
      r.terminals[1].connections[0].split('.')[1],
    )
    expect(hole(plan!.ends[1]).split('.')[1]).toBe(
      led.terminals[0].connections[0].split('.')[1],
    )
  })
  test('connects a breadboard part to an Arduino pin and to the battery rail', () => {
    const c = blank()
    const uno = add(c, 'arduino-uno')
    const led = add(c, 'led')
    const p1 = planConnect(
      c,
      { part: led, terminal: '-' },
      { part: uno, terminal: 'gnd.1' },
    )!
    c.parts.push(...p1.ends)
    c.wires.push(p1.wire)
    expect(p1.wire.color).toBe('Black')
    const n = nets(c).find((x) =>
      x.some((m) => m.partId === led.id && m.terminal === '-'),
    )!
    expect(n.some((m) => m.partId === uno.id && m.terminal === 'gnd.1')).toBe(
      true,
    )
    const battery = c.parts.find((q) => q.type === 'battery')!
    const p2 = planConnect(
      c,
      { part: led, terminal: '+' },
      { part: battery, terminal: '+' },
    )!
    expect(p2.wire.color).toBe('Crimson')
  })
})

describe('danglingWires', () => {
  test('a jumper to a strip that lost its part is dangling; rails and shared strips are not', () => {
    const c = blank()
    const led = add(c, 'led')
    const r = add(c, 'resistor')
    const plan = planConnect(
      c,
      { part: r, terminal: 't2' },
      { part: led, terminal: '+' },
    )!
    c.parts.push(...plan.ends)
    c.wires.push(plan.wire)
    expect(danglingWires(c)).toEqual([])
    c.parts = c.parts.filter((p) => p.id !== r.id)
    expect(danglingWires(c).map((w) => w.id)).toEqual([plan.wire.id])
  })
})
