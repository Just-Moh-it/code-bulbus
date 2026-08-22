import { action, autorun, makeObservable } from 'mobx'
import * as THREE from 'three'
import { EditorPart } from './part'
import type { EditorPartInit } from './part'
import * as defs from '#/sim/defs'
import { PartType } from '#/sim/types'
import type { PartJSON, PartType as PartTypeT } from '#/sim/types'

export const DEFAULT_SKETCH = `void setup() {
  // put your setup code here, to run once:

}

void loop() {
  // put your main code here, to run repeatedly:

}
`

export type CompilationStatus =
  'not-compiled' | 'compiling' | 'success' | 'error'
export type SketchFiles = Record<
  string,
  { content: string; fileExtension: string; order: number }
>

const BB = new Set<PartTypeT>([PartType.Breadboard])

// ---------------------------------------------------------------- simple parts
export class BreadboardPart extends EditorPart {
  static type = PartType.Breadboard
  static dimensions = defs.breadboardDimensions
  get terminalDefinitions() {
    return defs.breadboardTerminals
  }
}

export class RaspberryPiPart extends EditorPart {
  static type = PartType.RaspberryPi
  static dimensions = defs.raspberryPiDimensions
  static dragSurfaceHeight = 0.2 * defs.raspberryPiDimensions.height
  get terminalDefinitions() {
    return defs.raspberryPiTerminals
  }
}

export class TimerPart extends EditorPart {
  static type = PartType.Timer
  static dimensions = defs.timerDimensions
  static eligibleParents = BB
  get terminalDefinitions() {
    return defs.timerTerminals
  }
}

export class MotorPart extends EditorPart {
  static type = PartType.Motor
  static dimensions = defs.motorDimensions
  static dragSurfaceHeight = 0.355 * defs.motorDimensions.height
  get terminalDefinitions() {
    return defs.motorTerminals
  }
}

export class WireEndPart extends EditorPart {
  static type = PartType.WireEnd
  static dimensions = defs.wireEndDimensions
  static eligibleParents = new Set<PartTypeT>([
    PartType.Breadboard,
    PartType.RaspberryPi,
    PartType.Battery,
    PartType.ArduinoUno,
    PartType.Motor,
  ])
  get terminalDefinitions() {
    return defs.wireEndTerminals
  }
  get wire() {
    return this.circuit.wires.find(
      (w) => w.partOne.id === this.id || w.partTwo.id === this.id,
    )
  }
  /** Deleting one end removes the wire and both ends. */
  delete() {
    const wire = this.wire
    if (wire) {
      delete this.circuit.data.wiresById[wire.id]
      delete this.circuit.data.partsById[wire.partOne.id]
      delete this.circuit.data.partsById[wire.partTwo.id]
    } else {
      super.delete()
    }
  }
}

// ------------------------------------------------------------- valued parts
export class ResistorPart extends EditorPart {
  static type = PartType.Resistor
  static dimensions = defs.resistorDimensions
  static eligibleParents = BB
  declare kohm: number
  protected init(j: EditorPartInit) {
    this.kohm = j.kohm ?? 1
    makeObservable(this, { kohm: true, setKohm: action })
    super.init(j)
  }
  setKohm(v: number) {
    this.kohm = v
  }
  get terminalDefinitions() {
    return defs.resistorTerminals
  }
  loadJSON(j: PartJSON) {
    super.loadJSON(j)
    this.kohm = j.kohm ?? 1
  }
  toJSON() {
    return { ...super.toJSON(), kohm: this.kohm }
  }
}

export class TactileSwitchPart extends EditorPart {
  static type = PartType.TactileSwitch
  static dimensions = defs.tactileSwitchDimensions
  static eligibleParents = BB
  declare latching: boolean
  protected init(j: EditorPartInit) {
    this.latching = j.latching ?? false
    makeObservable(this, { latching: true, setLatching: action })
    super.init(j)
  }
  setLatching(v: boolean) {
    this.latching = v
  }
  get terminalDefinitions() {
    return defs.tactileSwitchTerminals
  }
  loadJSON(j: PartJSON) {
    super.loadJSON(j)
    this.latching = j.latching ?? false
  }
  toJSON() {
    return { ...super.toJSON(), latching: this.latching }
  }
}

export class BatteryPart extends EditorPart {
  static type = PartType.Battery
  static dimensions = defs.batteryDimensions
  static dragSurfaceHeight = 0.77 * defs.batteryDimensions.height
  declare voltage: number
  protected init(j: EditorPartInit) {
    this.voltage = j.voltage ?? 9
    makeObservable(this, { voltage: true, setVoltage: action })
    super.init(j)
  }
  setVoltage(v: number) {
    this.voltage = v
  }
  get terminalDefinitions() {
    return defs.batteryTerminals
  }
  loadJSON(j: PartJSON) {
    super.loadJSON(j)
    this.voltage = j.voltage ?? 9
  }
  toJSON() {
    return { ...super.toJSON(), voltage: this.voltage }
  }
}

export const LED_COLORS = [
  { value: 'Crimson', label: 'Red' },
  { value: 'DeepSkyBlue', label: 'Blue' },
  { value: 'MediumSeaGreen', label: 'Green' },
] as const

export class LedPart extends EditorPart {
  static type = PartType.Led
  static dimensions = defs.ledDimensions
  static eligibleParents = BB
  declare color: string
  protected init(j: EditorPartInit) {
    this.color = j.color ?? 'Crimson'
    makeObservable(this, { color: true, setColor: action })
    super.init(j)
  }
  setColor(c: string) {
    this.color = c
  }
  get terminalDefinitions() {
    return defs.ledTerminals
  }
  loadJSON(j: PartJSON) {
    super.loadJSON(j)
    this.color = j.color ?? 'Crimson'
  }
  toJSON() {
    return { ...super.toJSON(), color: this.color }
  }
}

abstract class TransistorPart extends EditorPart {
  static dimensions = defs.transistorDimensions
  static eligibleParents = BB
  declare model: string
  abstract get defaultModel(): string
  abstract terminalsFor(model: string): ReturnType<typeof defs.npnTerminals>
  protected init(j: EditorPartInit) {
    this.model = j.model ?? this.defaultModel
    makeObservable(this, { model: true, setModel: action })
    super.init(j)
    autorun(() => this.updateTerminals())
  }
  setModel(m: string) {
    this.model = m
  }
  /** Terminal positions depend on the model's pinout. */
  updateTerminals() {
    this.terminalDefinitions.forEach((def) => {
      this.terminalsByName[def.name]?.setPosition(
        new THREE.Vector3(def.position.x, def.position.y, def.position.z),
      )
    })
  }
  get terminalDefinitions() {
    return this.terminalsFor(this.model)
  }
  loadJSON(j: PartJSON) {
    super.loadJSON(j)
    this.model = j.model ?? this.defaultModel
  }
  toJSON() {
    return { ...super.toJSON(), model: this.model }
  }
}

export const NPN_MODEL_OPTIONS = ['2N2222', '2N3904'] as const
export const PNP_MODEL_OPTIONS = ['2N3906'] as const

export class NpnTransistorPart extends TransistorPart {
  static type = PartType.NpnTransistor
  get defaultModel() {
    return '2N3904'
  }
  terminalsFor(model: string) {
    return defs.npnTerminals(model)
  }
}

export class PnpTransistorPart extends TransistorPart {
  static type = PartType.PnpTransistor
  get defaultModel() {
    return '2N3906'
  }
  terminalsFor(model: string) {
    return defs.pnpTerminals(model)
  }
}

export class CapacitorPart extends EditorPart {
  static type = PartType.Capacitor
  static dimensions = defs.capacitorDimensions
  static eligibleParents = BB
  /** farads */
  declare capacitance: number
  protected init(j: EditorPartInit) {
    this.capacitance = typeof j.capacitance === 'number' ? j.capacitance : 1e-6
    makeObservable(this, { capacitance: true, setCapacitance: action })
    super.init(j)
  }
  setCapacitance(f: number) {
    this.capacitance = f
  }
  get terminalDefinitions() {
    return defs.capacitorTerminals
  }
  loadJSON(j: PartJSON) {
    super.loadJSON(j)
    this.capacitance = typeof j.capacitance === 'number' ? j.capacitance : 1e-6
  }
  toJSON() {
    return { ...super.toJSON(), capacitance: this.capacitance }
  }
}

export class ArduinoUnoPart extends EditorPart {
  static type = PartType.ArduinoUno
  static dimensions = defs.arduinoUnoDimensions
  static dragSurfaceHeight = 0.71 * defs.arduinoUnoDimensions.height
  declare files: SketchFiles
  declare compilationStatus: CompilationStatus
  declare compilationOutput: string
  declare hexFile: string
  protected init(j: EditorPartInit) {
    this.files = j.files ?? {
      'main.ino': { content: DEFAULT_SKETCH, fileExtension: '.ino', order: 0 },
    }
    this.compilationStatus = j.compilationStatus ?? 'not-compiled'
    this.compilationOutput = j.compilationOutput ?? ''
    this.hexFile = j.hexFile ?? ''
    makeObservable(this, {
      files: true,
      compilationStatus: true,
      compilationOutput: true,
      hexFile: true,
      setFiles: action,
      setCompilationStatus: action,
      setCompilationOutput: action,
      setHexFile: action,
    })
    super.init(j)
  }
  setFiles(f: SketchFiles) {
    this.files = f
  }
  setCompilationStatus(s: CompilationStatus) {
    this.compilationStatus = s
  }
  setCompilationOutput(s: string) {
    this.compilationOutput = s
  }
  setHexFile(h: string) {
    this.hexFile = h
  }
  get terminalDefinitions() {
    return defs.arduinoUnoTerminals
  }
  // reference: files are NOT restored by undo
  toJSON() {
    return {
      ...super.toJSON(),
      files: this.files,
      hexFile: this.hexFile,
      compilationStatus: this.compilationStatus,
      compilationOutput: this.compilationOutput,
    }
  }
}

export class EightPinChipPart extends EditorPart {
  static type = PartType.EightPinChip
  static dimensions = defs.eightPinChipDimensions
  static eligibleParents = BB
  declare pinLabels: Record<string, string>
  declare subcktCode: string
  declare chipName: string
  protected init(j: EditorPartInit) {
    this.pinLabels = j.pinLabels ?? {
      1: '1',
      2: '2',
      3: '3',
      4: '4',
      5: '5',
      6: '6',
      7: '7',
      8: '8',
    }
    this.subcktCode = j.subcktCode ?? ''
    this.chipName = j.chipName ?? 'Untitled'
    makeObservable(this, {
      pinLabels: true,
      subcktCode: true,
      chipName: true,
      setPinLabel: action,
      setChipName: action,
      setSubcktCode: action,
    })
    super.init(j)
    autorun(() => {
      Object.entries(this.pinLabels).forEach(([name, label]) =>
        this.terminalsByName[name]?.setLabel(label),
      )
    })
  }
  setPinLabel(pin: string, label: string) {
    this.pinLabels = { ...this.pinLabels, [pin]: label }
  }
  setChipName(n: string) {
    this.chipName = n
  }
  setSubcktCode(c: string) {
    this.subcktCode = c
  }
  get terminalDefinitions() {
    return defs.eightPinChipTerminals.map((d) => ({
      ...d,
      label: this.pinLabels[d.name] || d.label,
    }))
  }
  loadJSON(j: PartJSON) {
    super.loadJSON(j)
    if (j.chipName !== undefined) this.chipName = j.chipName
    if (j.pinLabels !== undefined) this.pinLabels = j.pinLabels
  }
  toJSON() {
    return {
      ...super.toJSON(),
      chipName: this.chipName,
      pinLabels: this.pinLabels,
      subcktCode: this.subcktCode,
    }
  }
}

// ------------------------------------------------------------------ registry
export type PartManager = new (j: EditorPartInit) => EditorPart

export const partManagers: Record<PartTypeT, PartManager> = {
  [PartType.Breadboard]: BreadboardPart,
  [PartType.Resistor]: ResistorPart,
  [PartType.RaspberryPi]: RaspberryPiPart,
  [PartType.WireEnd]: WireEndPart,
  [PartType.TactileSwitch]: TactileSwitchPart,
  [PartType.Battery]: BatteryPart,
  [PartType.Led]: LedPart,
  [PartType.NpnTransistor]: NpnTransistorPart,
  [PartType.PnpTransistor]: PnpTransistorPart,
  [PartType.Capacitor]: CapacitorPart,
  [PartType.Timer]: TimerPart,
  [PartType.ArduinoUno]: ArduinoUnoPart,
  [PartType.Motor]: MotorPart,
  [PartType.EightPinChip]: EightPinChipPart,
}

export function getPartModule(
  type: PartTypeT,
): { Manager: PartManager } | null {
  const Manager = partManagers[type]
  return Manager ? { Manager } : null
}
