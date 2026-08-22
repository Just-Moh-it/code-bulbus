import { Part } from '../part'
import type { PartInit } from '../part'
import { batteryDimensions, batteryTerminals } from '../defs'
import { PartType } from '../types'

export class Battery extends Part {
  static type = PartType.Battery
  static dimensions = batteryDimensions
  static maxRatings = { current: 50 }

  declare voltage: number

  protected init(init: PartInit) {
    super.init(init)
    this.voltage = init.voltage ?? 9
    // battery negative is the circuit's ground reference
    this.terminalsByName['-'].node = 0
    this.circuit.clock.onChange(() => {
      if (
        this.circuit.clock.tick % 30 === 0 &&
        Math.abs(this.amperage) > this.maxRatings.current
      ) {
        this.setError({
          code: 'SHORT_CIRCUIT',
          message: `Battery's measured current, ${this.amperage.toFixed(2)} amps, indicates that you may have a short circuit.`,
        })
      }
    })
  }

  get terminalDefinitions() {
    return batteryTerminals
  }

  get deviceId() {
    return `v_${this.id}`
  }

  get amperage() {
    return this.circuit.data.getAmperage(this.deviceId, this.circuit.clock.time)
  }

  toNetlistItem() {
    return `${this.deviceId} ${this.terminalsByName['+'].node} ${this.terminalsByName['-'].node} ${this.voltage}v`
  }
}
