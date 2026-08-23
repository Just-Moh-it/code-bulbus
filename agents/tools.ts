/**
 * App-specific tools exposed to Electric Agents.
 *
 * The agent talks in parts and nets, never in holes or coordinates:
 *   add_part(type)              → placed by `layout.placeOnBoard` / `placeFree`
 *   connect("led.+", "uno.13")  → wire routed by `layout.planConnect`
 *   get_project / simulate      → nets and problems from the real simulator
 * so nothing the model says can disagree with what the editor or SPICE does.
 *
 * Edits are saved as entity-level ops (diff of loaded vs edited) so open
 * editors pick them up live. Tools return `{ content: [{type:'text', text}] }`
 * per the AgentTool contract; they throw with an actionable message on failure.
 */
import { Type } from '@sinclair/typebox'
import type { Static, TSchema } from '@sinclair/typebox'
import type { AgentTool } from '@electric-ax/agents-runtime'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import type {
  CircuitJSON,
  PartJSON,
  PartType as PartTypeT,
  ProjectJSON,
} from '#/sim/types'
import { LED_COLORS } from '#/editor/models'
import { compileSketch } from '#/server/compile'
import { diffCircuit, isEmptyOps } from '#/editor/sync/diff'
import {
  ArduinoUno,
  Battery,
  Circuit,
  Lcd1602,
  Lcd1602I2c,
  Led,
  Motor,
  Potentiometer,
  Resistor,
  TactileSwitch,
  Tmp36,
} from '#/sim'
import {
  isFreeStanding,
  isPartType,
  nets,
  placeFree,
  placeOnBoard,
  planConnect,
  danglingWires,
  splittingWires,
  terminalDefs,
} from './layout'
import type { NetMember } from './layout'

const CONVEX_URL = process.env.VITE_CONVEX_URL
if (!CONVEX_URL) throw new Error('VITE_CONVEX_URL is not set (see .env.local)')
const convex = new ConvexHttpClient(CONVEX_URL)

// ----------------------------------------------------------------- helpers
const text = (data: unknown) => ({
  content: [
    {
      type: 'text' as const,
      text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    },
  ],
  details: {},
})

/** What the server held when a project was loaded; tools edit the JSON in place, so the diff needs this. */
const baselines = new WeakMap<ProjectJSON, CircuitJSON>()

async function loadProject(id: string): Promise<ProjectJSON> {
  const snap = await convex.query(api.circuit.get, { projectId: id })
  if (!snap) throw new Error(`Project ${id} not found`)
  const project: ProjectJSON = {
    ...snap.project,
    camera: snap.project.camera as ProjectJSON['camera'],
    circuit: snap.circuit,
  }
  baselines.set(project, structuredClone(project.circuit))
  return project
}

async function saveCircuit(project: ProjectJSON) {
  const base = baselines.get(project) ?? { parts: [], wires: [] }
  const ops = diffCircuit(base, project.circuit)
  if (isEmptyOps(ops)) return
  await convex.mutation(api.circuit.apply, { projectId: project.id, ...ops })
  baselines.set(project, structuredClone(project.circuit))
}

const short = (id: string) => id.slice(0, 8)

/** Words the model is likely to use for a type. */
const TYPE_ALIASES: Record<string, PartTypeT[]> = {
  arduino: ['arduino-uno'],
  uno: ['arduino-uno'],
  button: ['tactile-switch'],
  switch: ['tactile-switch'],
  pushbutton: ['tactile-switch'],
  pot: ['potentiometer'],
  lcd: ['lcd1602-i2c', 'lcd1602'],
  display: ['lcd1602-i2c', 'lcd1602'],
  board: ['breadboard'],
  bb: ['breadboard'],
  r: ['resistor'],
  res: ['resistor'],
  npn: ['npn-transistor'],
  pnp: ['pnp-transistor'],
  cap: ['capacitor'],
  temp: ['tmp36'],
  sensor: ['tmp36'],
}

/** Resolve "<id-prefix | type | alias>" to one non-wire part. */
function resolvePart(circuit: CircuitJSON, ref: string): PartJSON {
  const key = ref.trim().toLowerCase()
  const parts = circuit.parts.filter((p) => p.type !== 'wire-end')
  const byId = parts.filter((p) => p.id.toLowerCase().startsWith(key))
  if (byId.length === 1) return byId[0]
  const types = TYPE_ALIASES[key] ?? [key]
  const byType = parts.filter((p) => types.includes(p.type))
  if (byType.length === 1) return byType[0]
  if (byType.length > 1)
    throw new Error(
      `"${ref}" is ambiguous — there are ${byType.length} ${byType[0].type}s; use an id: ${byType
        .map((p) => short(p.id))
        .join(', ')}`,
    )
  throw new Error(
    `No part "${ref}". Parts: ${parts.map((p) => `${p.type} ${short(p.id)}`).join(', ')}`,
  )
}

/** A tactile switch has two contacts, each with two pins (1=2, 3=4). The agent only ever sees sides a and b. */
const SWITCH_SIDES: Record<string, string> = { a: '1', b: '3' }
const switchSide = (pin: string) => (pin === '1' || pin === '2' ? 'a' : 'b')

/** Resolve a terminal name on a part, tolerating "13" for "~13", "gnd" for "gnd.1", case. */
function resolveTerminal(part: PartJSON, name: string): string {
  const defsOf = terminalDefs(part)
  const names = defsOf.map((d) => d.name)
  let key = name.trim()
  if (part.type === 'tactile-switch')
    key = SWITCH_SIDES[key.toLowerCase()] ?? key
  const exact =
    names.find((n) => n === key) ??
    names.find((n) => n.toLowerCase() === key.toLowerCase())
  if (exact) return exact
  const tilde = names.find((n) => n === `~${key}`)
  if (tilde) return tilde
  const prefixed = names.find((n) =>
    n.toLowerCase().startsWith(`${key.toLowerCase()}.`),
  )
  if (prefixed) return prefixed
  throw new Error(
    `${part.type} has no terminal "${name}". Terminals: ${names.join(', ')}`,
  )
}

/** "<part>.<terminal>" — split at the first dot (terminal names may contain dots). */
function resolveRef(circuit: CircuitJSON, ref: string) {
  const i = ref.indexOf('.')
  if (i < 0)
    throw new Error(
      `"${ref}" must be "<part>.<terminal>", e.g. "led.+", "uno.13", "battery.-", "breadboard.positive.a.1"`,
    )
  const part = resolvePart(circuit, ref.slice(0, i))
  return { part, terminal: resolveTerminal(part, ref.slice(i + 1)) }
}

const LED_COLOR_VALUES: string[] = LED_COLORS.map((c) => c.value)

/** Editable properties per type, documented once and validated against the same table. */
const PROPERTIES: Partial<
  Record<PartTypeT, Record<string, (v: unknown) => string | null>>
> = {
  battery: { voltage: num },
  resistor: { kohm: num },
  led: {
    color: (v) =>
      LED_COLOR_VALUES.includes(String(v))
        ? null
        : `one of ${LED_COLOR_VALUES.join(' | ')}`,
  },
  'tactile-switch': { latching: bool },
  'npn-transistor': { model: oneOf(['2N2222', '2N3904']) },
  'pnp-transistor': { model: oneOf(['2N3906']) },
  capacitor: { capacitance: num },
  potentiometer: {
    wiper: (v) =>
      typeof v === 'number' && v >= 0 && v <= 1 ? null : 'a number 0..1',
  },
  tmp36: { temperature: num },
  'lcd1602-i2c': { i2cAddress: num },
  '8-pin-chip': { chipName: str, subcktCode: str },
}
function num(v: unknown) {
  return typeof v === 'number' ? null : 'a number'
}
function bool(v: unknown) {
  return typeof v === 'boolean' ? null : 'true or false'
}
function str(v: unknown) {
  return typeof v === 'string' ? null : 'a string'
}
function oneOf(values: string[]) {
  return (v: unknown) =>
    values.includes(String(v)) ? null : `one of ${values.join(' | ')}`
}
function describeProperties(type: PartTypeT) {
  return Object.keys(PROPERTIES[type] ?? {})
}
function applyProperties(part: PartJSON, props: Record<string, unknown>) {
  const allowed = PROPERTIES[part.type] ?? {}
  for (const [k, v] of Object.entries(props)) {
    const check = allowed[k]
    if (!check)
      throw new Error(
        `${part.type} has no property "${k}". Editable: ${Object.keys(allowed).join(', ') || 'none'}`,
      )
    const problem = check(v)
    if (problem) throw new Error(`${part.type}.${k} must be ${problem}`)
    ;(part as unknown as Record<string, unknown>)[k] = v
  }
}

/** The circuit as the agent should see it: parts with their editable state, nets, and floating pins. */
function describeCircuit(circuit: CircuitJSON) {
  const parts = circuit.parts
    .filter((p) => p.type !== 'wire-end')
    .map((p) => {
      const props = Object.fromEntries(
        describeProperties(p.type).map((k) => [
          k,
          (p as unknown as Record<string, unknown>)[k],
        ]),
      )
      const placed = p.parentId ? 'on breadboard' : 'on table'
      return {
        id: short(p.id),
        type: p.type,
        ...props,
        ...(p.type === 'arduino-uno'
          ? {
              compiled: p.compilationStatus === 'success',
              hasCode: !!p.files?.['main.ino'],
            }
          : {}),
        placed,
      }
    })
  const label = (m: { partId: string; type: string; terminal: string }) =>
    m.type === 'breadboard'
      ? `breadboard.${m.terminal}`
      : `${m.type}:${short(m.partId)}.${m.type === 'tactile-switch' ? switchSide(m.terminal) : m.terminal}`
  const labels = (n: NetMember[]) => [...new Set(n.map(label))]
  const pins = (n: NetMember[]) => n.filter((m) => m.type !== 'breadboard')
  // unused pins of a microcontroller are normal, not a problem
  const HOSTS = new Set(['arduino-uno', 'raspberry-pi'])
  const all = nets(circuit)
  const connected = all.filter((n) => pins(n).length > 1).map(labels)
  // a pin alone on its net (an unused strip or rail does not count as a connection)
  const floating = all
    .filter((n) => pins(n).length === 1 && !HOSTS.has(pins(n)[0].type))
    .map((n) => label(pins(n)[0]))
  return { parts, nets: connected, floating, wires: circuit.wires.length }
}

/**
 * One tool at a time per project. The model often emits several calls in one
 * step and the runtime runs them concurrently; each tool loads → edits → saves,
 * so unserialised calls would place parts on top of each other.
 */
const locks = new Map<string, Promise<unknown>>()
function withProjectLock<T>(
  projectId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = locks.get(projectId) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  locks.set(
    projectId,
    run.catch(() => undefined),
  )
  return run
}

function tool<T extends TSchema>(def: {
  name: string
  label: string
  description: string
  parameters: T
  execute: (params: Static<T>) => Promise<unknown>
}): AgentTool {
  return {
    name: def.name,
    label: def.label,
    description: def.description,
    parameters: def.parameters,
    execute: async (_id: string, params: unknown) => {
      const projectId = String(
        (params as { projectId?: string }).projectId ?? '',
      )
      return text(await withProjectLock(projectId, () => def.execute(params)))
    },
  }
}

const ProjectId = Type.String({ description: 'Project id (uuid)' })
const Ref = (what: string) =>
  Type.String({
    description: `${what} as "<part>.<terminal>": part = id prefix, type, or alias (uno, button, pot, lcd, battery…); terminal = pin name. Examples: "led.+", "uno.13", "uno.gnd", "uno.a0", "button.1", "battery.-", "breadboard.positive.a.1"`,
  })

// ------------------------------------------------------------------- tools
export const getProject = tool({
  name: 'get_project',
  label: 'Get project',
  description:
    'The circuit as nets: every part (id, type, editable properties), which pins are joined together, and `floating` pins that connect to nothing. Call first, and again after changes if unsure.',
  parameters: Type.Object({ projectId: ProjectId }),
  execute: async ({ projectId }) => {
    const p = await loadProject(projectId)
    return { id: p.id, name: p.name, ...describeCircuit(p.circuit) }
  },
})

export const addPart = tool({
  name: 'add_part',
  label: 'Add part',
  description:
    'Add a part; it is placed automatically (on the breadboard, or on the table for arduino-uno/battery/motor). Returns its id and pin names — then use connect() to wire it. Types: arduino-uno, breadboard, battery, resistor (kohm), led (color), tactile-switch (sides a and b; pressing joins them), capacitor, npn-transistor, pnp-transistor, motor, timer (555), 8-pin-chip, lcd1602-i2c (i2cAddress 0x27), lcd1602, potentiometer (pins 1, wiper, 3), tmp36 (vs, vout, gnd).',
  parameters: Type.Object({
    projectId: ProjectId,
    type: Type.String(),
    properties: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: 'e.g. {"kohm":0.22}, {"color":"Crimson"}, {"voltage":9}',
      }),
    ),
  }),
  execute: async ({ projectId, type, properties }) => {
    const key = type.trim().toLowerCase()
    const resolved = isPartType(key) ? key : TYPE_ALIASES[key]?.[0]
    if (!resolved || !isPartType(resolved))
      throw new Error(
        `Unknown part type "${type}" — see add_part description for the list`,
      )
    const project = await loadProject(projectId)
    const circuit = project.circuit
    const part: PartJSON = {
      id: crypto.randomUUID(),
      type: resolved,
      parentId: null,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      terminals: [],
      showLabels: false,
      showVoltages: false,
    }
    applyProperties(part, properties ?? {})
    if (isFreeStanding(resolved)) placeFree(circuit, part)
    else {
      const board = circuit.parts.find((p) => p.type === 'breadboard')
      if (!board)
        throw new Error(
          'No breadboard in the project — add_part("breadboard") first',
        )
      part.parentId = board.id
      placeOnBoard(circuit, part, board)
    }
    circuit.parts.push(part)
    await saveCircuit(project)
    const pins = terminalDefs(part).map((d) => d.name)
    const note =
      part.type === 'tactile-switch'
        ? 'pins 1 and 2 are the SAME contact; 3 and 4 are the other contact. Wire one side via pin 1 and the other via pin 3.'
        : undefined
    return {
      added: {
        id: short(part.id),
        type: part.type,
        pins,
        ...(note ? { note } : {}),
      },
    }
  },
})

export const connect = tool({
  name: 'connect',
  label: 'Connect',
  description:
    'Join two pins electrically. The tool picks free breadboard holes on each net and routes the wire; if the pins are already on one net it does nothing. Connect pins to pins — never to holes.',
  parameters: Type.Object({
    projectId: ProjectId,
    a: Ref('First pin'),
    b: Ref('Second pin'),
  }),
  execute: async ({ projectId, a, b }) => {
    const project = await loadProject(projectId)
    const c = project.circuit
    const ra = resolveRef(c, a)
    const rb = resolveRef(c, b)
    const plan = planConnect(c, ra, rb)
    if (!plan) return { alreadyConnected: true }
    c.parts.push(...plan.ends)
    c.wires.push(plan.wire)
    await saveCircuit(project)
    // everything now on this net — so an unintended passenger (an old link) is visible immediately
    const { nets: after } = describeCircuit(c)
    const key = (r: { part: PartJSON; terminal: string }) =>
      `${r.part.type}:${short(r.part.id)}.${r.part.type === 'tactile-switch' ? switchSide(r.terminal) : r.terminal}`
    const net = after.find((n) => n.includes(key(ra))) ?? []
    return { wired: `${plan.from} ↔ ${plan.to}`, color: plan.wire.color, net }
  },
})

export const setProperty = tool({
  name: 'set_property',
  label: 'Set property',
  description:
    'Change editable properties of a part: resistor kohm, led color (Crimson | DeepSkyBlue | MediumSeaGreen), battery voltage, tactile-switch latching, potentiometer wiper (0..1), tmp36 temperature (°C), lcd1602-i2c i2cAddress.',
  parameters: Type.Object({
    projectId: ProjectId,
    part: Type.String({ description: 'id prefix, type, or alias' }),
    properties: Type.Record(Type.String(), Type.Unknown()),
  }),
  execute: async ({ projectId, part, properties }) => {
    const project = await loadProject(projectId)
    const p = resolvePart(project.circuit, part)
    applyProperties(p, properties)
    await saveCircuit(project)
    return { updated: { id: short(p.id), type: p.type, ...properties } }
  },
})

export const remove = tool({
  name: 'remove',
  label: 'Remove',
  description:
    'Remove a part (with its wires), or disconnect two pins: removes the wire whose removal separates their nets.',
  parameters: Type.Object({
    projectId: ProjectId,
    part: Type.Optional(
      Type.String({ description: 'id prefix, type, or alias' }),
    ),
    a: Type.Optional(Ref('First pin of the wire to remove')),
    b: Type.Optional(Ref('Second pin of the wire to remove')),
  }),
  execute: async ({ projectId, part, a, b }) => {
    const project = await loadProject(projectId)
    const c = project.circuit
    const doomed = new Set<string>()
    if (part) doomed.add(resolvePart(c, part).id)
    else if (a && b) {
      const ra = resolveRef(c, a)
      const rb = resolveRef(c, b)
      const wires = splittingWires(c, ra, rb)
      if (wires === null)
        throw new Error(
          `${a} and ${b} are joined without a wire (legs on one strip, or pins joined inside a part) — remove or re-add a part instead`,
        )
      if (wires.length === 0) return { alreadyDisconnected: true }
      for (const w of wires) {
        doomed.add(w.partOneId)
        doomed.add(w.partTwoId)
      }
    } else throw new Error('Give either part, or both a and b')
    let grew = true
    while (grew) {
      grew = false
      for (const p of c.parts)
        if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id)) {
          doomed.add(p.id)
          grew = true
        }
    }
    for (const w of c.wires)
      if (doomed.has(w.partOneId) || doomed.has(w.partTwoId)) {
        doomed.add(w.partOneId)
        doomed.add(w.partTwoId)
      }
    c.wires = c.wires.filter(
      (w) => !doomed.has(w.partOneId) && !doomed.has(w.partTwoId),
    )
    c.parts = c.parts.filter((p) => !doomed.has(p.id))
    // jumpers that only served the removed part go with it, so its strips come back clean
    let dangling = danglingWires(c)
    while (dangling.length) {
      const ends = new Set(dangling.flatMap((w) => [w.partOneId, w.partTwoId]))
      c.wires = c.wires.filter((w) => !dangling.includes(w))
      c.parts = c.parts.filter((p) => !ends.has(p.id))
      ends.forEach((e) => doomed.add(e))
      dangling = danglingWires(c)
    }
    await saveCircuit(project)
    return { removed: [...doomed].map(short) }
  },
})

export const setArduinoCode = tool({
  name: 'set_arduino_code',
  label: 'Set Arduino code',
  description:
    'Replace main.ino of the Arduino and compile it (arduino-cli; libraries: Wire, LiquidCrystal, LiquidCrystal_I2C). Must compile before simulate can run the MCU.',
  parameters: Type.Object({
    projectId: ProjectId,
    code: Type.String(),
    part: Type.Optional(
      Type.String({ description: 'only needed with several Arduinos' }),
    ),
  }),
  execute: async ({ projectId, code, part }) => {
    const project = await loadProject(projectId)
    const p = resolvePart(project.circuit, part ?? 'arduino-uno')
    if (p.type !== 'arduino-uno') throw new Error(`${p.type} is not an Arduino`)
    const files = {
      ...(p.files ?? {}),
      'main.ino': { content: code, fileExtension: '.ino', order: 0 },
    }
    const result = await compileSketch(files)
    p.files = files
    p.compilationStatus = result.error ? 'error' : 'success'
    p.compilationOutput = result.error ? result.stderr : result.stdout
    if (result.data) p.hexFile = result.data
    await saveCircuit(project)
    return {
      status: p.compilationStatus,
      output: (result.error ? result.stderr : result.stdout).slice(0, 4000),
    }
  },
})

export const simulate = tool({
  name: 'simulate',
  label: 'Simulate',
  description:
    'Run the real engine (same as the Simulate button) for N windows of 50 ms (default 10; use 40+ for sketches with delays or LCD init). Optionally hold buttons pressed. Reports per part (LED mA — lit ≈ >2 mA, resistor W, LCD text, TMP36/pot volts, Arduino serial) plus `problems`: floating pins, LEDs that stay dark, rating errors, SPICE errors. Fix every problem before reporting back.',
  parameters: Type.Object({
    projectId: ProjectId,
    windows: Type.Optional(Type.Integer({ minimum: 1, maximum: 200 })),
    press: Type.Optional(
      Type.Array(Type.String(), {
        description: 'buttons to hold pressed (id prefix/type/alias)',
      }),
    ),
  }),
  execute: async ({ projectId, windows = 10, press = [] }) => {
    const project = await loadProject(projectId)
    const errors: string[] = []
    const warnings: string[] = []
    const circuit = new Circuit(project.circuit, {
      onError: (m) => errors.push(m),
      onWarning: (m) => warnings.push(m),
    })
    const pressed = press.map((ref) => resolvePart(project.circuit, ref).id)
    for (const p of circuit.parts)
      if (p instanceof TactileSwitch && pressed.includes(p.id))
        p.setPressed(true)
    const unpressed = circuit.parts
      .filter((p) => p instanceof TactileSwitch && !pressed.includes(p.id))
      .map((p) => short(p.id))
    // sample every window so blinking outputs are judged by their peak, not by the last instant
    const peakMilliamps = new Map<string, number>()
    const peakPin13 = new Map<string, number>()
    let n = 0
    await new Promise<void>((resolve) => {
      circuit.events.onWindow = (c) => {
        const now = c.data.latestTime
        for (const p of c.parts) {
          if (p instanceof Led) {
            const mA = Math.abs(c.data.getAmperage(p.deviceId, now) * 1e3)
            peakMilliamps.set(p.id, Math.max(peakMilliamps.get(p.id) ?? 0, mA))
          }
          if (p instanceof ArduinoUno) {
            const v = p.getVoltageAcross('~13', 'gnd.1', now)
            peakPin13.set(p.id, Math.max(peakPin13.get(p.id) ?? 0, v))
          }
        }
        if (++n >= windows) {
          c.stop()
          resolve()
        }
      }
      void circuit.start().then(resolve)
    })
    const t = circuit.data.latestTime
    const problems: string[] = []
    const report = circuit.parts
      .map((p) => {
        const id = short(p.id)
        if (p instanceof Led) {
          const mA = +(circuit.data.getAmperage(p.deviceId, t) * 1e3).toFixed(2)
          const peak = +(peakMilliamps.get(p.id) ?? 0).toFixed(2)
          if (peak < 1)
            problems.push(
              `led ${id} never lit (peak ${peak} mA): no current path — check + → resistor → supply, − → ground, and that the driving pin goes HIGH` +
                (unpressed.length
                  ? `; buttons ${unpressed.join(', ')} were NOT pressed — simulate again with press:[...] if the LED sits behind one`
                  : ''),
            )
          return { id, type: p.type, currentMilliamps: mA, peakMilliamps: peak }
        }
        if (p instanceof Battery)
          return {
            id,
            type: p.type,
            amps: +circuit.data.getAmperage(p.deviceId, t).toFixed(3),
          }
        if (p instanceof Resistor)
          return {
            id,
            type: p.type,
            voltageDrop: +p.getVoltageAcross('t1', 't2', t).toFixed(3),
            watts: +(
              p.getVoltageAcross('t1', 't2', t) ** 2 /
              p.resistance
            ).toFixed(3),
          }
        if (p instanceof Motor)
          return {
            id,
            type: p.type,
            voltageDrop: +p.getVoltageAcross('t1', 't2', t).toFixed(3),
          }
        if (p instanceof ArduinoUno) {
          if (!p.hexFile)
            problems.push(
              `arduino ${id} has no compiled sketch — call set_arduino_code`,
            )
          return {
            id,
            type: p.type,
            serial: p.logs.slice(-2000),
            pin13Volts: +p.getVoltageAcross('~13', 'gnd.1', t).toFixed(2),
            pin13PeakVolts: +(peakPin13.get(p.id) ?? 0).toFixed(2),
          }
        }
        if (p instanceof Lcd1602 || p instanceof Lcd1602I2c) {
          const snap = p.snapshot
          const lines = snap.lines.map((l: number[]) =>
            String.fromCharCode(...l),
          )
          if (!snap.displayOn)
            problems.push(
              `lcd ${id} never initialised — check VCC/GND/SDA/SCL and the sketch`,
            )
          return {
            id,
            type: p.type,
            backlight: snap.backlight,
            displayOn: snap.displayOn,
            lines,
          }
        }
        if (p instanceof Tmp36)
          return {
            id,
            type: p.type,
            temperatureC: p.temperature,
            outputVolts: +p.outputVoltage.toFixed(3),
          }
        if (p instanceof Potentiometer)
          return { id, type: p.type, wiperVolts: +p.wiperVoltage.toFixed(3) }
        return null
      })
      .filter(Boolean)
    circuit.clock.setTick(30)
    circuit.clock.setTime(t)
    for (const p of circuit.parts)
      for (const e of p.errors)
        problems.push(`${p.type} ${short(p.id)}: ${e.message}`)
    for (const f of describeCircuit(project.circuit).floating)
      problems.push(`${f} is connected to nothing`)
    problems.push(...errors.map((e) => `spice: ${e}`))
    return {
      simulatedMs: t,
      pressed: press,
      report,
      problems,
      spiceWarnings: warnings.slice(0, 3),
    }
  },
})

export const bulbusTools: AgentTool[] = [
  getProject,
  addPart,
  connect,
  setProperty,
  remove,
  setArduinoCode,
  simulate,
]
