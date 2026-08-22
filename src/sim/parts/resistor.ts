import { Part } from '../part'
import type { PartInit } from '../part'
import { resistorDimensions, resistorTerminals } from '../defs'
import { PartType } from '../types'

export class Resistor extends Part {
  static type = PartType.Resistor
  static dimensions = resistorDimensions
  static maxRatings = { power: 0.5 }

  declare kohm: number

  protected init(init: PartInit) {
    super.init(init)
    this.kohm = init.kohm ?? 1
    this.circuit.clock.onChange(() => {
      if (this.circuit.clock.tick % 30 !== 0) return
      const p = this.power
      if (p > this.maxRatings.power) {
        this.setError({
          code: 'POWER_RATING_EXCEEDED',
          message: `Resistor's measured power, ${p.toFixed(2)} watts, exceeds its power rating of ${this.maxRatings.power} watts.`,
        })
      }
    })
  }

  get terminalDefinitions() {
    return resistorTerminals
  }

  get deviceId() {
    return `r_${this.id}`
  }

  get resistance() {
    return 1e3 * this.kohm
  }

  get voltageDrop() {
    return this.getVoltageAcross('t1', 't2')
  }

  get power() {
    return this.voltageDrop ** 2 / this.resistance
  }

  toNetlistItem() {
    return `${this.deviceId} ${this.terminalsByName.t1.node} ${this.terminalsByName.t2.node} ${this.kohm}k`
  }
}
