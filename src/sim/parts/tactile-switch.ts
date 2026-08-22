import { Part } from '../part'
import type { PartInit } from '../part'
import { Sampler } from '../clock'
import { tactileSwitchDimensions, tactileSwitchTerminals } from '../defs'
import { PartType } from '../types'

/**
 * Momentary (or latching) push button. User presses are sampled between
 * windows and replayed into SPICE as a PWL-driven voltage-controlled switch.
 */
export class TactileSwitch extends Part {
  static type = PartType.TactileSwitch
  static dimensions = tactileSwitchDimensions

  declare latching: boolean
  declare pressed: boolean
  declare samplers: { pressed: Sampler<boolean> }

  protected init(init: PartInit) {
    super.init(init)
    this.latching = init.latching ?? false
    this.pressed = false
    this.samplers = { pressed: new Sampler<boolean>() }
    this.samplers.pressed.setCollector(() => this.pressed)
  }

  /** UI hook: update press state. Latching switches toggle on press. */
  press() {
    this.pressed = this.latching ? !this.pressed : true
  }
  release() {
    if (!this.latching) this.pressed = false
  }
  setPressed(v: boolean) {
    this.pressed = v
  }

  get terminalDefinitions() {
    return tactileSwitchTerminals
  }

  get modelId() {
    return `switch_${this.id}`
  }

  get model() {
    return `.model ${this.modelId} sw vt=0.5 vh=0 ron=1 roff=1.0e24`
  }

  get voltageSrc() {
    const s = this.samplers.pressed
    const points = s
      .resampled(this.circuit.simDuration)
      .map((t, i) => `(${t}ms ${s.samples[i] ? 1 : 0})`)
    const pwl = points.length ? `PWL (${points.join(' ')})` : 'PWL (0 0)'
    return `v_${this.id} v_${this.id}_positive 0 DC ${pwl}`
  }

  onSimulate() {
    this.samplers.pressed.flush()
  }

  start() {
    Object.values(this.samplers).forEach((s) => s.start())
  }

  stop() {
    Object.values(this.samplers).forEach((s) => s.stop())
  }

  toNetlistItem() {
    return [
      this.model,
      this.voltageSrc,
      `S_${this.id} ${this.terminalsByName['1'].node} ${this.terminalsByName['3'].node} v_${this.id}_positive 0 ${this.modelId} OFF`,
    ].join('\n')
  }
}
