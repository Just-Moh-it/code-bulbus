import type { Part } from './part'
import type { TerminalDefinition, Vec3 } from './types'

export interface TerminalInit extends TerminalDefinition {
  part: Part
  /** Names of terminals on the parent part this terminal is plugged into. */
  connections?: string[]
}

/**
 * A single electrical pin on a part. Terminals resolve to SPICE node numbers
 * via `Circuit.assignNodes()`; connectivity is the union of
 *  - implicit connections: same `group` on the same part (breadboard strips, GND pins)
 *  - explicit connections: plugged into a parent's terminal (wire-end → breadboard hole)
 */
export class Terminal {
  readonly name: string
  readonly label?: string
  readonly group?: string
  readonly part: Part
  readonly position: Vec3
  node: number | null = null
  private explicitConnectionsSet = new Set<Terminal>()

  constructor(init: TerminalInit) {
    this.name = init.name
    this.label = init.label
    this.group = init.group
    this.part = init.part
    this.position = { ...init.position }
    init.connections?.forEach((name) => {
      const parent = this.part.parent
      if (!parent)
        throw new Error(
          `Terminal ${this.id} has connections but part has no parent`,
        )
      const other = parent.terminalsByName[name]
      if (!other)
        throw new Error(
          `Terminal ${this.id} connects to unknown terminal ${parent.id}:${name}`,
        )
      this.addExplicitConnection(other)
      other.addExplicitConnection(this)
    })
  }

  get id() {
    return `${this.part.id}:${this.name}`
  }

  get implicitConnections(): Terminal[] {
    return this.group ? (this.part.terminalsByGroup[this.group] ?? []) : []
  }

  get explicitConnections(): Terminal[] {
    return Array.from(this.explicitConnectionsSet)
  }

  get connections(): Terminal[] {
    return [...this.implicitConnections, ...this.explicitConnections]
  }

  addExplicitConnection(t: Terminal) {
    this.explicitConnectionsSet.add(t)
  }

  /** Every terminal electrically reachable from this one (including itself's neighbours). */
  getReachable(visited: Set<string> = new Set()): Terminal[] {
    visited.add(this.id)
    const out = [...this.connections]
    this.connections.forEach((t) => {
      if (!visited.has(t.id)) out.push(...t.getReachable(visited))
    })
    return Array.from(new Set(out))
  }

  assignNode() {
    const reachable = this.getReachable()
    const known = reachable.find((t) => t.node !== null)
    const node = known ? known.node! : ++this.part.circuit.nodeCounter
    this.node = node
    reachable.forEach((t) => (t.node = node))
  }

  getVoltage(time: number) {
    return this.part.circuit.data.getVoltage(String(this.node), time)
  }

  get currentVoltage() {
    return this.getVoltage(this.part.circuit.clock.time)
  }
}
