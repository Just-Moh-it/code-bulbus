/**
 * Core data shapes. These mirror the project JSON format exactly so that
 * exported withdiode projects load unchanged.
 */

export const PartType = {
  Breadboard: 'breadboard',
  RaspberryPi: 'raspberry-pi',
  Resistor: 'resistor',
  TactileSwitch: 'tactile-switch',
  WireEnd: 'wire-end',
  Battery: 'battery',
  Led: 'led',
  NpnTransistor: 'npn-transistor',
  PnpTransistor: 'pnp-transistor',
  Capacitor: 'capacitor',
  Timer: 'timer',
  ArduinoUno: 'arduino-uno',
  Motor: 'motor',
  EightPinChip: '8-pin-chip',
  Lcd1602: 'lcd1602',
  Lcd1602I2c: 'lcd1602-i2c',
} as const
export type PartType = (typeof PartType)[keyof typeof PartType]

export const WireType = { Wire: 'wire' } as const

/** Grid unit (0.1in pitch, in scene units). Every terminal position is a multiple of this. */
export const mg = 0.254

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface Dimensions {
  width: number
  height: number
  depth: number
}

export interface TerminalDefinition {
  surface: 'top' | 'bottom'
  type: 'male-pin' | 'female-pin'
  name: string
  label?: string
  /** Terminals sharing a group are implicitly connected (e.g. a breadboard column). */
  group?: string
  position: Vec3
}

export interface TerminalJSON {
  name: string
  /** Names of terminals on the *parent* part this terminal is plugged into. */
  connections: string[]
}

export interface PartJSON {
  id: string
  type: PartType
  parentId: string | null
  position: Vec3
  rotation: number
  terminals: TerminalJSON[]
  showLabels?: boolean
  showVoltages?: boolean
  // part-specific
  voltage?: number // battery
  kohm?: number // resistor
  color?: string // led
  latching?: boolean // tactile switch
  model?: string // transistor model e.g. 2N2222 / 2N3906
  capacitance?: string | number // capacitor, SPICE value e.g. '10u'
  pinLabels?: Record<string, string> // 8-pin chip
  subcktCode?: string // 8-pin chip body of .subckt
  chipName?: string // 8-pin chip
  i2cAddress?: number // I²C LCD backpack (0x27 / 0x3F)
  hexFile?: string // arduino
  files?: Record<
    string,
    { content: string; fileExtension: string; order: number }
  >
  compilationStatus?: 'not-compiled' | 'compiling' | 'success' | 'error'
  compilationOutput?: string
}

/** Minimal JSON needed to instantiate a part (terminals/extras optional). */
export type PartInput = Pick<
  PartJSON,
  'id' | 'type' | 'parentId' | 'position' | 'rotation'
> &
  Partial<PartJSON>

export interface WireJSON {
  id: string
  color: string
  partOneId: string
  partTwoId: string
  height?: number
  showCurrents?: boolean
}

export interface CircuitJSON {
  parts: PartJSON[]
  wires: WireJSON[]
}

export interface CameraJSON {
  position: Vec3
  target: Vec3
}

export interface ProjectJSON {
  id: string
  name: string
  user_id?: string | null
  parent_id?: string | null
  featured?: boolean
  created_at?: string
  camera?: CameraJSON
  circuit: CircuitJSON
}

export interface PartError {
  code: string
  message: string
}

/** Parsed ngspice raw output, normalised to the shape the DataBus consumes. */
export interface SpiceVariable {
  name: string
  type: 'voltage' | 'current' | 'time' | 'frequency' | 'notype'
  data: number[]
}
export interface SpiceResult {
  dataType: 'real' | 'complex'
  variables: SpiceVariable[]
}
export interface SpiceFailure {
  errors: string[]
  warnings: string[]
}
