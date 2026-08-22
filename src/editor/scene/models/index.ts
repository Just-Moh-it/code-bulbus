import { useGLTF } from '@react-three/drei'

export { ArduinoUnoModel } from './arduino-uno'
export type { IntensityHandle } from './arduino-uno'
export { BatteryModel } from './battery'
export { BreadboardModel } from './breadboard'
export { CapacitorModel } from './capacitor'
export { EightPinChipModel, TimerModel } from './chip'
export { LedModel } from './led'
export { MotorModel } from './motor'
export type { SpeedHandle } from './motor'
export { TransistorModel } from './transistor'
export { RaspberryPiModel } from './rpi'
export { ResistorModel } from './resistor'
export { TactileSwitchModel } from './switch'
export { WireEndModel } from './wire-end'
export { mapRange, resistorBands } from './util'

/** Warm every model so adding a part never suspends the scene. */
export const MODEL_URLS = [
  '/8-pin-ic.glb',
  '/arduino-uno.glb',
  '/battery.glb',
  '/bjt-transistor.glb',
  '/breadboard.glb',
  '/capacitor.glb',
  '/led.glb',
  '/motor.glb',
  '/resistor.glb',
  '/rpi.glb',
  '/switch.glb',
]
export function preloadModels() {
  MODEL_URLS.forEach((u) => useGLTF.preload(u))
}
