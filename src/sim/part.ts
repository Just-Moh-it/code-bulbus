import { Terminal } from './terminal'
import type { TerminalInit } from './terminal'
import type { Circuit } from './circuit'
import type {
  Dimensions,
  PartError,
  PartJSON,
  PartType,
  TerminalDefinition,
  Vec3,
} from './types'

export interface PartInit extends PartJSON {
  circuit: Circuit
}

export type TerminalCtor = new (init: TerminalInit) => Terminal

/**
 * Base simulation model for a part. Subclasses declare static metadata
 * (`type`, `dimensions`, `maxRatings`, `Terminal`) and override
 * `terminalDefinitions` / `toNetlistItem` / sim hooks.
 */
export abstract class Part {
  static type: PartType
  static dimensions: Dimensions
  static maxRatings: Record<string, number> = {}
  static Terminal: TerminalCtor = Terminal

  readonly id: string
  readonly type: PartType
  readonly position: Vec3
  readonly rotation: number
  readonly showVoltages: boolean
  readonly parent: Part | undefined
  readonly circuit: Circuit
  readonly errors: PartError[] = []

  terminals: Terminal[] = []
  terminalsByName: Record<string, Terminal> = {}
  terminalsByGroup: Record<string, Terminal[]> = {}

  constructor(init: PartInit) {
    this.id = init.id
    this.type = init.type
    this.position = { ...init.position }
    this.rotation = init.rotation
    this.showVoltages = init.showVoltages ?? false
    this.parent = init.parentId
      ? init.circuit.partsById[init.parentId]
      : undefined
    this.circuit = init.circuit
    this.init(init)
  }

  /** Override to read part-specific JSON; always call super.init(). */
  protected init(init: PartInit) {
    this.initTerminals(init.terminals ?? [])
  }

  protected initTerminals(json: { name: string; connections: string[] }[]) {
    const byName = Object.fromEntries(json.map((t) => [t.name, t]))
    const Ctor = (this.constructor as typeof Part).Terminal
    this.terminals = []
    this.terminalDefinitions.forEach((def) => {
      this.terminals.push(
        new Ctor({
          ...def,
          part: this,
          connections: byName[def.name]?.connections,
        }),
      )
    })
    this.terminalsByName = Object.fromEntries(
      this.terminals.map((t) => [t.name, t]),
    )
    this.terminalsByGroup = {}
    this.terminals.forEach((t) => {
      if (!t.group) return
      ;(this.terminalsByGroup[t.group] ??= []).push(t)
    })
  }

  abstract get terminalDefinitions(): TerminalDefinition[]

  get dimensions(): Dimensions {
    return (this.constructor as typeof Part).dimensions
  }

  get maxRatings(): Record<string, number> {
    return (this.constructor as typeof Part).maxRatings
  }

  setError(err: PartError) {
    if (!this.errors.some((e) => e.code === err.code)) this.errors.push(err)
  }

  getVoltageAcross(
    a: string,
    b: string,
    time: number = this.circuit.clock.time,
  ) {
    const va = this.circuit.data.getVoltage(
      String(this.terminalsByName[a].node),
      time,
    )
    const vb = this.circuit.data.getVoltage(
      String(this.terminalsByName[b].node),
      time,
    )
    return va - vb
  }

  // ------------------------------------------------------------ sim lifecycle
  /** Called once when the circuit starts running. */
  start() {}
  /** Called once when the circuit stops. */
  stop() {}
  /** Before the netlist for the next window is generated. */
  beforeSimulate?(): void
  /** After the netlist is generated, before ngspice runs. */
  onSimulate?(): void
  /** After ngspice results have been appended to the data bus. May be async to yield to the UI. */
  afterSimulate?(): void | Promise<void>

  /** SPICE netlist line(s) for this part. Empty string = nothing to emit. */
  toNetlistItem(): string {
    return ''
  }
}
