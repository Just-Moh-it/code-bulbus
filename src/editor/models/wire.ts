import { action, makeObservable, observable } from 'mobx'
import type { EditorCircuit } from './circuit'
import type { EditorPart } from './part'
import type { WireJSON } from '#/sim/types'

export const WIRE_COLORS = [
  { value: 'Crimson', label: 'Red' },
  { value: 'DarkOrange', label: 'Orange' },
  { value: 'Gold', label: 'Yellow' },
  { value: 'MediumSeaGreen', label: 'Green' },
  { value: 'DeepSkyBlue', label: 'Blue' },
  { value: 'MediumOrchid', label: 'Purple' },
  { value: 'Black', label: 'Black' },
  { value: 'White', label: 'White' },
] as const

export const WIRE_HEIGHTS = [
  { value: 1, label: 'Short' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Tall' },
] as const

export class EditorWire {
  static type = 'wire' as const

  id: string
  circuit: EditorCircuit
  partOne: EditorPart
  partTwo: EditorPart
  observable: { color: string; height: number; showCurrents: boolean }

  constructor(
    j: Partial<WireJSON> & {
      circuit: EditorCircuit
      partOneId: string
      partTwoId: string
      color: string
    },
  ) {
    this.id = j.id ?? crypto.randomUUID()
    this.circuit = j.circuit
    this.partOne = j.circuit.getPartById(j.partOneId)
    this.partTwo = j.circuit.getPartById(j.partTwoId)
    this.observable = {
      color: j.color,
      height: j.height ?? 2,
      showCurrents: j.showCurrents ?? false,
    }
    makeObservable(this, {
      observable: observable,
      setColor: action,
      setShowCurrents: action,
      setHeight: action,
      loadJSON: action,
    })
  }

  get color() {
    return this.observable.color
  }
  get height() {
    return this.observable.height
  }
  get showCurrents() {
    return this.observable.showCurrents
  }

  setColor(c: string) {
    this.observable.color = c
  }
  setShowCurrents(b: boolean) {
    this.observable.showCurrents = b
  }
  setHeight(h: number) {
    this.observable.height = h
  }

  loadJSON(j: WireJSON) {
    this.id = j.id
    this.partOne = this.circuit.getPartById(j.partOneId)
    this.partTwo = this.circuit.getPartById(j.partTwoId)
    this.observable.color = j.color
    this.observable.height = j.height ?? 2
    this.observable.showCurrents = j.showCurrents ?? false
  }

  toJSON(): WireJSON {
    return {
      id: this.id,
      partOneId: this.partOne.id,
      partTwoId: this.partTwo.id,
      color: this.color,
      height: this.height,
      showCurrents: this.showCurrents,
    }
  }
}
