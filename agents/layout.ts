/**
 * Geometry and connectivity for the agent tools — the part of the harness
 * that must never disagree with the editor or the simulator:
 *
 *  - placement uses the same terminal definitions and the same 0.33·mg hole
 *    rule as the editor (`placeOnParent`), searched over holes × rotations, so
 *    a placed part always has every leg in a free hole and no two legs on one
 *    strip;
 *  - nets come from the simulator's own `Circuit.assignNodes()`, so what the
 *    agent reads is exactly what SPICE will solve;
 *  - `connect` picks free holes on the two nets and routes the wire around
 *    part footprints.
 *
 * Everything here is plain data in/out (CircuitJSON); the tools persist.
 */
import * as defs from '#/sim/defs'
import { Circuit } from '#/sim'
import { PartType, mg } from '#/sim/types'
import type {
  CircuitJSON,
  PartJSON,
  PartType as PartTypeT,
  TerminalDefinition,
  Vec3,
  WireJSON,
} from '#/sim/types'
import { partManagers } from '#/editor/models'
import type { EditorPart } from '#/editor/models'

// ------------------------------------------------------------ definitions

const TERMINALS: Partial<
  Record<
    PartTypeT,
    TerminalDefinition[] | ((model: string) => TerminalDefinition[])
  >
> = {
  [PartType.Breadboard]: defs.breadboardTerminals,
  [PartType.RaspberryPi]: defs.raspberryPiTerminals,
  [PartType.Resistor]: defs.resistorTerminals,
  [PartType.TactileSwitch]: defs.tactileSwitchTerminals,
  [PartType.WireEnd]: defs.wireEndTerminals,
  [PartType.Battery]: defs.batteryTerminals,
  [PartType.Led]: defs.ledTerminals,
  [PartType.NpnTransistor]: defs.npnTerminals,
  [PartType.PnpTransistor]: defs.pnpTerminals,
  [PartType.Capacitor]: defs.capacitorTerminals,
  [PartType.Lcd1602]: defs.lcd1602Terminals,
  [PartType.Lcd1602I2c]: defs.lcd1602I2cTerminals,
  [PartType.Potentiometer]: defs.potentiometerTerminals,
  [PartType.Tmp36]: defs.tmp36Terminals,
  [PartType.Timer]: defs.timerTerminals,
  [PartType.ArduinoUno]: defs.arduinoUnoTerminals,
  [PartType.Motor]: defs.motorTerminals,
  [PartType.EightPinChip]: defs.eightPinChipTerminals,
}

export function terminalDefs(
  part: Pick<PartJSON, 'type' | 'model'>,
): TerminalDefinition[] {
  const t = TERMINALS[part.type]
  if (!t) throw new Error(`No terminal definitions for ${part.type}`)
  return typeof t === 'function' ? t(part.model ?? '') : t
}

/** Static metadata of an editor part class (dimensions, parents, surface height). */
export const manager = (type: PartTypeT) =>
  // partManagers is typed per concrete class; we only read the shared statics
  partManagers[type] as unknown as typeof EditorPart

export const dims = (type: PartTypeT) => manager(type).dimensions

function dragSurfaceHeight(type: PartTypeT) {
  const M = manager(type)
  return M.dragSurfaceHeight ?? M.dimensions.height
}

export const isPartType = (t: string): t is PartTypeT =>
  (Object.values(PartType) as string[]).includes(t)

/** Parts that sit on the table rather than on a breadboard. */
export const isFreeStanding = (type: PartTypeT) =>
  manager(type).eligibleParents.size === 0

/** A hole rule shared with the editor: a leg within 0.33·mg of a hole is in it. */
const HOLE_RADIUS = 0.33 * mg

// --------------------------------------------------------------- geometry

const rot2 = (p: { x: number; z: number }, rot: number) => ({
  x: p.x * Math.cos(rot) + p.z * Math.sin(rot),
  z: -p.x * Math.sin(rot) + p.z * Math.cos(rot),
})

/** World (x,z) of a point given in `part`'s local frame; parents are top-level parts. */
function toWorld(circuit: CircuitJSON, part: PartJSON, local: Vec3) {
  const parent =
    part.parentId && circuit.parts.find((p) => p.id === part.parentId)
  const inParent = rot2(local, part.rotation)
  const p = { x: part.position.x + inParent.x, z: part.position.z + inParent.z }
  if (!parent) return p
  const inWorld = rot2(p, parent.rotation)
  return { x: parent.position.x + inWorld.x, z: parent.position.z + inWorld.z }
}

interface Rect {
  x: number
  z: number
  hw: number
  hd: number
}

/** Axis-aligned footprint in the frame the part's position is expressed in (parent-local or world). */
function footprint(part: PartJSON, margin = 0): Rect {
  const d = dims(part.type)
  const quarter = Math.round(part.rotation / (Math.PI / 2)) % 2 !== 0
  return {
    x: part.position.x,
    z: part.position.z,
    hw: (quarter ? d.depth : d.width) / 2 + margin,
    hd: (quarter ? d.width : d.depth) / 2 + margin,
  }
}

const overlaps = (a: Rect, b: Rect) =>
  Math.abs(a.x - b.x) < a.hw + b.hw && Math.abs(a.z - b.z) < a.hd + b.hd

function segmentCrossesRect(
  a: { x: number; z: number },
  b: { x: number; z: number },
  r: Rect,
) {
  // sample the segment; footprints are coarse so this is plenty
  for (let i = 1; i < 16; i++) {
    const t = i / 16
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    if (Math.abs(x - r.x) < r.hw && Math.abs(z - r.z) < r.hd) return true
  }
  return false
}

// ------------------------------------------------------------- occupancy

/** Parent terminal names already holding a leg or a wire end. */
function occupiedHoles(circuit: CircuitJSON, parentId: string) {
  const taken = new Set<string>()
  for (const p of circuit.parts)
    if (p.parentId === parentId)
      for (const t of p.terminals) for (const c of t.connections) taken.add(c)
  return taken
}

/** Strip/rail group of a breadboard hole ("FGHIJ.10", "positive.a"), or the hole itself for other parents. */
function holeGroup(parent: PartJSON, hole: string) {
  const d = terminalDefs(parent).find((t) => t.name === hole)
  return d?.group ?? hole
}

// -------------------------------------------------------------- placement

/**
 * Where every bottom terminal of `part` lands on `parent` if `anchor` sits on
 * `targetHole` at rotation `rot`. Mirrors the editor's snapping exactly.
 */
function landing(
  part: PartJSON,
  parent: PartJSON,
  anchor: TerminalDefinition,
  targetHole: string,
  rot: number,
) {
  const own = terminalDefs(part).filter((d) => d.surface === 'bottom')
  const parentTerms = terminalDefs(parent)
  const target = parentTerms.find((d) => d.name === targetHole)
  if (!target) throw new Error(`${parent.type} has no terminal "${targetHole}"`)
  const a = rot2(anchor.position, rot)
  const position = {
    x: target.position.x - a.x,
    y: dragSurfaceHeight(parent.type),
    z: target.position.z - a.z,
  }
  const terminals = own.map((d) => {
    const l = rot2(d.position, rot)
    const hit = parentTerms.find(
      (t) =>
        Math.hypot(
          t.position.x - (position.x + l.x),
          t.position.z - (position.z + l.z),
        ) < HOLE_RADIUS,
    )
    return { name: d.name, connections: hit ? [hit.name] : [] }
  })
  return { position, terminals, rot }
}

/** Put a single-terminal wire end exactly on a parent terminal. */
export function placeWireEnd(parent: PartJSON, hole: string): PartJSON {
  const end: PartJSON = {
    id: crypto.randomUUID(),
    type: 'wire-end',
    parentId: parent.id,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    terminals: [],
    showLabels: false,
  }
  const l = landing(end, parent, terminalDefs(end)[0], hole, 0)
  end.position = l.position
  end.terminals = [{ name: 't1', connections: [hole] }]
  return end
}

/** Strip holes in a tidy scan order: column by column, upper bank (F–J) first. */
const ROW_ORDER = ['F', 'G', 'H', 'I', 'J', 'A', 'B', 'C', 'D', 'E']
function stripHoles(startColumn: number) {
  const out: string[] = []
  for (let c = startColumn; c <= 63; c++)
    for (const r of ROW_ORDER) out.push(`${r}.${c}`)
  return out
}

/**
 * Place `part` on the breadboard `board`: first spot (scanning left→right,
 * four rotations) where every leg is in a free hole, legs that are not
 * internally joined sit on different strips, and the body overlaps nothing.
 * Sets position/rotation/terminals on `part`.
 */
export function placeOnBoard(
  circuit: CircuitJSON,
  part: PartJSON,
  board: PartJSON,
  startColumn = 3,
) {
  if (!manager(part.type).eligibleParents.has(board.type))
    throw new Error(`${part.type} cannot be placed on a ${board.type}`)
  const own = terminalDefs(part).filter((d) => d.surface === 'bottom')
  if (own.length === 0) throw new Error(`${part.type} has no pins to plug in`)
  const taken = occupiedHoles(circuit, board.id)
  // a strip already carrying another part's leg is that part's net — landing there would wire them together
  const takenGroups = new Set([...taken].map((h) => holeGroup(board, h)))
  const bodies = circuit.parts
    .filter((p) => p.parentId === board.id && p.type !== 'wire-end')
    .map((p) => footprint(p, 0.5 * mg))
  const anchor = own[0]
  const rotations = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
  for (const hole of stripHoles(startColumn)) {
    for (const rot of rotations) {
      const l = landing(part, board, anchor, hole, rot)
      if (l.terminals.some((t) => t.connections.length === 0)) continue
      if (l.terminals.some((t) => taken.has(t.connections[0]))) continue
      const groupsHit = l.terminals.map((t) =>
        holeGroup(board, t.connections[0]),
      )
      // legs go on terminal strips only (never a power rail) and only on unused strips
      if (
        groupsHit.some((g) => !/^(ABCDE|FGHIJ)\./.test(g) || takenGroups.has(g))
      )
        continue
      // two legs on one strip would short them — unless the part joins them itself
      const groups = new Map<string, string>()
      let shorted = false
      for (const t of l.terminals) {
        const g = holeGroup(board, t.connections[0])
        const ownGroup = own.find((d) => d.name === t.name)?.group ?? t.name
        const prev = groups.get(g)
        if (prev !== undefined && prev !== ownGroup) shorted = true
        groups.set(g, ownGroup)
      }
      if (shorted) continue
      const body = footprint({ ...part, position: l.position, rotation: rot })
      if (bodies.some((b) => overlaps(body, b))) continue
      part.position = l.position
      part.rotation = rot
      part.terminals = l.terminals
      return
    }
  }
  throw new Error(`No free space on the breadboard for a ${part.type}`)
}

/** Place a table-top part (Arduino, battery, motor) beside the breadboard without overlapping anything. */
export function placeFree(circuit: CircuitJSON, part: PartJSON) {
  const others = circuit.parts.filter((p) => !p.parentId && p.id !== part.id)
  const board = others.find((p) => p.type === 'breadboard')
  const me = dims(part.type)
  const gap = 2 * mg
  const candidates: { x: number; z: number }[] = []
  if (board) {
    const b = footprint(board)
    // column 1 is at −x, where the packer starts filling the board: keep table parts on that side so wires stay short
    const sides = [
      b.x - b.hw - gap - me.width / 2,
      b.x + b.hw + gap + me.width / 2,
    ]
    for (const x of sides)
      for (let k = 0; k < 6; k++) {
        const dz = Math.ceil(k / 2) * (me.depth + gap) * (k % 2 ? -1 : 1)
        candidates.push({ x, z: b.z + dz })
      }
  } else {
    for (let k = 0; k < 6; k++)
      candidates.push({ x: k * (me.width + gap), z: 0 })
  }
  const bodies = others.map((p) => footprint(p, gap / 2))
  for (const c of candidates) {
    const body = footprint({ ...part, position: { x: c.x, y: 0, z: c.z } })
    if (!bodies.some((b) => overlaps(body, b))) {
      part.position = { x: c.x, y: 0, z: c.z }
      part.terminals = []
      return
    }
  }
  throw new Error(`No room on the table for a ${part.type}`)
}

// ------------------------------------------------------------------- nets

export interface NetMember {
  partId: string
  type: PartTypeT
  terminal: string
}

/**
 * Net id per "partId:terminal", from the simulator's own connectivity.
 * SPICE models a wire as a tiny resistor between two nodes, so the two ends
 * of every wire are unioned here — electrically they are one net.
 */
export function nodeMap(circuit: CircuitJSON) {
  const sim = new Circuit(circuit)
  const parent = new Map<number, number>()
  const find = (n: number): number => {
    const p = parent.get(n)
    if (p === undefined || p === n) return n
    const r = find(p)
    parent.set(n, r)
    return r
  }
  for (const w of sim.wires) {
    const a = w.partOne.terminalsByName.t1.node
    const b = w.partTwo.terminalsByName.t1.node
    if (a !== null && b !== null) parent.set(find(a), find(b))
  }
  const nodes = new Map<string, number>()
  for (const p of sim.parts)
    for (const t of p.terminals)
      if (t.node !== null) nodes.set(`${p.id}:${t.name}`, find(t.node))
  return nodes
}

/** Nets as the agent should see them: part pins grouped by node (breadboard holes and wire ends elided). */
export function nets(circuit: CircuitJSON) {
  const nodes = nodeMap(circuit)
  const byNode = new Map<number, NetMember[]>()
  for (const p of circuit.parts) {
    if (p.type === 'wire-end') continue
    for (const d of terminalDefs(p)) {
      const n = nodes.get(`${p.id}:${d.name}`)
      if (n === undefined) continue
      // a breadboard contributes its strip/rail name once, not 5–50 holes
      const terminal = p.type === 'breadboard' ? (d.group ?? d.name) : d.name
      const list = byNode.get(n) ?? []
      if (!list.some((m) => m.partId === p.id && m.terminal === terminal))
        list.push({ partId: p.id, type: p.type, terminal })
      byNode.set(n, list)
    }
  }
  // only nets that touch a real part pin matter to the agent
  return [...byNode.values()].filter((n) =>
    n.some((m) => m.type !== 'breadboard'),
  )
}

// ----------------------------------------------------------------- remove

/**
 * Wires whose end sits on a terminal strip that no part leg uses any more —
 * they were placed for a part that is gone. Rails are buses and are exempt.
 */
export function danglingWires(circuit: CircuitJSON): WireJSON[] {
  const legsOnGroup = new Map<string, number>()
  const endsOnGroup = new Map<string, number>()
  const groupOf = (end: PartJSON) => {
    const parent = circuit.parts.find((p) => p.id === end.parentId)
    const hole = end.terminals[0]?.connections[0]
    if (!parent || parent.type !== 'breadboard' || !hole) return null
    const g = holeGroup(parent, hole)
    return /^(ABCDE|FGHIJ)\./.test(g) ? `${parent.id}:${g}` : null
  }
  for (const p of circuit.parts) {
    if (!p.parentId) continue
    const parent = circuit.parts.find((q) => q.id === p.parentId)
    if (!parent || parent.type !== 'breadboard') continue
    for (const t of p.terminals)
      for (const c of t.connections) {
        const key = `${parent.id}:${holeGroup(parent, c)}`
        if (p.type === 'wire-end')
          endsOnGroup.set(key, (endsOnGroup.get(key) ?? 0) + 1)
        else legsOnGroup.set(key, (legsOnGroup.get(key) ?? 0) + 1)
      }
  }
  return circuit.wires.filter((w) =>
    [w.partOneId, w.partTwoId].some((id) => {
      const end = circuit.parts.find((p) => p.id === id)
      const g = end && groupOf(end)
      return (
        g !== null &&
        g !== undefined &&
        !legsOnGroup.has(g) &&
        (endsOnGroup.get(g) ?? 0) <= 1
      )
    }),
  )
}

/**
 * Wires whose removal separates the nets of `a` and `b`. The model thinks in
 * nets ("disconnect the button from the resistor"), while wires run between
 * holes, so we try each wire on the shared net and keep the ones that split it.
 * Returns [] when the two pins are not on one net; null when they are joined
 * by something other than a wire (legs sharing a strip, an internal join).
 */
export function splittingWires(
  circuit: CircuitJSON,
  a: { part: PartJSON; terminal: string },
  b: { part: PartJSON; terminal: string },
): WireJSON[] | null {
  const key = (t: { part: PartJSON; terminal: string }) =>
    `${t.part.id}:${t.terminal}`
  const joined = (c: CircuitJSON) => {
    const n = nodeMap(c)
    return n.get(key(a)) !== undefined && n.get(key(a)) === n.get(key(b))
  }
  if (!joined(circuit)) return []
  const nodes = nodeMap(circuit)
  const net = nodes.get(key(a))
  const endNode = (id: string) => nodes.get(`${id}:t1`)
  const onNet = circuit.wires.filter(
    (w) => endNode(w.partOneId) === net && endNode(w.partTwoId) === net,
  )
  const out: WireJSON[] = []
  const work: CircuitJSON = circuit
  for (const w of onNet) {
    const without: CircuitJSON = {
      parts: work.parts.filter(
        (p) => p.id !== w.partOneId && p.id !== w.partTwoId,
      ),
      wires: work.wires.filter((x) => x.id !== w.id),
    }
    // a wire that leaves them joined is not on the only path; a wire that splits them is what we want
    const stillJoined = joined(without)
    if (!stillJoined) {
      out.push(w)
      return out
    }
  }
  return out.length ? out : null
}

// ---------------------------------------------------------------- connect

export interface Slot {
  parent: PartJSON
  hole: string
  world: { x: number; z: number }
}

/** Free places on a net where a wire end could go: breadboard holes and bare pins of table-top parts. */
function freeSlots(
  circuit: CircuitJSON,
  node: number,
  nodes: Map<string, number>,
): Slot[] {
  const out: Slot[] = []
  for (const p of circuit.parts) {
    if (p.parentId) continue // only top-level parts host wire ends
    if (!manager('wire-end').eligibleParents.has(p.type)) continue
    const taken = occupiedHoles(circuit, p.id)
    for (const d of terminalDefs(p)) {
      if (nodes.get(`${p.id}:${d.name}`) !== node) continue
      if (taken.has(d.name)) continue
      out.push({
        parent: p,
        hole: d.name,
        world: toWorld(circuit, p, d.position),
      })
    }
  }
  return out
}

export interface ConnectPlan {
  ends: [PartJSON, PartJSON]
  wire: WireJSON
  from: string
  to: string
}

/** Colour by what the net carries; falls back to a rotating palette. */
function wireColor(circuit: CircuitJSON, names: string[]) {
  const n = names.join(' ').toLowerCase()
  if (/gnd|negative|(^|\s)-($|\s)/.test(n)) return 'Black'
  if (/5v|3\.3v|vin|positive|(^|\s)\+($|\s)/.test(n)) return 'Crimson'
  const cycle = [
    'DeepSkyBlue',
    'MediumSeaGreen',
    'Gold',
    'DarkOrange',
    'MediumOrchid',
  ]
  return cycle[circuit.wires.length % cycle.length]
}

/**
 * Plan a wire joining the nets of terminals `a` and `b` (each "partId:terminal").
 * Returns null when they are already one net.
 */
export function planConnect(
  circuit: CircuitJSON,
  a: { part: PartJSON; terminal: string },
  b: { part: PartJSON; terminal: string },
): ConnectPlan | null {
  const nodes = nodeMap(circuit)
  const na = nodes.get(`${a.part.id}:${a.terminal}`)
  const nb = nodes.get(`${b.part.id}:${b.terminal}`)
  if (na === undefined || nb === undefined)
    throw new Error('Terminal is not in the circuit (is the part placed?)')
  if (na === nb) return null
  const sa = freeSlots(circuit, na, nodes)
  const sb = freeSlots(circuit, nb, nodes)
  const describe = (t: { part: PartJSON; terminal: string }) =>
    `${t.part.type}.${t.terminal}`
  if (sa.length === 0)
    throw new Error(
      `No free hole on the net of ${describe(a)} — every hole of its strip is used; move it or free a hole`,
    )
  if (sb.length === 0)
    throw new Error(
      `No free hole on the net of ${describe(b)} — every hole of its strip is used`,
    )

  // bodies a wire should not drape over: mounted parts, in world coordinates
  const bodies = circuit.parts
    .filter((p) => p.parentId && p.type !== 'wire-end')
    .map((p) => {
      const parent = circuit.parts.find((q) => q.id === p.parentId)!
      const c = toWorld(circuit, parent, { ...p.position, y: 0 })
      const f = footprint({ ...p, rotation: p.rotation + parent.rotation })
      return { ...f, x: c.x, z: c.z }
    })
  const pairs: { a: Slot; b: Slot; d: number; crosses: boolean }[] = []
  for (const x of sa)
    for (const y of sb)
      pairs.push({
        a: x,
        b: y,
        d: Math.hypot(x.world.x - y.world.x, x.world.z - y.world.z),
        crosses: bodies.some((r) => segmentCrossesRect(x.world, y.world, r)),
      })
  pairs.sort((p, q) => Number(p.crosses) - Number(q.crosses) || p.d - q.d)
  const best = pairs[0]
  const ends: [PartJSON, PartJSON] = [
    placeWireEnd(best.a.parent, best.a.hole),
    placeWireEnd(best.b.parent, best.b.hole),
  ]
  const names = [a.terminal, b.terminal, best.a.hole, best.b.hole]
  const wire: WireJSON = {
    id: crypto.randomUUID(),
    color: wireColor(circuit, names),
    partOneId: ends[0].id,
    partTwoId: ends[1].id,
    height: best.crosses ? 3 : best.d < 6 * mg ? 1 : 2,
    showCurrents: false,
  }
  return {
    ends,
    wire,
    from: `${best.a.parent.type} ${best.a.hole}`,
    to: `${best.b.parent.type} ${best.b.hole}`,
  }
}
