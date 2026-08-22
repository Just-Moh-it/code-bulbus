/**
 * Headless end-to-end check of the simulation pipeline:
 *   Arduino sketch → arduino-cli → HEX → avr8js → PWL sources → ngspice WASM → DataBus
 *
 * Circuit: Uno pin ~13 → 220Ω → LED → GND, via a breadboard.
 * Run with:  bun scripts/smoke.ts
 */
import { Circuit, circuitDebug } from '#/sim'
import type { ArduinoUno, CircuitJSON, Led } from '#/sim'
import { compileSketch } from '#/server/compile'

const SKETCH = `
void setup() {
  pinMode(13, OUTPUT);
  Serial.begin(9600);
  Serial.println("hello from bulbus");
}
void loop() {
  digitalWrite(13, HIGH);
  delay(150);
  digitalWrite(13, LOW);
  delay(150);
}
`

const ids = {
  uno: 'uno',
  bb: 'bb',
  r: 'r1',
  led: 'led1',
  wA: 'we-a',
  wB: 'we-b',
  wC: 'we-c',
  wD: 'we-d',
}

function circuitJSON(hexFile: string): CircuitJSON {
  const origin = { x: 0, y: 0, z: 0 }
  return {
    parts: [
      {
        id: ids.uno,
        type: 'arduino-uno',
        parentId: null,
        position: { x: -12, y: 0, z: 0 },
        rotation: 0,
        terminals: [],
        hexFile,
      },
      {
        id: ids.bb,
        type: 'breadboard',
        parentId: null,
        position: origin,
        rotation: 0,
        terminals: [],
      },
      {
        id: ids.r,
        type: 'resistor',
        parentId: ids.bb,
        position: origin,
        rotation: 0,
        kohm: 0.22,
        terminals: [
          { name: 't1', connections: ['E.1'] },
          { name: 't2', connections: ['E.5'] },
        ],
      },
      {
        id: ids.led,
        type: 'led',
        parentId: ids.bb,
        position: origin,
        rotation: 0,
        color: 'red',
        terminals: [
          { name: '+', connections: ['D.5'] },
          { name: '-', connections: ['D.9'] },
        ],
      },
      {
        id: ids.wA,
        type: 'wire-end',
        parentId: ids.uno,
        position: origin,
        rotation: 0,
        terminals: [{ name: 't1', connections: ['~13'] }],
      },
      {
        id: ids.wB,
        type: 'wire-end',
        parentId: ids.bb,
        position: origin,
        rotation: 0,
        terminals: [{ name: 't1', connections: ['A.1'] }],
      },
      {
        id: ids.wC,
        type: 'wire-end',
        parentId: ids.bb,
        position: origin,
        rotation: 0,
        terminals: [{ name: 't1', connections: ['A.9'] }],
      },
      {
        id: ids.wD,
        type: 'wire-end',
        parentId: ids.uno,
        position: origin,
        rotation: 0,
        terminals: [{ name: 't1', connections: ['gnd.2'] }],
      },
    ],
    wires: [
      { id: 'w1', color: 'Crimson', partOneId: ids.wA, partTwoId: ids.wB },
      { id: 'w2', color: 'Black', partOneId: ids.wC, partTwoId: ids.wD },
    ],
  }
}

async function main() {
  // Bun drops out of the event loop while ngspice's promise is pending; keep it alive.
  const keepalive = setInterval(() => {}, 1000)
  const windows = Number(process.argv[2] ?? 30)
  circuitDebug.enabled = process.argv.includes('--debug')

  console.log('compiling sketch…')
  const t0 = performance.now()
  const compiled = await compileSketch({
    'main.ino': { content: SKETCH, fileExtension: '.ino', order: 0 },
  })
  if (compiled.error || !compiled.data) {
    console.error('compile failed:\n' + compiled.stderr)
    process.exit(1)
  }
  console.log(
    `compiled in ${(performance.now() - t0).toFixed(0)} ms, hex ${compiled.data.length} chars`,
  )
  console.log(compiled.stdout.split('\n').slice(0, 2).join('\n'))

  const circuit = new Circuit(circuitJSON(compiled.data), {
    onError: (m) => console.error('spice error:', m),
    onWarning: (m) => console.warn('spice warning:', m),
  })
  circuit.syncMcu = true
  const uno = circuit.partsById[ids.uno] as ArduinoUno
  const led = circuit.partsById[ids.led] as Led

  console.log(
    'nodes:',
    Object.fromEntries(
      Object.values(circuit.partsById).flatMap((p) =>
        p.terminals
          .filter(
            (t) =>
              t.node !== null &&
              p.type !== 'breadboard' &&
              p.type !== 'arduino-uno',
          )
          .map((t) => [t.id, t.node]),
      ),
    ),
  )
  console.log(
    'pin13 node:',
    uno.terminalsByName['~13'].node,
    ' led +/-:',
    led.terminalsByName['+'].node,
    led.terminalsByName['-'].node,
  )
  console.log(`\nrunning ${windows} windows of ${circuit.simDuration} ms…\n`)
  console.log(' win |   t(ms) | pin13 V | LED mA | avr ms | bar')

  let count = 0
  circuit.events.onWindow = (c) => {
    count++
    const t = c.data.latestTime
    const v13 = c.data.getVoltage(String(uno.terminalsByName['~13'].node), t)
    const iLed = c.data.getAmperage(led.deviceId, t) * 1e3
    const bar = '█'.repeat(Math.max(0, Math.round(iLed)))
    console.log(
      `${String(count).padStart(4)} | ${t.toFixed(0).padStart(7)} | ${v13.toFixed(2).padStart(7)} | ${iLed.toFixed(2).padStart(6)} | ${uno.simulator.milliseconds.toFixed(0).padStart(6)} | ${bar}`,
    )
    if (count >= windows) c.stop()
  }

  await circuit.start()
  clearInterval(keepalive)
  console.log('\nserial log:', JSON.stringify(uno.logs))
  console.log(
    `avg sim time ${circuit.averageSimTime.toFixed(1)} ms/window, clock rate ${circuit.idealClockRate.toFixed(2)}x`,
  )
  const errs = circuit.parts.flatMap((p) => p.errors)
  if (errs.length) console.log('part errors:', errs)
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
