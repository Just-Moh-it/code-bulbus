import { Part } from '../part'
import type { PartInit } from '../part'
import { Terminal } from '../terminal'
import type { TerminalInit } from '../terminal'
import { arduinoUnoDimensions, arduinoUnoTerminals } from '../defs'
import { ArduinoRunner } from '../avr/runner'
import { PartType } from '../types'

const MAX_PWL_POINTS = 8
const yieldToEventLoop = () => new Promise<void>((r) => setTimeout(r, 0))

/** Records (time, voltage) points for a pin between sim windows. */
class PinSampler {
  times: number[] = []
  samples: number[] = []
  addSample(time: number, voltage: number) {
    this.times.push(time)
    this.samples.push(voltage)
  }
  flush() {
    this.times = []
    this.samples = []
  }
}

/** Terminal that bridges a header pin to its avr8js pin. */
export class ArduinoTerminal extends Terminal {
  readonly sampler = new PinSampler()
  declare part: ArduinoUno

  constructor(init: TerminalInit) {
    super(init)
    this.simulatorPin?.onOutput(({ time, voltage }) =>
      this.sampler.addSample(time, voltage),
    )
  }

  get simulatorPin() {
    return this.part.simulator.pinsByName[this.name]
  }

  collectSample() {
    const pin = this.simulatorPin
    if (pin && pin.isOutputMode() && pin.outputVoltage !== undefined) {
      this.sampler.addSample(
        this.part.simulator.milliseconds - this.part.simStartTime,
        pin.outputVoltage,
      )
    }
  }

  setSimulatorInput(voltage: number) {
    this.simulatorPin?.setInput(voltage)
  }

  /**
   * A piecewise-linear voltage source reproducing this pin's output over the window.
   * ngspice steps at 16.67 ms, so it cannot resolve faster toggling (LCD strobes,
   * bit-banged buses) — every extra breakpoint only forces tiny timesteps and stalls
   * the main thread. Keep at most MAX_PWL_POINTS evenly spaced samples (always the last).
   */
  get voltageSrc() {
    const { times, samples } = this.sampler
    if (samples.length === 0) return ''
    const idx: number[] = []
    if (times.length <= MAX_PWL_POINTS) {
      for (let i = 0; i < times.length; i++) idx.push(i)
    } else {
      for (let k = 0; k < MAX_PWL_POINTS; k++)
        idx.push(Math.round((k * (times.length - 1)) / (MAX_PWL_POINTS - 1)))
    }
    const points = idx.map((i) => `(${times[i]}ms ${samples[i] ?? 0})`)
    return `v_${this.id} ${this.node} ${this.part.terminalsByName['gnd.1'].node} DC PWL (${points.join(' ')})`
  }
}

export class ArduinoUno extends Part {
  static type = PartType.ArduinoUno
  static dimensions = arduinoUnoDimensions
  static maxRatings = { current: 50 }
  static Terminal = ArduinoTerminal

  declare terminals: ArduinoTerminal[]
  declare simulator: ArduinoRunner
  declare simStartTime: number
  declare logs: string
  declare hexFile: string

  protected init(init: PartInit) {
    this.simStartTime = 0
    this.logs = ''
    this.hexFile = init.hexFile ?? ''
    this.simulator = new ArduinoRunner(this.hexFile)
    super.init(init)
    this.simulator.onByteTransmit((b) => {
      this.logs += String.fromCharCode(b)
    })
  }

  get terminalDefinitions() {
    return arduinoUnoTerminals
  }

  get deviceId() {
    return `v_${this.id}`
  }

  get amperage() {
    return this.circuit.data.getAmperage(this.deviceId, this.circuit.clock.time)
  }

  get onboardLedIntensity() {
    return this.getVoltageAcross('~13', 'gnd.1') / 5
  }

  get voltageSources() {
    return this.terminals.map((t) => t.voltageSrc)
  }

  /** Push circuit node voltages (at sim time `t`) into the MCU's input pins. */
  syncSimulatorInputs(t: number) {
    this.terminals.forEach((term) => term.setSimulatorInput(term.getVoltage(t)))
  }

  onSimulate() {
    this.terminals.forEach((t) => {
      t.sampler.flush()
      t.collectSample()
    })
  }

  /**
   * Advance the MCU by one window (50 ms) in 16.667 ms slices, feeding inputs as we go.
   * Yields to the event loop between slices so the browser can paint; the engine's
   * 50 ms pace leaves room for it and headless runs are unaffected.
   */
  async afterSimulate() {
    this.simStartTime = this.simulator.milliseconds
    const { simDuration } = this.circuit
    for (let t = 0; t < simDuration; t += 16.667) {
      this.syncSimulatorInputs(this.circuit.data.latestTime - simDuration + t)
      this.simulator.runFor(16.667)
      if (t + 16.667 < simDuration) await yieldToEventLoop()
    }
  }

  toNetlistItem() {
    const gnd = this.terminalsByName['gnd.1'].node
    return [
      `${this.deviceId} ${this.terminalsByName['3.3v'].node} ${gnd} 3.3v`,
      `${this.deviceId}-1 ${this.terminalsByName['5v'].node} ${gnd} 5v`,
      `${this.deviceId}-2 ${this.terminalsByName.ioref.node} ${gnd} 5v`,
      ...this.voltageSources.filter(Boolean),
    ].join('\n')
  }
}
