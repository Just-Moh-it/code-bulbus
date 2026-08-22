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
