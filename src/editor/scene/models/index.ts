import { useGLTF } from '@react-three/drei'
import type { PartType } from '#/sim/types'

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
export { Lcd1602Model } from './lcd1602'
export { PotentiometerModel } from './potentiometer'
export type { KnobHandle } from './potentiometer'
export { Tmp36Model } from './tmp36'
export type { LcdHandle } from './lcd1602'
export { mapRange, resistorBands } from './util'

/** Which GLB each part type needs; parts without an entry are drawn procedurally. */
export const MODEL_URL_BY_TYPE: Partial<Record<PartType, string>> = {
  'arduino-uno': '/arduino-uno.glb',
  'raspberry-pi': '/rpi.glb',
  breadboard: '/breadboard.glb',
  battery: '/battery.glb',
  capacitor: '/capacitor.glb',
  led: '/led.glb',
  motor: '/motor.glb',
  resistor: '/resistor.glb',
  'tactile-switch': '/switch.glb',
  timer: '/8-pin-ic.glb',
  '8-pin-chip': '/8-pin-ic.glb',
  'npn-transistor': '/bjt-transistor.glb',
  'pnp-transistor': '/bjt-transistor.glb',
}

/** Every model, for warming the palette. */
export const MODEL_URLS = [...new Set(Object.values(MODEL_URL_BY_TYPE))]

/**
 * Warm models. Pass the project's part types to fetch only what the scene
 * needs: the 2.5 MB Arduino should not be queueing behind models (rpi, motor)
 * this circuit never shows.
 */
export function preloadModels(types?: PartType[]) {
  const urls = types
    ? [...new Set(types.map((t) => MODEL_URL_BY_TYPE[t]).filter(Boolean))]
    : MODEL_URLS
  urls.forEach((u) => useGLTF.preload(u as string))
}
