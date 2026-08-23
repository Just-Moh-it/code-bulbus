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
import { TactileSwitch } from './parts/tactile-switch'
import { NpnTransistor, PnpTransistor } from './parts/transistor'
import { Capacitor } from './parts/capacitor'
import { Timer } from './parts/timer'
import { EightPinChip } from './parts/eight-pin-chip'
import { Motor } from './parts/motor'
import { RaspberryPi } from './parts/raspberry-pi'
import { Lcd1602, Lcd1602I2c } from './parts/lcd1602'
import { Potentiometer } from './parts/potentiometer'
import { Tmp36 } from './parts/tmp36'
import { PartType } from './types'
import type {
  CircuitJSON,
  PartJSON,
  PartType as PartTypeT,
  SpiceFailure,
} from './types'

type PartCtor = new (init: PartInit) => Part

/** Part type → simulator class. Extend as more parts are ported. */
export const partRegistry: Record<PartTypeT, PartCtor> = {
  [PartType.Breadboard]: Breadboard,
  [PartType.Battery]: Battery,
  [PartType.Resistor]: Resistor,
  [PartType.Led]: Led,
  [PartType.WireEnd]: WireEnd,
  [PartType.ArduinoUno]: ArduinoUno,
  [PartType.TactileSwitch]: TactileSwitch,
  [PartType.NpnTransistor]: NpnTransistor,
  [PartType.PnpTransistor]: PnpTransistor,
  [PartType.Capacitor]: Capacitor,
  [PartType.Timer]: Timer,
  [PartType.EightPinChip]: EightPinChip,
  [PartType.Motor]: Motor,
  [PartType.RaspberryPi]: RaspberryPi,
  [PartType.Lcd1602]: Lcd1602,
  [PartType.Lcd1602I2c]: Lcd1602I2c,
  [PartType.Potentiometer]: Potentiometer,
  [PartType.Tmp36]: Tmp36,
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
  /** Run the MCU synchronously (headless scripts/tests); the browser runs it async. */
  syncMcu = false
  readonly data = new DataBus()
  readonly errors = new Set<string>()
  readonly warnings = new Set<string>()
  clock!: Clock
  nodeCounter = 0
  running = false
  simCount = 0
  totalSimTime = 0
  /** Wall-clock cost of the last window, for the perf readout. */
  stats = { spice: 0, mcu: 0, window: 0 }
  private recentWindowMs: number | null = null
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

  /**
   * Wall-clock cost of a window, smoothed over the last few windows only.
   * A cumulative average (the reference's approach) let one stall — the
   * ngspice warm-up on window 0, a hidden tab, a GC pause — drag playback
   * speed down for minutes; an EMA forgets it within ~5 windows.
   */
  get averageSimTime() {
    return this.recentWindowMs ?? this.simDuration
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
  private async afterSimulate() {
    for (const p of this.parts) await p.afterSimulate?.()
  }

  /**
   * Simulate one window. The MCU runs while the pacing timer is still
   * pending, so a window costs max(pace, spice + mcu) rather than their sum;
   * playback is never faster than real time and, if production outruns
   * playback, the clock jumps forward so it only ever reads samples the
   * DataBus still holds.
   */
  async simulate() {
    this.beforeSimulate()
    const pace = sleep(fastMachine() ? this.simDuration : 2 * this.simDuration)
    const t0 = performance.now()
    const netlist = this.toNetlist(this.simDuration)
    if (circuitDebug.enabled) console.log(netlist)
    this.onSimulate()
    try {
      const ts = performance.now()
      const result = await runNetlist(netlist)
      this.stats.spice = performance.now() - ts
      if (!this.running) return
      this.data.append(result)
      const ta = performance.now()
      await this.afterSimulate()
      this.stats.mcu = performance.now() - ta
      await pace
      if (this.running) {
        const wall = performance.now() - t0
        this.stats.window = wall
        this.totalSimTime += wall
        this.simCount += 1
        // a hidden tab throttles timers to ≥1 s; don't let that poison the rate
        if (!globalThis.document?.hidden)
          this.recentWindowMs =
            this.recentWindowMs === null
              ? wall
              : 0.7 * this.recentWindowMs + 0.3 * wall
        this.clock.setRate(Math.min(1, this.idealClockRate))
        const lag = this.data.latestTime - this.clock.time
        if (lag > 2 * this.simDuration)
          this.clock.seek(this.data.latestTime - this.simDuration)
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
