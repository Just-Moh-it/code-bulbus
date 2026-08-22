import { Part } from '../part'
import type { PartInit } from '../part'
import { eightPinChipDimensions, eightPinChipTerminals } from '../defs'
import { PartType } from '../types'

/** Generic DIP-8 whose behaviour is a user-supplied `.subckt` body over pins 1..8. */
export class EightPinChip extends Part {
  static type = PartType.EightPinChip
  static dimensions = eightPinChipDimensions

  declare pinLabels: Record<string, string>
  declare subcktCode: string
  declare chipName: string

  protected init(init: PartInit) {
    this.pinLabels = init.pinLabels ?? {}
    this.subcktCode = init.subcktCode ?? ''
    this.chipName = init.chipName ?? ''
    super.init(init)
  }

  get terminalDefinitions() {
    return eightPinChipTerminals.map((t) => ({
      ...t,
      label: this.pinLabels[t.name] || t.label,
    }))
  }

  get deviceId() {
    return `x_${this.id}`
  }

  get subcktId() {
    return `subckt-${this.id}`
  }

  get subcktDefinition() {
    return [
      `.subckt ${this.subcktId} 1 2 3 4 5 6 7 8`,
      this.subcktCode,
      `.ends ${this.subcktId}`,
    ].join('\n')
  }

  toNetlistItem() {
    const pins = ['1', '2', '3', '4', '5', '6', '7', '8']
      .map((n) => this.terminalsByName[n].node)
      .join(' ')
    return [
      this.subcktDefinition,
      `${this.deviceId} ${pins} ${this.subcktId}`,
    ].join('\n')
  }
}
