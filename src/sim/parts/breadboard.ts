import { Part } from '../part'
import { breadboardDimensions, breadboardTerminals } from '../defs'
import { PartType } from '../types'

/** Pure connectivity: rails and 5-hole strips are implicit groups. Emits no netlist. */
export class Breadboard extends Part {
  static type = PartType.Breadboard
  static dimensions = breadboardDimensions

  get terminalDefinitions() {
    return breadboardTerminals
  }
}
