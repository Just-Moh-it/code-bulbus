import { Clock } from './clock'
import { DataBus } from './data-bus'
import type { Part, PartInit } from './part'
import { Wire } from './wire'
import { runNetlist } from './spice/runner'
import { ArduinoUno } from './parts/arduino-uno'
import { Battery } from './parts/battery'
import { Breadboard } from './parts/breadboard'
import { Led } from './parts/led'
import { Resistor } from './parts/resistor'
import { WireEnd } from './parts/wire-end'
import { PartType } from './types'
import type {
  CircuitJSON,
  PartJSON,
  PartType as PartTypeT,
  SpiceFailure,
} from './types'

type PartCtor = new (init: PartInit) => Part

/** Part type → simulator class. Extend as more parts are ported. */
export const partRegistry: Partial<Record<PartTypeT, PartCtor>> = {
  [PartType.Breadboard]: Breadboard,
  [PartType.Battery]: Battery,
  [PartType.Resistor]: Resistor,
  [PartType.Led]: Led,
  [PartType.WireEnd]: WireEnd,
  [PartType.ArduinoUno]: ArduinoUno,
}

/** Order part ids so that every parent precedes its children. */
export function orderByParent(parts: PartJSON[]): string[] {
  const byId = new Map(parts.map((p) => [p.id, p]))
  const out: string[] = []
  const seen = new Set<string>()
  const visit = (p: PartJSON) => {
    if (seen.has(p.id)) return
    seen.add(p.id)
    if (p.parentId) {
      const parent = byId.get(p.parentId)
      if (parent) visit(parent)
    }
    out.push(p.id)
  }
  parts.forEach(visit)
  return out
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const fastMachine = () => (globalThis.navigator?.hardwareConcurrency ?? 8) >= 8

export interface CircuitEvents {
  onError?: (message: string) => void
  onWarning?: (message: string) => void
  /** Called after each window's results are appended. */
  onWindow?: (circuit: Circuit) => void
}

export const circuitDebug = { enabled: false }

/**
 * Orchestrates co-simulation: builds the netlist from parts + wires, runs
 * ngspice in 50 ms windows, stores results in the DataBus, advances the
 * MCU emulators, and keeps the playback clock in step.
 */
export class Circuit {
  readonly partsById: Record<string, Part> = {}
  readonly wiresById: Record<string, Wire> = {}
  simDuration = 50
  readonly data = new DataBus()
  readonly errors = new Set<string>()
  readonly warnings = new Set<string>()
  clock!: Clock
  nodeCounter = 0
  running = false
  simCount = 0
  totalSimTime = 0
  events: CircuitEvents

  constructor(json: CircuitJSON, events: CircuitEvents = {}) {
    this.events = events
    this.initClock()
    const byId = Object.fromEntries(json.parts.map((p) => [p.id, p]))
    for (const id of orderByParent(json.parts)) {
      const p = byId[id]
      const Ctor = partRegistry[p.type]
      if (!Ctor)
        throw new Error(`No simulator registered for part type "${p.type}"`)
      this.partsById[p.id] = new Ctor({ ...p, circuit: this })
    }
    for (const w of json.wires) {
      this.wiresById[w.id] = new Wire({ ...w, circuit: this })
    }
    this.assignNodes()
  }

  getPartById = (id: string) => this.partsById[id]

  get parts() {
    return Object.values(this.partsById)
  }

  get wires() {
    return Object.values(this.wiresById)
  }

  private initClock() {
    this.clock = new Clock()
    this.clock.onChange(() => {
      if (this.clock.time > this.data.latestTime) this.clock.pause()
    })
  }

  /**
   * Assign SPICE node numbers. Ground (node 0) is the Arduino's GND if
   * present, otherwise the battery's negative terminal. Every other
   * connected group of terminals gets a fresh number.
   */
  assignNodes() {
    const battery = this.parts.find((p) => p.type === PartType.Battery)
    const arduino = this.parts.find((p) => p.type === PartType.ArduinoUno)
    if (arduino) arduino.terminalsByName['gnd.1'].node = 0
    else if (battery) battery.terminalsByName['-'].node = 0
    this.nodeCounter = 0
    this.parts.forEach((part) => {
      part.terminals.forEach((t) => {
        if (t.node !== null) return
        const reachable = t.getReachable()
        const known = reachable.find((r) => r.node !== null)
        const node = known ? known.node! : ++this.nodeCounter
        t.node = node
        reachable.forEach((r) => (r.node = node))
      })
    })
  }

  get averageSimTime() {
    return this.simCount === 0
      ? this.simDuration
      : this.totalSimTime / this.simCount
  }

  get idealClockRate() {
    return this.simDuration / this.averageSimTime
  }

  /** `.ic` line carrying node voltages from the end of the previous window. */
  get initialConditions() {
    if (this.data.latestTime === 0) return ''
    let ic = '.ic'
    for (const [name, series] of Object.entries(this.data.voltages)) {
      ic += ` ${name}=${series[series.length - 1]}`
    }
    return ic
  }

  toNetlist(duration: number) {
    const reltol = fastMachine() ? '0.003' : '0.004'
    const lines = ['Circuit']
    this.parts.forEach((p) => {
      const item = p.toNetlistItem().trim()
      if (item) lines.push(item)
    })
    this.wires.forEach((w) => {
      const item = w.toNetlistItem().trim()
      if (item) lines.push(item)
    })
    const ic = this.initialConditions
    lines.push(`.tran 16.6666ms ${duration}ms 0ms 16.6666ms ${ic ? 'uic' : ''}`)
    lines.push(ic)
    lines.push(
      `.options savecurrents interp method=trap RELTOL=${reltol} GMIN=1e-10 ABSTOL=1e-10`,
    )
    lines.push('.option cshunt=1.3e-15')
    return lines.join('\n')
  }

  private beforeSimulate() {
    this.parts.forEach((p) => p.beforeSimulate?.())
  }
  private onSimulate() {
    this.parts.forEach((p) => p.onSimulate?.())
  }
  private afterSimulate() {
    this.parts.forEach((p) => p.afterSimulate?.())
  }

  /** Simulate one window. Pacing matches playback: never faster than real time. */
  async simulate() {
    this.beforeSimulate()
    const pace = sleep(fastMachine() ? this.simDuration : 2 * this.simDuration)
    const t0 = performance.now()
    const netlist = this.toNetlist(this.simDuration)
    if (circuitDebug.enabled) console.log(netlist)
    this.onSimulate()
    try {
      const result = await runNetlist(netlist)
      await pace
      if (this.running) {
        this.data.append(result)
        this.totalSimTime += performance.now() - t0
        this.simCount += 1
        this.clock.setRate(this.idealClockRate)
        this.afterSimulate()
        this.events.onWindow?.(this)
      }
    } catch (e) {
      const failure = e as SpiceFailure
      failure.errors?.forEach((msg) => {
        if (!this.errors.has(msg)) this.events.onError?.(msg)
        this.errors.add(msg)
      })
      failure.warnings?.forEach((msg) => {
        if (!this.errors.has(msg)) this.events.onWarning?.(msg)
        this.errors.add(msg)
      })
      if (circuitDebug.enabled) {
        console.warn('spice sim failed:', failure)
        console.log(netlist)
      }
      if (!failure.errors && !failure.warnings) throw e
    }
  }

  async start() {
    this.data.reset()
    this.simCount = 0
    this.totalSimTime = 0
    this.running = true
    this.parts.forEach((p) => p.start())
    await sleep(this.simDuration)
    while (this.running) {
      await this.simulate()
      if (this.running) this.clock.resume()
    }
  }

  stop() {
    this.running = false
    this.clock.stop()
    this.parts.forEach((p) => p.stop())
  }
}
