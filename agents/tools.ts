/**
 * App-specific tools exposed to Electric Agents. Each tool talks to Convex
 * over HTTP (no auth yet — every project is editable) and bumps the project's
 * `agentVersion` so open editors reload.
 *
 * Tools return `{ content: [{ type: 'text', text }], details }` per the
 * AgentTool contract; throw on failure.
 */
import { Type } from '@sinclair/typebox'
import type { Static, TSchema } from '@sinclair/typebox'
import type { AgentTool } from '@electric-ax/agents-runtime'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import * as defs from '#/sim/defs'
import { PartType, mg } from '#/sim/types'
import type {
  CircuitJSON,
  PartJSON,
  PartType as PartTypeT,
  ProjectJSON,
  TerminalDefinition,
} from '#/sim/types'
import { partManagers, LED_COLORS, WIRE_COLORS } from '#/editor/models'
import type { EditorPart } from '#/editor/models'
import { compileSketch } from '#/server/compile'
import { PALETTE, defaultProject } from '#/lib/projects'
import { ArduinoUno, Battery, Circuit, Led, Motor, Resistor } from '#/sim'

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

async function loadProject(id: string): Promise<ProjectJSON> {
  const row = (await convex.query(api.projects.getById, {
    id,
  })) as ProjectJSON | null
  if (!row) throw new Error(`Project ${id} not found`)
  return row
}

async function saveCircuit(project: ProjectJSON, circuit: CircuitJSON) {
  await convex.mutation(api.projects.upsert, {
    id: project.id,
    name: project.name,
    user_id: project.user_id ?? null,
    parent_id: project.parent_id ?? null,
    camera: project.camera,
    circuit,
    agentVersion: Date.now(),
  })
}

/** Terminal definitions per type; types without an entry here can't be placed by tools yet. */
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
  [PartType.Timer]: defs.timerTerminals,
  [PartType.ArduinoUno]: defs.arduinoUnoTerminals,
  [PartType.Motor]: defs.motorTerminals,
  [PartType.EightPinChip]: defs.eightPinChipTerminals,
}

function terminalDefs(
  part: Pick<PartJSON, 'type' | 'model'>,
): TerminalDefinition[] {
  const t = TERMINALS[part.type]
  if (!t) throw new Error(`Tools don't know the terminals of ${part.type} yet`)
  return typeof t === 'function' ? t(part.model ?? '') : t
}

/** Static metadata of an editor part class. */
const manager = (type: PartTypeT) =>
  partManagers[type] as unknown as typeof EditorPart

function dragSurfaceHeight(type: PartTypeT) {
  const M = manager(type)
  return M.dragSurfaceHeight ?? M.dimensions.height
}

const isPartType = (t: string): t is PartTypeT =>
  (Object.values(PartType) as string[]).includes(t)

/** A part's summary for the agent: terminals with their connections and, for parents, their terminal names. */
function describePart(p: PartJSON) {
  const { id, type, parentId, position, rotation, terminals, ...rest } = p
  const extras = Object.fromEntries(
    Object.entries(rest).filter(
      ([k]) =>
        ![
          'files',
          'hexFile',
          'compilationOutput',
          'showLabels',
          'showVoltages',
        ].includes(k),
    ),
  )
  return { id, type, parentId, position, rotation, terminals, ...extras }
}

/**
 * Place `part` on `parent` so its first requested terminal sits exactly on the
 * named parent hole, then resolve EVERY bottom terminal's connection from
 * geometry — the same 0.33·mg rule the editor uses — so stored connections can
 * never disagree with where the legs physically are. The four rotations are
 * tried in order starting from the part's own; the first that satisfies all
 * requested holes wins. If none does, the error lists where each leg lands at
 * each rotation so the caller can pick reachable holes.
 */
function placeOnParent(part: PartJSON, parent: PartJSON) {
  const requested = Object.fromEntries(
    part.terminals.map((t) => [t.name, t.connections[0]]),
  )
  const first = part.terminals[0]
  if (!first?.connections[0]) return
  const own = terminalDefs(part)
  const parentTerms = terminalDefs(parent)
  const anchor = own.find((d) => d.name === first.name)
  const target = parentTerms.find((d) => d.name === first.connections[0])
  if (!anchor) throw new Error(`${part.type} has no terminal "${first.name}"`)
  if (!target)
    throw new Error(`${parent.type} has no terminal "${first.connections[0]}"`)

  const attempt = (rot: number) => {
    const local = (d: TerminalDefinition) => ({
      x: d.position.x * Math.cos(rot) + d.position.z * Math.sin(rot),
      z: -d.position.x * Math.sin(rot) + d.position.z * Math.cos(rot),
    })
    const a = local(anchor)
    const position = {
      x: target.position.x - a.x,
      y: dragSurfaceHeight(parent.type),
      z: target.position.z - a.z,
    }
    const terminals = own
      .filter((d) => d.surface === 'bottom')
      .map((d) => {
        const l = local(d)
        const hit = parentTerms.find(
          (t) =>
            Math.hypot(
              t.position.x - (position.x + l.x),
              t.position.z - (position.z + l.z),
            ) <
            0.33 * mg,
        )
        return { name: d.name, connections: hit ? [hit.name] : [] }
      })
    const ok = Object.entries(requested).every(
      ([name, want]) =>
        !want ||
        terminals.find((t) => t.name === name)?.connections[0] === want,
    )
    return { rot, position, terminals, ok }
  }

  const tried = [0, 1, 2, 3].map((k) =>
    attempt(part.rotation + (k * Math.PI) / 2),
  )
  const hit = tried.find((t) => t.ok)
  if (!hit) {
    const table = tried
      .map(
        (t) =>
          `rotation ${Math.round((t.rot * 180) / Math.PI) % 360}°: ` +
          t.terminals
            .map((x) => `${x.name}→${x.connections[0] ?? 'none'}`)
            .join(', '),
      )
      .join('; ')
    throw new Error(
      `Cannot place ${part.type} with ${JSON.stringify(requested)}: legs are a fixed distance apart. ` +
        `With "${first.name}" on ${first.connections[0]} the legs land at — ${table}. Pick one of these combinations.`,
    )
  }
  part.rotation = hit.rot
  part.position = hit.position
  part.terminals = hit.terminals
}

const LED_COLOR_VALUES: string[] = LED_COLORS.map((c) => c.value)
const WIRE_COLOR_VALUES: string[] = WIRE_COLORS.map((c) => c.value)

/** Reject property values the editor would not accept. */
function validateProperties(type: PartTypeT, props: Record<string, unknown>) {
  if (
    type === 'led' &&
    'color' in props &&
    !LED_COLOR_VALUES.includes(String(props.color))
  ) {
    throw new Error(
      `LED color must be one of ${LED_COLOR_VALUES.join(', ')} (got ${String(props.color)})`,
    )
  }
  for (const k of ['kohm', 'voltage', 'capacitance']) {
    if (k in props && typeof props[k] !== 'number')
      throw new Error(`${k} must be a number`)
  }
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
    execute: async (_id: string, params: unknown) =>
      text(await def.execute(params)),
  }
}

const ProjectId = Type.String({
  description: 'Project id (uuid) — the last path segment of /projects/<id>',
})

// ------------------------------------------------------------------- tools
export const listProjects = tool({
  name: 'list_projects',
  label: 'List projects',
  description: 'List all bulbus projects (id, name, part counts).',
  parameters: Type.Object({}),
  execute: async () => {
    const rows = (await convex.query(api.projects.list, {})) as ProjectJSON[]
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      parts: r.circuit.parts.length,
      wires: r.circuit.wires.length,
      created_at: r.created_at,
    }))
  },
})

export const getProject = tool({
  name: 'get_project',
  label: 'Get project',
  description:
    'Read a project: every part with its terminals/connections and every wire. Use this before editing.',
  parameters: Type.Object({ projectId: ProjectId }),
  execute: async ({ projectId }) => {
    const p = await loadProject(projectId)
    return {
      id: p.id,
      name: p.name,
      parts: p.circuit.parts.map(describePart),
      wires: p.circuit.wires,
    }
  },
})

export const listPartTypes = tool({
  name: 'list_part_types',
  label: 'List part types',
  description:
    'Catalogue of part types with their terminal names, which parents they can sit on, and their editable properties. Breadboard holes are named like "A.12" (strip rows A–J, columns 1–63; columns are connected within A–E and within F–J) and "positive.a.7"/"negative.a.7" (power rails, 1–50).',
  parameters: Type.Object({}),
  execute: async () =>
    PALETTE.filter((p) => p.stampType !== 'wire').map((p) => {
      const type = p.stampType as PartTypeT
      const M = manager(type)
      const terms = TERMINALS[type] ? terminalDefs({ type }) : []
      const props: Record<string, string> = {
        battery: 'voltage (V, default 9)',
        resistor: 'kohm (kΩ, default 1)',
        led: 'color: Crimson | DeepSkyBlue | MediumSeaGreen',
        'tactile-switch': 'latching (boolean)',
        'npn-transistor': 'model: 2N2222 | 2N3904',
        'pnp-transistor': 'model: 2N3906',
        capacitor: 'capacitance (farads, default 1e-6)',
        'arduino-uno': 'files (set via set_arduino_code)',
        '8-pin-chip': 'chipName, pinLabels {"1":"…"}, subcktCode',
      }
      return {
        type,
        label: p.label,
        terminals:
          type === 'breadboard' || type === 'raspberry-pi'
            ? `${terms.length} holes (see description)`
            : terms.map((t) => t.name),
        eligibleParents: [...M.eligibleParents],
        properties: props[type] ?? 'none',
      }
    }),
})

export const addPart = tool({
  name: 'add_part',
  label: 'Add part',
  description:
    'Add a part. To put it on a breadboard (or another parent) give parentId and connections mapping the part\'s terminal names to parent terminal names, e.g. {"+":"F.13","-":"F.14"}; the part is positioned so the first connection lands on that hole. Free-standing parts (battery, arduino-uno, breadboard, motor) take a position instead. Returns the new part id.',
  parameters: Type.Object({
    projectId: ProjectId,
    type: Type.String({ description: 'Part type from list_part_types' }),
    parentId: Type.Optional(Type.String()),
    connections: Type.Optional(Type.Record(Type.String(), Type.String())),
    position: Type.Optional(
      Type.Object({ x: Type.Number(), z: Type.Number() }),
    ),
    rotation: Type.Optional(
      Type.Number({ description: 'radians about Y; multiples of π/2' }),
    ),
    properties: Type.Optional(
      Type.Record(Type.String(), Type.Unknown(), {
        description: 'e.g. {"kohm":0.22} or {"color":"DeepSkyBlue"}',
      }),
    ),
  }),
  execute: async ({
    projectId,
    type,
    parentId,
    connections,
    position,
    rotation,
    properties,
  }) => {
    if (!isPartType(type)) throw new Error(`Unknown part type ${type}`)
    validateProperties(type, properties ?? {})
    const project = await loadProject(projectId)
    const circuit = project.circuit
    const part: PartJSON = {
      id: crypto.randomUUID(),
      type,
      parentId: parentId ?? null,
      position: { x: position?.x ?? 0, y: 0, z: position?.z ?? 0 },
      rotation: rotation ?? 0,
      terminals: Object.entries(connections ?? {}).map(([name, to]) => ({
        name,
        connections: [to],
      })),
      showLabels: false,
      showVoltages: false,
      ...(properties ?? {}),
    }
    if (parentId) {
      const parent = circuit.parts.find((p) => p.id === parentId)
      if (!parent) throw new Error(`Parent ${parentId} not found`)
      if (!manager(type).eligibleParents.has(parent.type))
        throw new Error(`${type} cannot be placed on ${parent.type}`)
      placeOnParent(part, parent)
    }
    circuit.parts.push(part)
    await saveCircuit(project, circuit)
    return { added: describePart(part) }
  },
})

export const updatePart = tool({
  name: 'update_part',
  label: 'Update part',
  description:
    'Change properties (kohm, voltage, color, model, …), rotation, or terminal connections of an existing part.',
  parameters: Type.Object({
    projectId: ProjectId,
    partId: Type.String(),
    properties: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    rotation: Type.Optional(Type.Number()),
    connections: Type.Optional(Type.Record(Type.String(), Type.String())),
  }),
  execute: async ({ projectId, partId, properties, rotation, connections }) => {
    const project = await loadProject(projectId)
    const part = project.circuit.parts.find((p) => p.id === partId)
    if (!part) throw new Error(`Part ${partId} not found`)
    validateProperties(part.type, properties ?? {})
    Object.assign(part, properties ?? {})
    if (rotation !== undefined) part.rotation = rotation
    if (connections) {
      part.terminals = Object.entries(connections).map(([name, to]) => ({
        name,
        connections: [to],
      }))
      const parent = project.circuit.parts.find((p) => p.id === part.parentId)
      if (parent) placeOnParent(part, parent)
    }
    await saveCircuit(project, project.circuit)
    return { updated: describePart(part) }
  },
})

export const removePart = tool({
  name: 'remove_part',
  label: 'Remove part',
  description:
    'Remove a part (and anything parented to it, and wires attached to removed wire ends).',
  parameters: Type.Object({ projectId: ProjectId, partId: Type.String() }),
  execute: async ({ projectId, partId }) => {
    const project = await loadProject(projectId)
    const c = project.circuit
    const doomed = new Set<string>([partId])
    let grew = true
    while (grew) {
      grew = false
      for (const p of c.parts)
        if (p.parentId && doomed.has(p.parentId) && !doomed.has(p.id))
          (doomed.add(p.id), (grew = true))
    }
    for (const w of c.wires)
      if (doomed.has(w.partOneId) || doomed.has(w.partTwoId))
        (doomed.add(w.partOneId), doomed.add(w.partTwoId))
    c.wires = c.wires.filter(
      (w) => !doomed.has(w.partOneId) && !doomed.has(w.partTwoId),
    )
    c.parts = c.parts.filter((p) => !doomed.has(p.id))
    await saveCircuit(project, c)
    return { removed: [...doomed] }
  },
})

export const addWire = tool({
  name: 'add_wire',
  label: 'Add wire',
  description:
    'Connect two terminals with a wire, e.g. from {partId: <battery>, terminal: "+"} to {partId: <breadboard>, terminal: "positive.a.1"}. Creates the two wire ends and the wire.',
  parameters: Type.Object({
    projectId: ProjectId,
    from: Type.Object({ partId: Type.String(), terminal: Type.String() }),
    to: Type.Object({ partId: Type.String(), terminal: Type.String() }),
    color: Type.Optional(
      Type.String({
        description:
          'Crimson | DarkOrange | Gold | MediumSeaGreen | DeepSkyBlue | MediumOrchid | Black | White',
      }),
    ),
  }),
  execute: async ({ projectId, from, to, color }) => {
    const project = await loadProject(projectId)
    const c = project.circuit
    const end = (at: { partId: string; terminal: string }): PartJSON => {
      const parent = c.parts.find((p) => p.id === at.partId)
      if (!parent) throw new Error(`Part ${at.partId} not found`)
      if (!manager('wire-end').eligibleParents.has(parent.type))
        throw new Error(
          `Wires cannot attach to a ${parent.type}; attach to a breadboard hole, battery, arduino, motor or raspberry-pi pin`,
        )
      const e: PartJSON = {
        id: crypto.randomUUID(),
        type: 'wire-end',
        parentId: parent.id,
        position: { x: 0, y: 0, z: 0 },
        rotation: 0,
        terminals: [{ name: 't1', connections: [at.terminal] }],
        showLabels: false,
      }
      placeOnParent(e, parent)
      return e
    }
    const a = end(from)
    const b = end(to)
    c.parts.push(a, b)
    if (color && !WIRE_COLOR_VALUES.includes(color))
      throw new Error(
        `Wire color must be one of ${WIRE_COLOR_VALUES.join(', ')}`,
      )
    const wire = {
      id: crypto.randomUUID(),
      color: color ?? 'Crimson',
      partOneId: a.id,
      partTwoId: b.id,
      height: 2,
      showCurrents: false,
    }
    c.wires.push(wire)
    await saveCircuit(project, c)
    return { wire, ends: [a.id, b.id] }
  },
})

export const setArduinoCode = tool({
  name: 'set_arduino_code',
  label: 'Set Arduino code',
  description:
    'Replace main.ino of an Arduino Uno part and compile it with arduino-cli. Returns compiler output; the sketch must compile before the project can simulate.',
  parameters: Type.Object({
    projectId: ProjectId,
    partId: Type.String(),
    code: Type.String(),
  }),
  execute: async ({ projectId, partId, code }) => {
    const project = await loadProject(projectId)
    const part = project.circuit.parts.find((p) => p.id === partId)
    if (!part || part.type !== 'arduino-uno')
      throw new Error(`Part ${partId} is not an arduino-uno`)
    const files = {
      ...(part.files ?? {}),
      'main.ino': { content: code, fileExtension: '.ino', order: 0 },
    }
    const result = await compileSketch(files)
    part.files = files
    part.compilationStatus = result.error ? 'error' : 'success'
    part.compilationOutput = result.error ? result.stderr : result.stdout
    if (result.data) part.hexFile = result.data
    await saveCircuit(project, project.circuit)
    return {
      status: part.compilationStatus,
      output: (result.error ? result.stderr : result.stdout).slice(0, 4000),
    }
  },
})

export const simulate = tool({
  name: 'simulate',
  label: 'Simulate',
  description:
    'Run the circuit headlessly for N windows of 50 ms (default 8) and report what happened: LED currents (lit ≈ >2 mA), battery/Arduino current, resistor power, motor speed, Arduino serial output, rating errors and SPICE errors. Use after every change to verify it works.',
  parameters: Type.Object({
    projectId: ProjectId,
    windows: Type.Optional(Type.Integer({ minimum: 1, maximum: 40 })),
  }),
  execute: async ({ projectId, windows = 8 }) => {
    const project = await loadProject(projectId)
    const errors: string[] = []
    const warnings: string[] = []
    const circuit = new Circuit(project.circuit, {
      onError: (m) => errors.push(m),
      onWarning: (m) => warnings.push(m),
    })
    let n = 0
    await new Promise<void>((resolve) => {
      circuit.events.onWindow = (c) => {
        if (++n >= windows) {
          c.stop()
          resolve()
        }
      }
      void circuit.start().then(resolve)
    })
    const t = circuit.data.latestTime
    const report = circuit.parts
      .map((p) => {
        if (p instanceof Led)
          return {
            id: p.id,
            type: p.type,
            currentMilliamps: +(
              circuit.data.getAmperage(p.deviceId, t) * 1e3
            ).toFixed(2),
          }
        if (p instanceof Battery)
          return {
            id: p.id,
            type: p.type,
            amps: +circuit.data.getAmperage(p.deviceId, t).toFixed(3),
          }
        if (p instanceof Resistor)
          return {
            id: p.id,
            type: p.type,
            voltageDrop: +p.getVoltageAcross('t1', 't2', t).toFixed(3),
            watts: +(
              p.getVoltageAcross('t1', 't2', t) ** 2 /
              p.resistance
            ).toFixed(3),
          }
        if (p instanceof Motor)
          return {
            id: p.id,
            type: p.type,
            voltageDrop: +p.getVoltageAcross('t1', 't2', t).toFixed(3),
          }
        if (p instanceof ArduinoUno)
          return {
            id: p.id,
            type: p.type,
            serial: p.logs.slice(-2000),
            pin13Volts: +p.getVoltageAcross('~13', 'gnd.1', t).toFixed(2),
          }
        return null
      })
      .filter(Boolean)
    // rating checks normally run from the playback clock; evaluate them once at the end
    circuit.clock.setTick(30)
    circuit.clock.setTime(t)
    const partErrors = circuit.parts.flatMap((p) =>
      p.errors.map((e) => ({ partId: p.id, ...e })),
    )
    return {
      simulatedMs: t,
      report,
      partErrors,
      spiceErrors: errors,
      spiceWarnings: warnings.slice(0, 5),
    }
  },
})

export const createProject = tool({
  name: 'create_project',
  label: 'Create project',
  description:
    'Create a new project from the blank template (breadboard + 9 V battery wired to the top rails). Returns its id and URL.',
  parameters: Type.Object({ name: Type.Optional(Type.String()) }),
  execute: async ({ name }) => {
    const p = defaultProject(crypto.randomUUID())
    if (name) p.name = name
    await saveCircuit(p, p.circuit)
    return { id: p.id, url: `/projects/${p.id}` }
  },
})

export const bulbusTools: AgentTool[] = [
  listProjects,
  getProject,
  listPartTypes,
  addPart,
  updatePart,
  removePart,
  addWire,
  setArduinoCode,
  simulate,
  createProject,
]
