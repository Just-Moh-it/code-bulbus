import {
  AVRADC,
  AVRIOPort,
  AVRTWI,
  AVRTimer,
  AVRUSART,
  CPU,
  PinState,
  adcConfig,
  avrInstruction,
  portBConfig,
  portCConfig,
  portDConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
} from 'avr8js'
import { I2CBus } from '../devices/i2c'

export const AVR_CLOCK_HZ = 16e6

/** Parse an Intel HEX string into program memory. */
export function loadHex(source: string, target: Uint8Array) {
  for (const line of source.split('\n')) {
    if (line[0] === ':' && line.substr(7, 2) === '00') {
      const bytes = parseInt(line.substr(1, 2), 16)
      const addr = parseInt(line.substr(3, 4), 16)
      for (let i = 0; i < bytes; i++) {
        target[addr + i] = parseInt(line.substr(9 + i * 2, 2), 16)
      }
    }
  }
}

export interface RunInfo {
  cyclesAtStart: number
  cyclesToRun: number
}

export interface PinOutput {
  voltage: number
  time: number
}

interface PinInit {
  name: string
  isPwm: boolean
  port: AVRIOPort
  portIndex: number
  simulator: ArduinoRunner
}

/**
 * One header pin on the board. Tracks the AVR pin state and exposes an
 * output voltage (0/5 V, or a PWM duty-cycle average) for the SPICE side.
 */
export class ArduinoPin {
  readonly name: string
  readonly isPwm: boolean
  readonly port: AVRIOPort
  readonly portIndex: number
  readonly simulator: ArduinoRunner
  state: PinState
  outputVoltage: number | undefined = undefined
  private highCycleRanges: { start: number; stop?: number }[] = []
  private currentHighRange: { start: number; stop?: number } | null = null
  private outputListeners = new Set<(o: PinOutput) => void>()

  constructor(init: PinInit) {
    this.name = init.name
    this.isPwm = init.isPwm
    this.port = init.port
    this.portIndex = init.portIndex
    this.simulator = init.simulator
    this.state = this.port.pinState(this.portIndex)
    this.port.addListener(() => {
      const next = this.port.pinState(this.portIndex)
      if (next === this.state) return
      if (this.isPwm) {
        if (next !== PinState.High && this.currentHighRange) {
          this.currentHighRange.stop = this.simulator.cpu.cycles
          this.highCycleRanges.push(this.currentHighRange)
          this.currentHighRange = null
        }
        if (next === PinState.High)
          this.currentHighRange = { start: this.simulator.cpu.cycles }
      } else {
        this.setOutputVoltage(
          next === PinState.High ? 5 : next === PinState.Low ? 0 : undefined,
        )
      }
      this.state = next
    })
  }

  onRunStart(_info: RunInfo) {
    if (this.isPwm && this.state === PinState.High) {
      this.currentHighRange = { start: this.simulator.cpu.cycles }
    }
  }

  onRunEnd(info: RunInfo) {
    if (!this.isPwm) return
    if (this.currentHighRange) {
      this.currentHighRange.stop = this.simulator.cpu.cycles
      this.highCycleRanges.push(this.currentHighRange)
      this.currentHighRange = null
    }
    const high = this.highCycleRanges.reduce(
      (acc, r) => acc + ((r.stop ?? 0) - r.start),
      0,
    )
    this.highCycleRanges = []
    this.setOutputVoltage((high / info.cyclesToRun) * 5)
  }

  isInputMode() {
    return this.state > 1
  }

  isOutputMode() {
    return this.state <= 1
  }

  setOutputVoltage(v: number | undefined) {
    const changed = v !== this.outputVoltage
    this.outputVoltage = v
    if (changed) this.emitOutput()
  }

  private emitOutput() {
    if (this.isOutputMode() && this.outputVoltage !== undefined) {
      const out = {
        voltage: this.outputVoltage,
        time: (this.simulator.cpu.cycles / AVR_CLOCK_HZ) * 1e3,
      }
      this.outputListeners.forEach((l) => l(out))
    }
  }

  /** Fires whenever the pin's driven output voltage changes. Returns a disposer. */
  onOutput(fn: (o: PinOutput) => void) {
    this.outputListeners.add(fn)
    return () => {
      this.outputListeners.delete(fn)
    }
  }

  /** Feed the circuit's node voltage back into the MCU. */
  setInput(_voltage: number) {}
}

export class DigitalPin extends ArduinoPin {
  setInput(voltage: number) {
    this.port.setPin(this.portIndex, voltage > 0.45)
  }
}

export class AnalogPin extends ArduinoPin {
  setInput(voltage: number) {
    this.simulator.adc.channelValues[this.portIndex] = voltage
  }
}

/**
 * ATmega328p (Arduino Uno) emulator built on avr8js. Runs in wall-clock-sized
 * slices so it can interleave with the SPICE solver.
 */
export class ArduinoRunner {
  readonly program = new Uint16Array(32768)
  readonly cpu: CPU
  readonly adc: AVRADC
  readonly portB: AVRIOPort
  readonly portC: AVRIOPort
  readonly portD: AVRIOPort
  readonly timer0: AVRTimer
  readonly timer1: AVRTimer
  readonly timer2: AVRTimer
  readonly usart: AVRUSART
  readonly twi: AVRTWI
  /** I²C devices attach here by 7-bit address (SDA = A4, SCL = A5). */
  readonly i2c: I2CBus
  readonly pins: ArduinoPin[]
  readonly pinsByName: Record<string, ArduinoPin>
  private byteListeners = new Set<(b: number) => void>()

  constructor(hex: string) {
    loadHex(hex, new Uint8Array(this.program.buffer))
    this.cpu = new CPU(this.program)
    this.adc = new AVRADC(this.cpu, adcConfig)
    this.portB = new AVRIOPort(this.cpu, portBConfig)
    this.portC = new AVRIOPort(this.cpu, portCConfig)
    this.portD = new AVRIOPort(this.cpu, portDConfig)
    this.timer0 = new AVRTimer(this.cpu, timer0Config)
    this.timer1 = new AVRTimer(this.cpu, timer1Config)
    this.timer2 = new AVRTimer(this.cpu, timer2Config)
    this.usart = new AVRUSART(this.cpu, usart0Config, AVR_CLOCK_HZ)
    this.twi = new AVRTWI(this.cpu, twiConfig, AVR_CLOCK_HZ)
    this.i2c = new I2CBus(this.twi)
    this.twi.eventHandler = this.i2c

    const d = (
      name: string,
      isPwm: boolean,
      port: AVRIOPort,
      portIndex: number,
    ) => new DigitalPin({ name, isPwm, port, portIndex, simulator: this })
    const a = (name: string, portIndex: number) =>
      new AnalogPin({
        name,
        isPwm: false,
        port: this.portC,
        portIndex,
        simulator: this,
      })

    this.pins = [
      d('rx1<-0', false, this.portD, 0),
      d('tx1->1', false, this.portD, 1),
      d('2', false, this.portD, 2),
      d('~3', true, this.portD, 3),
      d('4', false, this.portD, 4),
      d('~5', true, this.portD, 5),
      d('~6', true, this.portD, 6),
      d('7', false, this.portD, 7),
      d('8', false, this.portB, 0),
      d('~9', true, this.portB, 1),
      d('~10', true, this.portB, 2),
      d('~11', true, this.portB, 3),
      d('12', false, this.portB, 4),
      d('~13', true, this.portB, 5),
      a('a0', 0),
      a('a1', 1),
      a('a2', 2),
      a('a3', 3),
      a('a4', 4),
      a('a5', 5),
    ]
    this.pinsByName = Object.fromEntries(this.pins.map((p) => [p.name, p]))
    this.usart.onByteTransmit = (b) => this.byteListeners.forEach((l) => l(b))
  }

  /** Execute `ms` milliseconds of MCU time. */
  runFor(ms: number) {
    const cyclesAtStart = this.cpu.cycles
    const cyclesToRun = (AVR_CLOCK_HZ * ms) / 1e3
    const target = cyclesAtStart + cyclesToRun
    const info = { cyclesAtStart, cyclesToRun }
    this.pins.forEach((p) => p.onRunStart(info))
    while (this.cpu.cycles <= target) {
      avrInstruction(this.cpu)
      this.cpu.tick()
    }
    this.pins.forEach((p) => p.onRunEnd(info))
  }

  /** Serial output (Serial.print). Returns a disposer. */
  onByteTransmit(fn: (b: number) => void) {
    this.byteListeners.add(fn)
    return () => {
      this.byteListeners.delete(fn)
    }
  }

  get milliseconds() {
    return (this.cpu.cycles / AVR_CLOCK_HZ) * 1e3
  }
}
