import { Part } from '../part'
import { wireEndDimensions, wireEndTerminals } from '../defs'
import { PartType } from '../types'

/** One end of a wire. Its single terminal plugs into a parent's terminal. */
export class WireEnd extends Part {
  static type = PartType.WireEnd
  static dimensions = wireEndDimensions

  get terminalDefinitions() {
    return wireEndTerminals
  }

  get wire() {
    return this.circuit.wires.find(
      (w) => w.partOne.id === this.id || w.partTwo.id === this.id,
    )
  }
}
