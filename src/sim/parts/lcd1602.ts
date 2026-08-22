import { PinState } from 'avr8js'
import type { AVRIOPort } from 'avr8js'
import { Part } from '../part'
import type { PartInit } from '../part'
import { HD44780 } from '../devices/hd44780'
import { PCF8574 } from '../devices/i2c'
import { ArduinoUno } from './arduino-uno'
import type { ArduinoPin } from '../avr/runner'
import type { Terminal } from '../terminal'
import type { Circuit } from '../circuit'
import {
  lcd1602Dimensions,
  lcd1602I2cDimensions,
  lcd1602I2cTerminals,
  lcd1602Terminals,
} from '../defs'
import { PartType } from '../types'

const BACKLIGHT_THRESHOLD_V = 2.5

/**
 * Every SPICE node electrically tied to `node`: wires are 6 mΩ resistors in the
 * netlist, so the two ends of a wire are *different* nodes. Walk across them.
 */
function netOf(circuit: Circuit, node: number): Set<number> {
  const net = new Set<number>([node])
  let grew = true
  while (grew) {
    grew = false
    for (const w of circuit.wires) {
      const a = w.partOne.terminalsByName.t1.node
      const b = w.partTwo.terminalsByName.t1.node
      if (a === null || b === null) continue
      if (net.has(a) && !net.has(b)) {
        net.add(b)
        grew = true
      } else if (net.has(b) && !net.has(a)) {
        net.add(a)
        grew = true
      }
    }
  }
  return net
}

/** Arduino terminals on the same net as `term` (across wires). */
function arduinoTerminalsOnNet(
  term: Terminal,
): { uno: ArduinoUno; terminal: Terminal }[] {
  if (term.node === null) return []
  const net = netOf(term.part.circuit, term.node)
  const out: { uno: ArduinoUno; terminal: Terminal }[] = []
  for (const p of term.part.circuit.parts) {
    if (!(p instanceof ArduinoUno)) continue
    for (const t of p.terminals)
      if (t.node !== null && net.has(t.node)) out.push({ uno: p, terminal: t })
  }
  return out
}

/**
 * Digital-world coupling: the avr8js pin electrically connected to a terminal.
 * Arduino terminals are named after the pins (`'2'`, `'~13'`, `'a4'`).
 */
function arduinoPinFor(
  term: Terminal,
): { uno: ArduinoUno; pin: ArduinoPin } | null {
  if (term.node === 0) return null
  for (const { uno, terminal } of arduinoTerminalsOnNet(term)) {
    const pin = uno.simulator.pinsByName[terminal.name]
    if (pin) return { uno, pin }
  }
  return null
}

function arduinoOnNet(term: Terminal): ArduinoUno | null {
  return arduinoTerminalsOnNet(term)[0]?.uno ?? null
}

/** True if the net reaches something that can drive it (an Arduino or battery terminal). */
function netHasSource(term: Terminal): boolean {
  if (term.node === null) return false
  const net = netOf(term.part.circuit, term.node)
  return term.part.circuit.parts.some(
    (p) =>
      (p.type === PartType.ArduinoUno || p.type === PartType.Battery) &&
      p.terminals.some((t) => t.node !== null && net.has(t.node)),
  )
}

abstract class LcdBase extends Part {
  readonly lcd = new HD44780()
  private disposers: (() => void)[] = []

  /** Backlight: lit if the anode net is above ~2.5 V, or left unwired (friendly default). */
  protected updateBacklight(anode: Terminal | undefined) {
    if (!anode) return
    const wired = netHasSource(anode)
    const v = this.circuit.data.getVoltage(
      String(anode.node),
      this.circuit.data.latestTime,
    )
    const on = !wired || v > BACKLIGHT_THRESHOLD_V
    if (on !== this.lcd.backlight) {
      this.lcd.backlight = on
      this.lcd.version++
    }
  }

  protected track(d: () => void) {
    this.disposers.push(d)
  }

  stop() {
    this.disposers.forEach((d) => d())
    this.disposers = []
  }

  get snapshot() {
    return this.lcd.snapshot()
  }
}

/** 16-pin parallel HD44780 module driven in 4-bit mode (LiquidCrystal). */
export class Lcd1602 extends LcdBase {
  static type = PartType.Lcd1602
  static dimensions = lcd1602Dimensions
  /** Diagnostics: which Arduino pins were found and how many E strobes were seen. */
  readonly debug = { pins: {} as Record<string, string | null>, strobes: 0 }

  get terminalDefinitions() {
    return lcd1602Terminals
  }

  /** Hook the E/RS/D4–D7 nets to avr8js ports; latch a nibble on every E falling edge. */
  start() {
    const t = this.terminalsByName
    const e = arduinoPinFor(t.E)
    const rs = arduinoPinFor(t.RS)
    const data = (['D4', 'D5', 'D6', 'D7'] as const).map((n) =>
      arduinoPinFor(t[n]),
    )
    const d0 = (['D0', 'D1', 'D2', 'D3'] as const).map((n) =>
      arduinoPinFor(t[n]),
    )
    this.debug.pins = {
      E: e?.pin.name ?? null,
      RS: rs?.pin.name ?? null,
      D4: data[0]?.pin.name ?? null,
      D7: data[3]?.pin.name ?? null,
    }
    if (!e || !rs) return
    const eightBit = d0.every(Boolean) && data.every(Boolean)
    const read = (p: { pin: ArduinoPin } | null) =>
      !!p && p.pin.port.pinState(p.pin.portIndex) === PinState.High

    let lastE = read(e)
    const onPort = () => {
      const now = read(e)
      if (lastE && !now) {
        this.debug.strobes++
        const rsHigh = read(rs)
        const hi = data.reduce((acc, p, i) => acc | (read(p) ? 1 << i : 0), 0)
        if (eightBit) {
          const lo = d0.reduce((acc, p, i) => acc | (read(p) ? 1 << i : 0), 0)
          this.lcd.write(rsHigh, (hi << 4) | lo)
        } else {
          this.lcd.writeNibble(rsHigh, hi)
        }
      }
      lastE = now
    }
    this.track(listen(e.pin.port, onPort))
  }

  afterSimulate() {
    this.updateBacklight(this.terminalsByName.A)
  }
}

/** PCF8574 "backpack" variant on the TWI bus (LiquidCrystal_I2C). */
export class Lcd1602I2c extends LcdBase {
  static type = PartType.Lcd1602I2c
  static dimensions = lcd1602I2cDimensions
  declare address: number
  readonly expander = new PCF8574()

  protected init(init: PartInit) {
    this.address = init.i2cAddress ?? 0x27
    super.init(init)
  }

  get terminalDefinitions() {
    return lcd1602I2cTerminals
  }

  start() {
    const t = this.terminalsByName
    // SDA/SCL are A4/A5 on the Uno; accept either header.
    const uno = arduinoOnNet(t.SDA) ?? arduinoOnNet(t.SCL)
    if (!uno) return
    this.track(uno.simulator.i2c.attach(this.address, this.expander))
    let lastE = false
    this.track(
      this.expander.onChange((value) => {
        const backlight = (value & 0x08) !== 0
        if (backlight !== this.lcd.backlight) {
          this.lcd.backlight = backlight
          this.lcd.version++
        }
        const e = (value & 0x04) !== 0
        if (lastE && !e) this.lcd.writeNibble((value & 0x01) !== 0, value >> 4)
        lastE = e
      }),
    )
  }
}

function listen(port: AVRIOPort, fn: () => void) {
  port.addListener(fn)
  return () => port.removeListener(fn)
}
