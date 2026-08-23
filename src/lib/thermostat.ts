import * as defs from '#/sim/defs'
import { mg } from '#/sim/types'
import type {
  PartJSON,
  PartType,
  ProjectJSON,
  TerminalDefinition,
  WireJSON,
} from '#/sim/types'

export const THERMOSTAT_SKETCH = `#include <LiquidCrystal.h>

// LCD: RS=12, E=11, D4=5, D5=4, D6=3, D7=2
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);

const int SENSOR = A0;   // TMP36 Vout
const int SETPOT = A1;   // potentiometer wiper
const int HEAT_LED = 8;  // red
const int COOL_LED = 9;  // blue
const float HYSTERESIS = 1.0;

void setup() {
  lcd.begin(16, 2);
  pinMode(HEAT_LED, OUTPUT);
  pinMode(COOL_LED, OUTPUT);
}

void loop() {
  // TMP36: 10 mV per degree C with a 500 mV offset
  float volts = analogRead(SENSOR) * 5.0 / 1023.0;
  float celsius = (volts - 0.5) * 100.0;
  float ambient = celsius * 9.0 / 5.0 + 32.0;

  // pot maps 0..1023 onto a 50..80 F setpoint
  int setpoint = 50 + (analogRead(SETPOT) * 30L) / 1023;

  bool heating = ambient < setpoint - HYSTERESIS;
  bool cooling = ambient > setpoint + HYSTERESIS;
  digitalWrite(HEAT_LED, heating);
  digitalWrite(COOL_LED, cooling);

  lcd.setCursor(0, 0);
  lcd.print("Amb ");
  lcd.print((int)ambient);
  lcd.print("F Set ");
  lcd.print(setpoint);
  lcd.print("F  ");
  lcd.setCursor(0, 1);
  lcd.print(heating ? "HEATING  " : cooling ? "COOLING  " : "IDLE     ");
  lcd.print("       ");
  delay(200);
}
`

export const BB_ID = 'bb-thermostat'
export const UNO_ID = 'uno-thermostat'
const bbTerms = Object.fromEntries(
  defs.breadboardTerminals.map((t) => [t.name, t]),
)
const unoTerms = Object.fromEntries(
  defs.arduinoUnoTerminals.map((t) => [t.name, t]),
)
export const UNO_SURFACE_Y = 0.71 * defs.arduinoUnoDimensions.height // ArduinoUnoPart.dragSurfaceHeight

let seq = 0
export const resetIds = () => {
  seq = 0
}
const id = (p: string) => `${p}-${++seq}`

const TERMINAL_DEFS: Partial<Record<PartType, TerminalDefinition[]>> = {
  lcd1602: defs.lcd1602Terminals,
  potentiometer: defs.potentiometerTerminals,
  tmp36: defs.tmp36Terminals,
  resistor: defs.resistorTerminals,
  led: defs.ledTerminals,
}

/**
 * Place a breadboard child so that its named pin sits in a hole: position =
 * hole − R(rotation)·pinLocal (XZ), y = the breadboard's drag surface.
 */
export function onBreadboard(
  type: PartType,
  rotation: number,
  conns: Record<string, string>,
  extra: Partial<PartJSON> = {},
): PartJSON {
  const [pin, hole] = Object.entries(conns)[0]
  const def = TERMINAL_DEFS[type]!.find((t) => t.name === pin)!
  const h = bbTerms[hole]
  const c = Math.cos(rotation)
  const s = Math.sin(rotation)
  // rotate local (x,z) about Y by `rotation`
  const rx = def.position.x * c + def.position.z * s
  const rz = -def.position.x * s + def.position.z * c
  return {
    id: id(type),
    type,
    parentId: BB_ID,
    position: {
      x: h.position.x - rx,
      y: defs.breadboardDimensions.height,
      z: h.position.z - rz,
    },
    rotation,
    terminals: Object.entries(conns).map(([name, to]) => ({
      name,
      connections: [to],
    })),
    showLabels: false,
    ...extra,
  }
}

export function bbEnd(hole: string): PartJSON {
  const h = bbTerms[hole]
  return {
    id: id('we'),
    type: 'wire-end',
    parentId: BB_ID,
    position: {
      x: h.position.x,
      y: defs.breadboardDimensions.height,
      z: h.position.z,
    },
    rotation: 0,
    terminals: [{ name: 't1', connections: [hole] }],
  }
}

export function unoEnd(pin: string): PartJSON {
  const t = unoTerms[pin]
  return {
    id: id('we'),
    type: 'wire-end',
    parentId: UNO_ID,
    position: { x: t.position.x, y: UNO_SURFACE_Y, z: t.position.z },
    rotation: 0,
    terminals: [{ name: 't1', connections: [pin] }],
  }
}

/** Demo: TMP36 + potentiometer setpoint (50–80 °F) + 16×2 LCD + heat/cool LEDs on an Uno. */
export function thermostatProject(
  projectId: string,
  userId?: string | null,
  sketch: string = THERMOSTAT_SKETCH,
  name = 'Thermostat',
): ProjectJSON {
  seq = 0
  const parts: PartJSON[] = []
  const wires: WireJSON[] = []
  const link = (a: PartJSON, b: PartJSON, color: string) => {
    parts.push(a, b)
    wires.push({ id: id('w'), color, partOneId: a.id, partTwoId: b.id })
  }

  parts.push({
    id: BB_ID,
    type: 'breadboard',
    parentId: null,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    terminals: [],
  })
  parts.push({
    id: UNO_ID,
    type: 'arduino-uno',
    parentId: null,
    position: { x: -13, y: 0, z: 0 },
    rotation: 0,
    terminals: [],
    files: {
      'main.ino': {
        content: sketch,
        fileExtension: '.ino',
        order: 0,
      },
    },
    compilationStatus: 'not-compiled',
    compilationOutput: '',
    hexFile: '',
  })

  // power rails
  link(unoEnd('5v'), bbEnd('positive.a.1'), 'Crimson')
  link(unoEnd('gnd.1'), bbEnd('negative.a.1'), 'Black')

  // LCD pins in row A, columns 20..35: the module body extends away from its
  // pin row, so with pins in A it overhangs the front edge and leaves rows B–J
  // (and the top rails) at those columns free for wires. Pins in row J would
  // put the whole body over the strips and bury every wire under the display.
  const lcdPins = [
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
  parts.push(
    onBreadboard(
      'lcd1602',
      0,
      Object.fromEntries(lcdPins.map((p, i) => [p, `A.${20 + i}`])),
    ),
  )
  link(bbEnd('C.20'), bbEnd('negative.a.5'), 'Black') // VSS
  link(bbEnd('C.21'), bbEnd('positive.a.5'), 'Crimson') // VDD
  link(bbEnd('C.22'), bbEnd('negative.a.6'), 'Black') // V0 contrast
  link(bbEnd('C.23'), unoEnd('12'), 'Gold') // RS
  link(bbEnd('C.24'), bbEnd('negative.a.7'), 'Black') // RW
  link(bbEnd('C.25'), unoEnd('~11'), 'Gold') // E
  link(bbEnd('C.30'), unoEnd('~5'), 'MediumOrchid') // D4
  link(bbEnd('C.31'), unoEnd('4'), 'MediumOrchid') // D5
  link(bbEnd('C.32'), unoEnd('~3'), 'MediumOrchid') // D6
  link(bbEnd('C.33'), unoEnd('2'), 'MediumOrchid') // D7
  link(bbEnd('C.34'), bbEnd('positive.a.10'), 'Crimson') // A backlight
  link(bbEnd('C.35'), bbEnd('negative.a.10'), 'Black') // K

  // setpoint pot: row E cols 46-48 (clear of the display, which spans ~columns 12–43)
  parts.push(
    onBreadboard(
      'potentiometer',
      0,
      { '1': 'E.46', wiper: 'E.47', '3': 'E.48' },
      { kohm: 10, wiper: 0.5 },
    ),
  )
  link(bbEnd('A.46'), bbEnd('positive.a.30'), 'Crimson')
  link(bbEnd('A.47'), unoEnd('a1'), 'DeepSkyBlue')
  link(bbEnd('A.48'), bbEnd('negative.a.30'), 'Black')

  // TMP36: row E cols 52-54 (+Vs, Vout, GND)
  parts.push(
    onBreadboard(
      'tmp36',
      0,
      { vs: 'E.52', vout: 'E.53', gnd: 'E.54' },
      { temperature: 22 },
    ),
  )
  link(bbEnd('A.52'), bbEnd('positive.a.35'), 'Crimson')
  link(bbEnd('A.53'), unoEnd('a0'), 'MediumSeaGreen')
  link(bbEnd('A.54'), bbEnd('negative.a.35'), 'Black')

  // heat LED (red): pin 8 → 220Ω → LED → GND, on the F–J bank so the A–E bank stays free
  parts.push(
    onBreadboard(
      'resistor',
      Math.PI / 2,
      { t1: 'J.54', t2: 'J.50' },
      { kohm: 0.22 },
    ),
  )
  parts.push(
    onBreadboard('led', 0, { '+': 'I.54', '-': 'I.55' }, { color: 'Crimson' }),
  )
  link(unoEnd('8'), bbEnd('F.50'), 'DarkOrange')
  link(bbEnd('F.55'), bbEnd('negative.a.40'), 'Black')

  // cool LED (blue): pin 9 → 220Ω → LED → GND
  parts.push(
    onBreadboard(
      'resistor',
      Math.PI / 2,
      { t1: 'J.62', t2: 'J.58' },
      { kohm: 0.22 },
    ),
  )
  parts.push(
    onBreadboard(
      'led',
      0,
      { '+': 'I.62', '-': 'I.63' },
      { color: 'DeepSkyBlue' },
    ),
  )
  link(unoEnd('~9'), bbEnd('F.58'), 'DarkOrange')
  link(bbEnd('F.63'), bbEnd('negative.a.45'), 'Black')

  return {
    id: projectId,
    user_id: userId ?? null,
    name,
    featured: false,
    camera: {
      position: { x: -18, y: 14, z: 16 },
      target: { x: -2, y: 0, z: 0 },
    },
    circuit: { parts, wires },
  }
}

// keep `mg` referenced for readers comparing pitch-based layouts
void mg
