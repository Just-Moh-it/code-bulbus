import { Part } from '../part'
import type { PartInit } from '../part'
import { potentiometerDimensions, potentiometerTerminals } from '../defs'
import { PartType } from '../types'

/**
 * Rotary potentiometer: two resistors that share the wiper node.
 * `wiper` (0..1) is the knob angle; it can be changed while a simulation runs and the
 * next window picks it up.
 */
export class Potentiometer extends Part {
  static type = PartType.Potentiometer
  static dimensions = potentiometerDimensions

  declare kohm: number
  declare wiper: number

  protected init(init: PartInit) {
    this.kohm = init.kohm ?? 10
    this.wiper = init.wiper ?? 0.5
    super.init(init)
  }

  get terminalDefinitions() {
    return potentiometerTerminals
  }

  /** Live control from the simulator UI. */
  setWiper(p: number) {
    this.wiper = Math.min(1, Math.max(0, p))
  }

  get deviceId() {
    return `r_${this.id}`
  }

  /** Voltage on the wiper relative to pin 1 (for readouts). */
  get wiperVoltage() {
    return this.getVoltageAcross('wiper', '1')
  }

  toNetlistItem() {
    const t = this.terminalsByName
    const total = this.kohm * 1000
    // never let either half hit 0 Ω (ngspice needs a finite resistor)
    const a = Math.max(1, total * (1 - this.wiper))
    const b = Math.max(1, total * this.wiper)
    return [
      `${this.deviceId}_a ${t['1'].node} ${t.wiper.node} ${a}`,
      `${this.deviceId}_b ${t.wiper.node} ${t['3'].node} ${b}`,
    ].join('\n')
  }
}
