import { Part } from '../part'
import { raspberryPiDimensions, raspberryPiTerminals } from '../defs'
import { PartType } from '../types'

/** Connectivity-only in the reference (no emulation); 2×20 header pins. */
export class RaspberryPi extends Part {
  static type = PartType.RaspberryPi
  static dimensions = raspberryPiDimensions

  get terminalDefinitions() {
    return raspberryPiTerminals
  }
}
