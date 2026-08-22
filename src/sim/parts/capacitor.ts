import { Part } from '../part'
import type { PartInit } from '../part'
import { capacitorDimensions, capacitorTerminals } from '../defs'
import { PartType } from '../types'

export class Capacitor extends Part {
  static type = PartType.Capacitor
  static dimensions = capacitorDimensions
  static maxRatings = { voltage: 25 }

  /** SPICE value string, e.g. "10u". */
  declare capacitance: string | number

  protected init(init: PartInit) {
    super.init(init)
    this.capacitance = init.capacitance ?? '10u'
    this.circuit.clock.onChange(() => {
      if (this.circuit.clock.tick % 30 !== 0) return
      const v = this.getVoltageAcross('anode', 'cathode')
      if (Math.abs(v) > this.maxRatings.voltage) {
        this.setError({
          code: 'VOLTAGE_RATING_EXCEEDED',
          message: `Capacitors's measured voltage, ${v.toFixed(2)} volts, exceeds its voltage rating of ${this.maxRatings.voltage} volts.`,
        })
      }
    })
  }

  get terminalDefinitions() {
    return capacitorTerminals
  }

  get deviceId() {
    return `C_${this.id}`
  }

  toNetlistItem() {
    return `${this.deviceId} ${this.terminalsByName.anode.node} ${this.terminalsByName.cathode.node} ${this.capacitance}`
  }
}
