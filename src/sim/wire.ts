import type { Circuit } from './circuit'
import type { Part } from './part'
import type { WireJSON } from './types'

/** A wire joins two `wire-end` parts; electrically it is a tiny resistor. */
export class Wire {
  static impedance = 0.006

  readonly id: string
  readonly color: string
  readonly height: number
  readonly showCurrents: boolean
  readonly circuit: Circuit
  readonly partOne: Part
  readonly partTwo: Part

  constructor(init: WireJSON & { circuit: Circuit }) {
    this.id = init.id
    this.color = init.color
    this.height = init.height ?? 2
    this.showCurrents = init.showCurrents ?? false
    this.circuit = init.circuit
    this.partOne = init.circuit.getPartById(init.partOneId)
    this.partTwo = init.circuit.getPartById(init.partTwoId)
    if (!this.partOne || !this.partTwo)
      throw new Error(`Wire ${this.id} references a missing wire-end`)
  }

  get impedance() {
    return (this.constructor as typeof Wire).impedance
  }

  get deviceId() {
    return `r_${this.id}`
  }

  get amperage() {
    return this.circuit.data.getAmperage(this.deviceId, this.circuit.clock.time)
  }

  toNetlistItem() {
    return `${this.deviceId} ${this.partOne.terminalsByName.t1.node} ${this.partTwo.terminalsByName.t1.node} ${this.impedance}`
  }
}
