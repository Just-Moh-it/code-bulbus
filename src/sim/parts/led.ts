import { Part } from '../part'
import type { PartInit } from '../part'
import { ledDimensions, ledTerminals } from '../defs'
import { PartType } from '../types'

function mapRange(
  v: number,
  [inLo, inHi]: [number, number],
  [outLo, outHi]: [number, number],
) {
  const t = (v - inLo) / (inHi - inLo)
  const clamped = Math.min(1, Math.max(0, t))
  return outLo + clamped * (outHi - outLo)
}

export class Led extends Part {
  static type = PartType.Led
  static dimensions = ledDimensions
  static maxRatings = { peakForwardCurrent: 0.1 }

  declare color: string

  protected init(init: PartInit) {
    super.init(init)
    this.color = init.color ?? 'red'
    this.circuit.clock.onChange(() => {
      if (
        this.circuit.clock.tick % 30 === 0 &&
        this.amperage > this.maxRatings.peakForwardCurrent
      ) {
        this.setError({
          code: 'PEAK_FORWARD_CURRENT_EXCEEDED',
          message: `LED's measured current, ${this.amperage.toFixed(2)} amps, exceeds its peak forward current rating of ${this.maxRatings.peakForwardCurrent} amps.`,
        })
      }
    })
  }

  get terminalDefinitions() {
    return ledTerminals
  }

  get deviceId() {
    return `d_${this.id}`
  }

  get amperage() {
    return this.circuit.data.getAmperage(this.deviceId, this.circuit.clock.time)
  }

  /** 0..1 brightness, 20 mA = fully lit. */
  get intensity() {
    return mapRange(this.amperage, [0, 0.02], [0, 1])
  }

  toNetlistItem() {
    return [
      `.MODEL led_${this.id} D (IS=1.4e-18 N=1.2 RS=13)`,
      `${this.deviceId} ${this.terminalsByName['+'].node} ${this.terminalsByName['-'].node} led_${this.id}`,
    ].join('\n')
  }
}
