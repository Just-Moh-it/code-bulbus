import { Part } from '../part'
import { motorDimensions, motorTerminals } from '../defs'
import { PartType } from '../types'

/** DC motor modelled as a 10 Ω load; visual speed is 1000 × voltage drop. */
export class Motor extends Part {
  static type = PartType.Motor
  static dimensions = motorDimensions

  get terminalDefinitions() {
    return motorTerminals
  }

  get deviceId() {
    return `r_${this.id}`
  }

  get impedance() {
    return 10
  }

  get voltageDrop() {
    return this.getVoltageAcross('t1', 't2')
  }

  get speed() {
    return 1e3 * this.voltageDrop
  }

  toNetlistItem() {
    return `${this.deviceId} ${this.terminalsByName.t1.node} ${this.terminalsByName.t2.node} ${this.impedance}`
  }
}
