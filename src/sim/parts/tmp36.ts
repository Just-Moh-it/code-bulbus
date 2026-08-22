import { Part } from '../part'
import type { PartInit } from '../part'
import { tmp36Dimensions, tmp36Terminals } from '../defs'
import { PartType } from '../types'

/**
 * TMP36 analog temperature sensor (TO-92): Vout = 0.5 V + 10 mV/°C.
 * `temperature` (°C) is the ambient the sensor feels; it is adjustable live.
 * Modelled as an ideal source behind a small series resistor.
 */
export class Tmp36 extends Part {
  static type = PartType.Tmp36
  static dimensions = tmp36Dimensions

  declare temperature: number

  protected init(init: PartInit) {
    this.temperature = init.temperature ?? 25
    super.init(init)
  }

  get terminalDefinitions() {
    return tmp36Terminals
  }

  setTemperature(c: number) {
    this.temperature = c
  }

  get deviceId() {
    return `v_${this.id}`
  }

  get outputVoltage() {
    return 0.5 + 0.01 * this.temperature
  }

  toNetlistItem() {
    const t = this.terminalsByName
    return [
      `${this.deviceId} ${this.id}_out ${t.gnd.node} DC ${this.outputVoltage.toFixed(4)}`,
      `r_${this.id}_out ${this.id}_out ${t.vout.node} 100`,
    ].join('\n')
  }
}
