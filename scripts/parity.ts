/**
 * Parity checks for every simulated part + behaviour, run headlessly.
 *   bun scripts/parity.ts            # all cases
 *   bun scripts/parity.ts 555 pwm    # subset
 */
import { Circuit } from '#/sim'
import type {
  ArduinoUno,
  Capacitor,
  CircuitJSON,
  Lcd1602,
  Lcd1602I2c,
  Led,
  Motor,
  PartJSON,
  TactileSwitch,
  WireJSON,
} from '#/sim'
import { compileSketch } from '#/server/compile'

const keepalive = setInterval(() => {}, 1000)
const o = { x: 0, y: 0, z: 0 }
let n = 0
const uid = (p: string) => `${p}${++n}`

/** Tiny DSL: part(type, parent, {terminal: parentTerminal}, extra) + wire(a, b). */
function part(
  type: PartJSON['type'],
  parentId: string | null,
  conn: Record<string, string> = {},
  extra: Partial<PartJSON> = {},
): PartJSON {
  return {
    id: extra.id ?? uid(type),
    type,
    parentId,
    position: o,
    rotation: 0,
    terminals: Object.entries(conn).map(([name, to]) => ({
      name,
      connections: [to],
    })),
    ...extra,
  }
}
/** A wire between terminal `a` of part A and `b` of part B, via two wire-ends. */
function wire(
  parts: PartJSON[],
  wires: WireJSON[],
  aPart: string,
  aTerm: string,
  bPart: string,
  bTerm: string,
) {
  const wa = part('wire-end', aPart, { t1: aTerm })
  const wb = part('wire-end', bPart, { t1: bTerm })
  parts.push(wa, wb)
  wires.push({ id: uid('w'), color: 'Red', partOneId: wa.id, partTwoId: wb.id })
}

async function run(
  json: CircuitJSON,
  windows: number,
  each: (c: Circuit, i: number) => void,
) {
  const circuit = new Circuit(json, {
    onError: (m) => console.log('   spice error:', m),
    onWarning: (m) => console.log('   spice warning:', m),
  })
  let i = 0
  circuit.events.onWindow = (c) => {
    i++
    each(c, i)
    if (i >= windows) c.stop()
  }
  await circuit.start()
  return circuit
}

const v = (c: Circuit, p: PartJSON | string, term: string) => {
  const id = typeof p === 'string' ? p : p.id
  return c.data.getVoltage(
    String(c.partsById[id].terminalsByName[term].node),
    c.data.latestTime,
  )
}
const mA = (c: Circuit, p: PartJSON) =>
  c.data.getAmperage((c.partsById[p.id] as Led).deviceId, c.data.latestTime) *
  1e3
const fmt = (x: number) => x.toFixed(2).padStart(7)
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok })
  console.log(`${ok ? '✅' : '❌'} ${name}  ${detail}`)
}
const results: { name: string; ok: boolean }[] = []

async function hexFor(sketch: string) {
  const r = await compileSketch({
    'main.ino': { content: sketch, fileExtension: '.ino', order: 0 },
  })
  if (!r.data) throw new Error('compile failed: ' + r.stderr)
  return r.data
}

const cases: Record<string, () => Promise<void>> = {
  // ---------------------------------------------------------------- battery
  async battery() {
    console.log('\n# battery 9V → 1k → LED (battery-grounded circuit)')
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const bat = part('battery', null, {}, { voltage: 9 })
    const r = part('resistor', bb.id, { t1: 'E.1', t2: 'E.5' }, { kohm: 1 })
    const led = part('led', bb.id, { '+': 'D.5', '-': 'D.9' })
    parts.push(bb, bat, r, led)
    wire(parts, wires, bat.id, '+', bb.id, 'A.1')
    wire(parts, wires, bb.id, 'A.9', bat.id, '-')
    let last = 0
    await run({ parts, wires }, 4, (c) => (last = mA(c, led)))
    check('battery LED current ≈ 7 mA', last > 6 && last < 8, `${fmt(last)} mA`)
  },
  // ------------------------------------------------------------- transistor
  async npn() {
    console.log('\n# NPN 2N2222 low-side switch driven by pin 13 (150ms blink)')
    const hex = await hexFor(
      'void setup(){pinMode(13,OUTPUT);} void loop(){digitalWrite(13,HIGH);delay(150);digitalWrite(13,LOW);delay(150);}',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const uno = part('arduino-uno', null, {}, { hexFile: hex })
    const rb = part('resistor', bb.id, { t1: 'E.1', t2: 'E.5' }, { kohm: 1 })
    const q = part(
      'npn-transistor',
      bb.id,
      { collector: 'D.10', base: 'D.5', emitter: 'D.15' },
      { model: '2N2222' },
    )
    const rc = part(
      'resistor',
      bb.id,
      { t1: 'E.20', t2: 'E.25' },
      { kohm: 0.22 },
    )
    const led = part('led', bb.id, { '+': 'D.25', '-': 'D.10' })
    parts.push(bb, uno, rb, q, rc, led)
    wire(parts, wires, uno.id, '~13', bb.id, 'A.1')
    wire(parts, wires, uno.id, '5v', bb.id, 'A.20')
    wire(parts, wires, bb.id, 'A.15', uno.id, 'gnd.2')
    const seen: number[] = []
    await run({ parts, wires }, 10, (c) => seen.push(mA(c, led)))
    const on = Math.max(...seen)
    const off = Math.min(...seen)
    check(
      'NPN switches LED on/off',
      on > 10 && off < 0.5,
      `max ${fmt(on)} mA, min ${fmt(off)} mA`,
    )
  },
  async pnp() {
    console.log('\n# PNP 2N3906 high-side: base pulled low through 1k → LED on')
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const bat = part('battery', null, {}, { voltage: 5 })
    // 2N3906 pin order is emitter, base, collector
    const q = part(
      'pnp-transistor',
      bb.id,
      { emitter: 'D.1', base: 'D.5', collector: 'D.10' },
      { model: '2N3906' },
    )
    const rb = part('resistor', bb.id, { t1: 'E.5', t2: 'E.30' }, { kohm: 1 })
    const rc = part(
      'resistor',
      bb.id,
      { t1: 'E.10', t2: 'E.15' },
      { kohm: 0.22 },
    )
    const led = part('led', bb.id, { '+': 'D.15', '-': 'D.30' })
    parts.push(bb, bat, q, rb, rc, led)
    wire(parts, wires, bat.id, '+', bb.id, 'A.1')
    wire(parts, wires, bb.id, 'A.30', bat.id, '-')
    let last = 0
    await run({ parts, wires }, 4, (c) => (last = mA(c, led)))
    check('PNP conducts, LED lit', last > 5, `${fmt(last)} mA`)
  },
  // -------------------------------------------------------------- capacitor
  async capacitor() {
    console.log(
      '\n# RC charge 5V → 10k → 100u (τ = 1 s); .ic continuity across windows',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const bat = part('battery', null, {}, { voltage: 5 })
    const r = part('resistor', bb.id, { t1: 'E.1', t2: 'E.5' }, { kohm: 10 })
    const cap = part(
      'capacitor',
      bb.id,
      { anode: 'D.5', cathode: 'D.9' },
      { capacitance: '100u' },
    )
    parts.push(bb, bat, r, cap)
    wire(parts, wires, bat.id, '+', bb.id, 'A.1')
    wire(parts, wires, bb.id, 'A.9', bat.id, '-')
    const vs: number[] = []
    await run({ parts, wires }, 10, (c) =>
      vs.push(
        (c.partsById[cap.id] as Capacitor).getVoltageAcross(
          'anode',
          'cathode',
          c.data.latestTime,
        ),
      ),
    )
    // First window has no `uic`, so ngspice's DC operating point starts the cap fully charged
    // (identical to the reference); `.ic` then carries that state window to window.
    const steady = vs.every((x) => Math.abs(x - 5) < 0.05)
    check(
      'capacitor holds DC-op state across windows (.ic continuity)',
      steady,
      `${vs.map((x) => x.toFixed(2)).join(' ')}`,
    )
  },
  // -------------------------------------------------------------------- 555
  async '555'() {
    console.log(
      '\n# 555 astable (R1 1k, R2 4.7k, C 10u → ~14 Hz) with LED on output',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const bat = part('battery', null, {}, { voltage: 9 })
    // ABCDE side cols 10-13: ground, trigger, output, reset; FGHIJ side: vcc, discharge, threshold, control
    const t = part('timer', bb.id, {
      ground: 'E.10',
      trigger: 'E.11',
      output: 'E.12',
      reset: 'E.13',
      vcc: 'F.10',
      discharge: 'F.11',
      threshold: 'F.12',
      control: 'F.13',
    })
    const r1 = part('resistor', bb.id, { t1: 'I.10', t2: 'I.11' }, { kohm: 1 }) // vcc → discharge
    const r2 = part(
      'resistor',
      bb.id,
      { t1: 'H.11', t2: 'H.12' },
      { kohm: 4.7 },
    ) // discharge → threshold
    const c1 = part(
      'capacitor',
      bb.id,
      { anode: 'G.12', cathode: 'G.45' },
      { capacitance: '10u' },
    ) // threshold → gnd
    const rl = part(
      'resistor',
      bb.id,
      { t1: 'B.12', t2: 'B.50' },
      { kohm: 0.47 },
    ) // output → LED
    const led = part('led', bb.id, { '+': 'A.50', '-': 'A.46' })
    parts.push(bb, bat, t, r1, r2, c1, rl, led)
    wire(parts, wires, bat.id, '+', bb.id, 'positive.a.1')
    wire(parts, wires, bb.id, 'positive.a.2', bb.id, 'J.10') // vcc
    wire(parts, wires, bb.id, 'positive.a.3', bb.id, 'A.13') // reset high
    wire(parts, wires, bb.id, 'A.11', bb.id, 'J.12') // trigger = threshold
    wire(parts, wires, bb.id, 'A.10', bb.id, 'negative.a.1') // gnd pin
    wire(parts, wires, bb.id, 'J.45', bb.id, 'negative.a.2') // cap gnd
    wire(parts, wires, bb.id, 'B.46', bb.id, 'negative.a.3') // led gnd
    wire(parts, wires, bb.id, 'negative.a.4', bat.id, '-')
    const outs: number[] = []
    await run({ parts, wires }, 8, (c) => outs.push(v(c, t, 'output')))
    const hi = Math.max(...outs)
    const lo = Math.min(...outs)
    check(
      '555 output oscillates',
      hi > 5 && lo < 2,
      `out: ${outs.map((x) => x.toFixed(1)).join(' ')}`,
    )
  },
  // ------------------------------------------------- button → digitalRead
  async button() {
    console.log(
      '\n# tactile switch → pin 2 (10k pull-down) → digitalRead → pin 13',
    )
    const hex = await hexFor(
      'void setup(){pinMode(2,INPUT);pinMode(13,OUTPUT);} void loop(){digitalWrite(13, digitalRead(2));}',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const uno = part('arduino-uno', null, {}, { hexFile: hex })
    const sw = part('tactile-switch', bb.id, {
      '1': 'E.1',
      '2': 'E.2',
      '3': 'E.5',
      '4': 'E.6',
    })
    const pd = part('resistor', bb.id, { t1: 'D.5', t2: 'D.20' }, { kohm: 10 })
    parts.push(bb, uno, sw, pd)
    wire(parts, wires, uno.id, '5v', bb.id, 'A.1')
    wire(parts, wires, bb.id, 'A.5', uno.id, '2')
    wire(parts, wires, bb.id, 'A.20', uno.id, 'gnd.2')
    const v13: number[] = []
    // press → sampler → SPICE → MCU → PWL → SPICE takes ~4 windows to show on pin 13
    await run({ parts, wires }, 16, (c, i) => {
      v13.push(v(c, uno, '~13'))
      if (i === 3) (c.partsById[sw.id] as TactileSwitch).setPressed(true)
      if (i === 9) (c.partsById[sw.id] as TactileSwitch).setPressed(false)
    })
    const before = Math.max(...v13.slice(0, 3))
    const during = Math.min(...v13.slice(7, 9))
    const after = Math.max(...v13.slice(14))
    check(
      'digitalRead follows button (with pipeline latency)',
      before < 0.5 && during > 4.5 && after < 0.5,
      `pin13: ${v13.map((x) => x.toFixed(1)).join(' ')}`,
    )
  },
  // --------------------------------------------------------------------- pwm
  async pwm() {
    console.log('\n# analogWrite(9, 64) → 25% duty → ~1.25 V average on pin 9')
    const hex = await hexFor(
      'void setup(){pinMode(9,OUTPUT);analogWrite(9,64);} void loop(){}',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const uno = part('arduino-uno', null, {}, { hexFile: hex })
    const r = part('resistor', bb.id, { t1: 'E.1', t2: 'E.5' }, { kohm: 1 })
    parts.push(bb, uno, r)
    wire(parts, wires, uno.id, '~9', bb.id, 'A.1')
    wire(parts, wires, bb.id, 'A.5', uno.id, 'gnd.2')
    let last = 0
    await run({ parts, wires }, 6, (c) => (last = v(c, uno, '~9')))
    check(
      'PWM averaged voltage ≈ 1.25 V',
      last > 1.0 && last < 1.5,
      `${fmt(last)} V`,
    )
  },
  // ------------------------------------------------------------------ analog
  async analog() {
    console.log('\n# analogRead(A0) of a 2:1 divider → Serial prints ~511')
    const hex = await hexFor(
      'void setup(){Serial.begin(9600);} void loop(){Serial.println(analogRead(A0));delay(50);}',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const uno = part('arduino-uno', null, {}, { hexFile: hex })
    const r1 = part('resistor', bb.id, { t1: 'E.1', t2: 'E.5' }, { kohm: 1 })
    const r2 = part('resistor', bb.id, { t1: 'D.5', t2: 'D.9' }, { kohm: 1 })
    parts.push(bb, uno, r1, r2)
    wire(parts, wires, uno.id, '5v', bb.id, 'A.1')
    wire(parts, wires, bb.id, 'A.5', uno.id, 'a0')
    wire(parts, wires, bb.id, 'A.9', uno.id, 'gnd.2')
    const c = await run({ parts, wires }, 8, () => {})
    const logs = (c.partsById[uno.id] as ArduinoUno).logs.trim().split(/\r?\n/)
    const lastVal = Number(logs[logs.length - 1])
    check(
      'analogRead ≈ 511',
      lastVal > 480 && lastVal < 540,
      `serial tail: ${logs.slice(-4).join(',')}`,
    )
  },
  // ------------------------------------------------------------------- motor
  async motor() {
    console.log('\n# motor across 5V battery → 0.5 A, speed 5000')
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bat = part('battery', null, {}, { voltage: 5 })
    const m = part('motor', null)
    parts.push(bat, m)
    wire(parts, wires, bat.id, '+', m.id, 't1')
    wire(parts, wires, m.id, 't2', bat.id, '-')
    const c = await run({ parts, wires }, 3, () => {})
    const motor = c.partsById[m.id] as Motor
    const drop = motor.getVoltageAcross('t1', 't2', c.data.latestTime)
    check(
      'motor voltage drop ≈ 5 V',
      drop > 4.9 && drop < 5.1,
      `${fmt(drop)} V, speed ${(1e3 * drop).toFixed(0)}`,
    )
  },
  // --------------------------------------------------------- chip + rpi
  async chip() {
    console.log(
      '\n# 8-pin chip with a user subckt (pin1→pin8 = 100Ω) + Raspberry Pi as a connectivity board',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const bat = part('battery', null, {}, { voltage: 5 })
    const rpi = part('raspberry-pi', null)
    const chip = part(
      '8-pin-chip',
      bb.id,
      {
        '1': 'E.1',
        '2': 'E.2',
        '3': 'E.3',
        '4': 'E.4',
        '5': 'F.4',
        '6': 'F.3',
        '7': 'F.2',
        '8': 'F.1',
      },
      {
        chipName: 'R100',
        subcktCode: 'R1 1 8 100',
        pinLabels: { '1': 'IN', '8': 'OUT' },
      },
    )
    const led = part('led', bb.id, { '+': 'J.1', '-': 'J.10' })
    parts.push(bb, bat, rpi, chip, led)
    wire(parts, wires, bat.id, '+', rpi.id, '0.0')
    wire(parts, wires, rpi.id, '0.0', bb.id, 'A.1')
    wire(parts, wires, bb.id, 'I.10', bat.id, '-')
    let last = 0
    await run({ parts, wires }, 3, (c) => (last = mA(c, led)))
    check(
      'subckt resistor limits LED ≈ 30 mA',
      last > 25 && last < 35,
      `${fmt(last)} mA, pin1 label: ${(parts[3].pinLabels as Record<string, string>)['1']}`,
    )
  },
  // --------------------------------------------------------------- lcd
  async lcd() {
    console.log(
      '\n# 16x2 LCD, 4-bit parallel via LiquidCrystal(12, 11, 5, 4, 3, 2)',
    )
    const hex = await hexFor(
      '#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nvoid setup(){ lcd.begin(16,2); lcd.print("hello, world!"); }\nvoid loop(){ lcd.setCursor(0,1); lcd.print(millis()/1000); }',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bb = part('breadboard', null)
    const uno = part('arduino-uno', null, {}, { hexFile: hex })
    // pins along row E, columns 1..16 (VSS VDD V0 RS RW E D0..D7 A K)
    const names = [
      'VSS',
      'VDD',
      'V0',
      'RS',
      'RW',
      'E',
      'D0',
      'D1',
      'D2',
      'D3',
      'D4',
      'D5',
      'D6',
      'D7',
      'A',
      'K',
    ]
    const lcd = part(
      'lcd1602',
      bb.id,
      Object.fromEntries(names.map((name, i) => [name, `E.${i + 1}`])),
    )
    parts.push(bb, uno, lcd)
    const w = (col: number, pin: string) =>
      wire(parts, wires, bb.id, `A.${col}`, uno.id, pin)
    w(1, 'gnd.2') // VSS
    w(2, '5v') // VDD
    w(4, '12') // RS
    w(5, 'gnd.1') // RW
    w(6, '~11') // E
    w(11, '~5') // D4
    w(12, '4') // D5
    w(13, '~3') // D6
    w(14, '2') // D7
    const c = await run({ parts, wires }, 12, () => {})
    const p = c.partsById[lcd.id] as Lcd1602
    const l1 = p.lcd.text(0)
    const l2 = p.lcd.text(1)
    const unoP = c.partsById[uno.id]
    console.log('   debug', JSON.stringify(p.debug), 'version', p.lcd.version, 'E node', p.terminalsByName.E.node, 'uno ~11 node', unoP.terminalsByName['~11'].node, 'bb E.6', c.partsById[bb.id].terminalsByName['E.6'].node, 'bb A.6', c.partsById[bb.id].terminalsByName['A.6'].node)
    check(
      'LCD line 1 = "hello, world!"',
      l1.trimEnd() === 'hello, world!',
      JSON.stringify([l1, l2]),
    )
    check(
      'LCD line 2 shows seconds',
      /\d/.test(l2) && p.lcd.displayOn,
      `backlight=${p.lcd.backlight}`,
    )
  },
  async 'lcd-i2c'() {
    console.log('\n# 16x2 LCD over I2C (PCF8574 @ 0x27) via LiquidCrystal_I2C')
    const hex = await hexFor(
      '#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27,16,2);\nvoid setup(){ lcd.init(); lcd.backlight(); lcd.print("I2C OK"); lcd.setCursor(0,1); lcd.print("addr 0x27"); }\nvoid loop(){}',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const uno = part('arduino-uno', null, {}, { hexFile: hex })
    const lcd = part('lcd1602-i2c', null, {}, { i2cAddress: 0x27 })
    parts.push(uno, lcd)
    wire(parts, wires, lcd.id, 'GND', uno.id, 'gnd.2')
    wire(parts, wires, lcd.id, 'VCC', uno.id, '5v')
    wire(parts, wires, lcd.id, 'SDA', uno.id, 'a4')
    wire(parts, wires, lcd.id, 'SCL', uno.id, 'a5')
    const c = await run({ parts, wires }, 8, () => {})
    const p = c.partsById[lcd.id] as Lcd1602I2c
    check(
      'I2C LCD shows text',
      p.lcd.text(0).startsWith('I2C OK') &&
        p.lcd.text(1).startsWith('addr 0x27'),
      JSON.stringify([p.lcd.text(0), p.lcd.text(1)]),
    )
    check('I2C LCD backlight on', p.lcd.backlight && p.lcd.displayOn, '')
  },
  // ----------------------------------------------------- clock + ratings
  async clock() {
    console.log(
      '\n# playback clock drives part ratings: 9V → 47Ω → LED (≈150 mA) → PEAK_FORWARD_CURRENT error',
    )
    const parts: PartJSON[] = []
    const wires: WireJSON[] = []
    const bat = part('battery', null, {}, { voltage: 9 })
    const r = part('resistor', null, {}, { kohm: 0.047 })
    const led = part('led', null)
    parts.push(bat, r, led)
    wire(parts, wires, bat.id, '+', r.id, 't1')
    wire(parts, wires, r.id, 't2', led.id, '+')
    wire(parts, wires, led.id, '-', bat.id, '-')
    const c = await run({ parts, wires }, 4, () => {})
    // ratings are checked on every 30th clock tick; drive the playback clock there manually
    c.clock.setTick(30)
    c.clock.setTime(c.data.latestTime)
    const ledPart = c.partsById[led.id] as Led
    const err = ledPart.errors.find(
      (e) => e.code === 'PEAK_FORWARD_CURRENT_EXCEEDED',
    )
    check(
      'LED over-current error raised via clock',
      !!err,
      err?.message ?? 'no error',
    )
  },
}

async function main() {
  const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const names = wanted.length ? wanted : Object.keys(cases)
  for (const name of names) {
    const fn = cases[name]
    if (!fn) {
      console.log(`unknown case ${name}`)
      continue
    }
    try {
      await fn()
    } catch (e) {
      check(name, false, `threw: ${(e as Error).message ?? e}`)
    }
  }
  clearInterval(keepalive)
  const failed = results.filter((r) => !r.ok)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
}
main()
