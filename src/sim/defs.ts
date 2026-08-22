/**
 * Part dimensions + terminal definitions. Values are copied verbatim from the
 * reference so terminal positions line up with the GLB models 1:1.
 */
import { mg } from './types'
import type { Dimensions, TerminalDefinition } from './types'

// ---------------------------------------------------------------- Arduino Uno
export const arduinoUnoDimensions: Dimensions = {
  width: 5.334876632690431,
  height: 1.519999885559082,
  depth: 7.493719863891602,
}

function unoHeader(
  pins: { name: string; label: string; group?: string }[],
  x: number,
  z0: number,
): TerminalDefinition[] {
  return pins.map((t, i) => ({
    surface: 'top',
    type: 'female-pin',
    name: t.name,
    label: t.label,
    group: t.group,
    position: {
      x: x + 18 * mg,
      y: 0.8 * arduinoUnoDimensions.height,
      z: z0 - i * mg,
    },
  }))
}

const uw = arduinoUnoDimensions.width
const ud = arduinoUnoDimensions.depth

export const arduinoUnoTerminals: TerminalDefinition[] = [
  ...unoHeader(
    [
      { name: 'ioref', label: 'IOREF' },
      { name: 'reset', label: 'RESET' },
      { name: '3.3v', label: '3.3V' },
      { name: '5v', label: '5V' },
      { name: 'gnd.1', label: 'GND', group: 'gnd' },
      { name: 'gnd.2', label: 'GND', group: 'gnd' },
      { name: 'vin', label: 'VIN' },
    ],
    -(0.404 * uw),
    0.0085 * ud,
  ),
  ...unoHeader(
    [
      { name: 'a0', label: 'A0' },
      { name: 'a1', label: 'A1' },
      { name: 'a2', label: 'A2' },
      { name: 'a3', label: 'A3' },
      { name: 'a4', label: 'A4' },
      { name: 'a5', label: 'A5' },
    ],
    -(0.404 * uw),
    0.0085 * ud - 8 * mg,
  ),
  ...unoHeader(
    [
      { name: 'scl', label: 'SCL' },
      { name: 'sda', label: 'SDA' },
      { name: 'aref', label: 'AREF' },
      { name: 'gnd.3', label: 'GND', group: 'gnd' },
      { name: '~13', label: '~13' },
      { name: '12', label: '12' },
      { name: '~11', label: '~11' },
      { name: '~10', label: '~10' },
      { name: '~9', label: '~9' },
      { name: '8', label: '8' },
    ],
    -(1.311 * uw),
    0.162 * ud,
  ),
  ...unoHeader(
    [
      { name: '7', label: '7' },
      { name: '~6', label: '~6' },
      { name: '~5', label: '~5' },
      { name: '4', label: '4' },
      { name: '~3', label: '~3' },
      { name: '2', label: '2' },
      { name: 'tx1->1', label: 'TX1 -> 1' },
      { name: 'rx1<-0', label: 'RX1 <- 0' },
    ],
    -(1.311 * uw),
    -0.195 * ud,
  ),
]

// ----------------------------------------------------------------- Breadboard
export const breadboardDimensions: Dimensions = {
  width: 16.510000000008244,
  height: 0.84973808070585,
  depth: 5.716748200810333,
}

const bb = breadboardDimensions

/** Power rail: 50 holes in groups of 5, all one net. */
function rail(prefix: string, row: number): TerminalDefinition[] {
  const x0 = 0.054 * bb.width - bb.width / 2
  const z = 0.027 * bb.width - bb.depth / 2 + row * mg
  return Array.from({ length: 50 }, (_, i) => {
    const gap = Math.floor(i / 5) * mg
    return {
      surface: 'top',
      type: 'female-pin',
      name: `${prefix}.${i + 1}`,
      group: prefix,
      position: { x: x0 + i * mg + gap, y: bb.height, z },
    }
  })
}

/** Terminal strip row: 63 holes, each column of 5 (ABCDE / FGHIJ) is one net. */
function strip(prefix: string, row: number): TerminalDefinition[] {
  const x0 = 0.054 * bb.width - 2 * mg - bb.width / 2
  const z = 0.027 * bb.width - bb.depth / 2 + row * mg
  const side = 'ABCDE'.includes(prefix) ? 'ABCDE' : 'FGHIJ'
  return Array.from({ length: 63 }, (_, i) => ({
    surface: 'top',
    type: 'female-pin',
    name: `${prefix}.${i + 1}`,
    group: `${side}.${i + 1}`,
    position: { x: x0 + i * mg, y: bb.height, z },
  }))
}

export const breadboardTerminals: TerminalDefinition[] = [
  ...rail('negative.a', 0),
  ...rail('positive.a', 1),
  ...strip('J', 4),
  ...strip('I', 5),
  ...strip('H', 6),
  ...strip('G', 7),
  ...strip('F', 8),
  ...strip('E', 11),
  ...strip('D', 12),
  ...strip('C', 13),
  ...strip('B', 14),
  ...strip('A', 15),
  ...rail('negative.b', 18),
  ...rail('positive.b', 19),
]

// ------------------------------------------------------------------------ LED
export const ledDimensions: Dimensions = {
  width: 0.4404913669824601,
  height: 2.2594220209121705,
  depth: 0.47190001487731953,
}
export const ledTerminals: TerminalDefinition[] = [
  {
    surface: 'bottom',
    type: 'male-pin',
    name: '+',
    label: 'Anode (+)',
    position: {
      x: -0.289 * ledDimensions.width,
      y: -0.34 * ledDimensions.height,
      z: 0,
    },
  },
  {
    surface: 'bottom',
    type: 'male-pin',
    name: '-',
    label: 'Cathode (-)',
    position: {
      x: 0.289 * ledDimensions.width,
      y: -0.25 * ledDimensions.height,
      z: 0,
    },
  },
]

// ------------------------------------------------------------------- Resistor
export const resistorDimensions: Dimensions = {
  width: 0.24044944010133212,
  height: 0.7444213419520423,
  depth: 1.0661184555171395,
}
export const resistorTerminals: TerminalDefinition[] = [
  {
    surface: 'bottom',
    type: 'male-pin',
    name: 't1',
    label: '1',
    position: {
      x: 0,
      y: -0.33 * resistorDimensions.height,
      z: 0.475 * resistorDimensions.depth,
    },
  },
  {
    surface: 'bottom',
    type: 'male-pin',
    name: 't2',
    label: '2',
    position: {
      x: 0,
      y: -0.33 * resistorDimensions.height,
      z: -0.475 * resistorDimensions.depth,
    },
  },
]

// -------------------------------------------------------------------- Battery
export const batteryDimensions: Dimensions = {
  width: 2.3051039934158326,
  height: 1.9485666151940824,
  depth: 3.490685367584229,
}
export const batteryTerminals: TerminalDefinition[] = [
  {
    surface: 'top',
    type: 'male-pin',
    name: '+',
    label: 'Anode (+)',
    position: {
      x: -0.054 * batteryDimensions.width,
      y: batteryDimensions.height,
      z: -0.4 * batteryDimensions.depth,
    },
  },
  {
    surface: 'top',
    type: 'male-pin',
    name: '-',
    label: 'Cathode (-)',
    position: {
      x: 0.054 * batteryDimensions.width,
      y: batteryDimensions.height,
      z: -0.4 * batteryDimensions.depth,
    },
  },
]

// ------------------------------------------------------------------- Wire end
export const wireEndDimensions: Dimensions = {
  width: 0.1905,
  height: 0.508,
  depth: 0.1905,
}
export const wireEndTerminals: TerminalDefinition[] = [
  {
    surface: 'bottom',
    type: 'male-pin',
    name: 't1',
    label: '1',
    position: { x: 0, y: 0, z: 0 },
  },
]

// ------------------------------------------------------------ Tactile switch
export const tactileSwitchDimensions: Dimensions = {
  width: 0.5892600207589567,
  height: 0.689501644590497,
  depth: 0.8645757313124836,
}
const ts = tactileSwitchDimensions
/** Pins 1+2 are one pole, 3+4 the other; pressing bridges the two groups. */
export const tactileSwitchTerminals: TerminalDefinition[] = [
  {
    surface: 'bottom',
    type: 'male-pin',
    name: '1',
    label: '1',
    group: '1',
    position: { x: 0.425 * ts.width, y: -0.05 * ts.height, z: 0.44 * ts.depth },
  },
  {
    surface: 'bottom',
    type: 'male-pin',
    name: '2',
    label: '2',
    group: '1',
    position: {
      x: 0.425 * ts.width,
      y: -0.05 * ts.height,
      z: -0.44 * ts.depth,
    },
  },
  {
    surface: 'bottom',
    type: 'male-pin',
    name: '3',
    label: '3',
    group: '2',
    position: {
      x: -0.425 * ts.width,
      y: -0.05 * ts.height,
      z: 0.44 * ts.depth,
    },
  },
  {
    surface: 'bottom',
    type: 'male-pin',
    name: '4',
    label: '4',
    group: '2',
    position: {
      x: -0.425 * ts.width,
      y: -0.05 * ts.height,
      z: -0.44 * ts.depth,
    },
  },
]

// ---------------------------------------------------------------- Transistor
export const transistorDimensions: Dimensions = {
  width: 0.5793953704833985,
  height: 2.220976333618164,
  depth: 0.39350032806396484,
}
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
function bjtTerminals(order: [string, string, string]): TerminalDefinition[] {
  const t = transistorDimensions
  const xs = [0.425, -0.01, -0.445]
  return order.map((name, i) => ({
    surface: 'bottom',
    type: 'male-pin',
    name,
    label: capitalize(name),
    position: { x: xs[i] * t.width, y: -0.2 * t.height, z: -0.08 * t.depth },
  }))
}
export const npnTerminals = (_model: string) =>
  bjtTerminals(['collector', 'base', 'emitter'])
export const pnpTerminals = (model: string) =>
  bjtTerminals(
    model === '2N3906'
      ? ['emitter', 'base', 'collector']
      : ['collector', 'base', 'emitter'],
  )

// ----------------------------------------------------------------- Capacitor
export const capacitorDimensions: Dimensions = {
  width: 0.5199999734759331,
  height: 2.589092849195004,
  depth: 0.5199999734759331,
}
export const capacitorTerminals: TerminalDefinition[] = [
  {
    surface: 'bottom',
    type: 'male-pin',
    name: 'cathode',
    label: 'Cathode (-)',
    position: {
      x: 0,
      y: -0.22 * capacitorDimensions.height,
      z: 0.24 * capacitorDimensions.depth,
    },
  },
  {
    surface: 'bottom',
    type: 'male-pin',
    name: 'anode',
    label: 'Anode (+)',
    position: {
      x: 0,
      y: -0.29 * capacitorDimensions.height,
      z: -0.24 * capacitorDimensions.depth,
    },
  },
]

// ------------------------------------------------------------- DIP-8 (shared)
export const dip8Dimensions: Dimensions = {
  width: 0.9119251584634185,
  height: 0.6445517071988434,
  depth: 0.7855555743955076,
}
function dip8(
  names: [string, string, string, string, string, string, string, string],
  labels?: string[],
): TerminalDefinition[] {
  const d = dip8Dimensions
  const x0 = 0.415 * d.width
  const z0 = -0.485 * d.depth
  const y = -0.33 * d.height
  return names.map((name, i) => {
    const col = i < 4 ? i : 7 - i
    const row = i < 4 ? 0 : 3
    return {
      surface: 'bottom',
      type: 'male-pin',
      name,
      label: labels?.[i] ?? name,
      position: { x: x0 - col * mg, y, z: z0 + row * mg },
    }
  })
}
export const timerDimensions = dip8Dimensions
export const timerTerminals = dip8(
  [
    'ground',
    'trigger',
    'output',
    'reset',
    'vcc',
    'discharge',
    'threshold',
    'control',
  ],
  [
    'Ground',
    'Trigger',
    'Output',
    'Reset',
    'VCC',
    'Discharge',
    'Threshold',
    'Control',
  ],
)
export const eightPinChipDimensions = dip8Dimensions
export const eightPinChipTerminals = dip8([
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
])

// --------------------------------------------------------------------- Motor
export const motorDimensions: Dimensions = {
  width: 1.6650000000000005,
  height: 4.370831680297852,
  depth: 2.305565146923066,
}
export const motorTerminals: TerminalDefinition[] = [
  {
    surface: 'top',
    type: 'male-pin',
    name: 't1',
    label: '1',
    position: {
      x: -0.077 * motorDimensions.width,
      y: 0.2 * motorDimensions.height,
      z: -0.36 * motorDimensions.depth,
    },
  },
  {
    surface: 'top',
    type: 'male-pin',
    name: 't2',
    label: '2',
    position: {
      x: 0.077 * motorDimensions.width,
      y: 0.2 * motorDimensions.height,
      z: -0.36 * motorDimensions.depth,
    },
  },
]

// -------------------------------------------------------------- Raspberry Pi
export const raspberryPiDimensions: Dimensions = {
  width: 8.361735089111335,
  height: 1.2130783743739824,
  depth: 5.66987138143165,
}
export const raspberryPiTerminals: TerminalDefinition[] = (() => {
  const r = raspberryPiDimensions
  const x0 = -(0.411 * r.width)
  const z0 = -(0.408 * r.depth)
  const row = (prefix: string, z: number) =>
    Array.from({ length: 20 }, (_, i): TerminalDefinition => ({
      surface: 'top',
      type: 'male-pin',
      name: `${prefix}.${i}`,
      position: { x: x0 + i * mg, y: 0.55 * r.height, z },
    }))
  return [...row('0', z0), ...row('1', z0 - mg)]
})()

// ------------------------------------------------------------- 16×2 LCD
/** 80 × 36 mm module, ~10 mm tall with header (1 unit ≈ 10 mm). */
export const lcd1602Dimensions: Dimensions = {
  width: 8,
  height: 1.0,
  depth: 3.6,
}
const LCD_PIN_NAMES = [
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
/** 16 male pins on 0.1" pitch along the back edge, pointing down into the breadboard. */
export const lcd1602Terminals: TerminalDefinition[] = LCD_PIN_NAMES.map(
  (name, i) => ({
    surface: 'bottom',
    type: 'male-pin',
    name,
    label: name,
    position: {
      x: -((LCD_PIN_NAMES.length - 1) * mg) / 2 + i * mg,
      y: -0.5 * lcd1602Dimensions.height,
      z: -lcd1602Dimensions.depth / 2 + mg,
    },
  }),
)

export const lcd1602I2cDimensions: Dimensions = lcd1602Dimensions
const LCD_I2C_PIN_NAMES = ['GND', 'VCC', 'SDA', 'SCL']
export const lcd1602I2cTerminals: TerminalDefinition[] = LCD_I2C_PIN_NAMES.map(
  (name, i) => ({
    surface: 'bottom',
    type: 'male-pin',
    name,
    label: name,
    position: {
      x: -lcd1602I2cDimensions.width / 2 + 4 * mg + i * mg,
      y: -0.5 * lcd1602I2cDimensions.height,
      z: -lcd1602I2cDimensions.depth / 2 + mg,
    },
  }),
)

// ------------------------------------------------------------ potentiometer
/** ~10 mm trim-pot, 3 legs on 0.1" pitch: 1, wiper, 3. */
export const potentiometerDimensions: Dimensions = {
  width: 0.95,
  height: 0.95,
  depth: 0.95,
}
export const potentiometerTerminals: TerminalDefinition[] = [
  '1',
  'wiper',
  '3',
].map((name, i) => ({
  surface: 'bottom',
  type: 'male-pin',
  name,
  label: name === 'wiper' ? 'Wiper' : name,
  position: {
    x: (i - 1) * mg,
    y: -0.3 * potentiometerDimensions.height,
    z: 0.4 * potentiometerDimensions.depth,
  },
}))

// -------------------------------------------------------------------- TMP36
/** TO-92 package, flat face forward; legs (+Vs, Vout, GND) on 0.1" pitch. */
export const tmp36Dimensions: Dimensions = {
  width: 0.6,
  height: 0.7,
  depth: 0.4,
}
export const tmp36Terminals: TerminalDefinition[] = [
  { name: 'vs', label: '+Vs' },
  { name: 'vout', label: 'Vout' },
  { name: 'gnd', label: 'GND' },
].map((t, i) => ({
  surface: 'bottom',
  type: 'male-pin',
  name: t.name,
  label: t.label,
  position: { x: (i - 1) * mg, y: -0.4 * tmp36Dimensions.height, z: 0 },
}))
