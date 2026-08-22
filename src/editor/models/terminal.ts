import { action, makeObservable, observable } from 'mobx'
import * as THREE from 'three'
import type { EditorPart } from './part'
import { mg } from '#/sim/types'
import type { TerminalDefinition, TerminalJSON } from '#/sim/types'

export interface EditorTerminalInit extends TerminalDefinition {
  part: EditorPart
  connections?: string[]
}

/** Editor-side terminal: tracks its scene object and which parent terminals it is plugged into. */
export class EditorTerminal {
  readonly surface: TerminalDefinition['surface']
  readonly type: TerminalDefinition['type']
  readonly name: string
  readonly part: EditorPart
  observable: {
    object: THREE.Object3D | null
    connections: string[]
    position: THREE.Vector3
    label: string | undefined
  }

  constructor(def: EditorTerminalInit) {
    this.surface = def.surface
    this.type = def.type
    this.name = def.name
    this.part = def.part
    this.observable = {
      object: null,
      connections: def.connections ?? [],
      position: new THREE.Vector3(
        def.position.x,
        def.position.y,
        def.position.z,
      ),
      label: def.label,
    }
    makeObservable(this, {
      observable: observable,
      setObject: action,
      setPosition: action,
      setLabel: action,
      updateConnections: action,
      loadJSON: action,
    })
  }

  get id() {
    return `${this.part.id}:${this.name}`
  }
  get position() {
    return this.observable.position
  }
  get connections() {
    return this.observable.connections
  }
  get object() {
    return this.observable.object
  }
  get label() {
    return this.observable.label
  }
  get positionWorld() {
    return this.object
      ? this.object.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3()
  }

  setObject(o: THREE.Object3D | null) {
    if (this.observable.object !== o) this.observable.object = o
  }
  setLabel(s: string | undefined) {
    this.observable.label = s
  }
  setPosition(v: THREE.Vector3) {
    this.observable.position = v
  }

  /** Connected to every parent top-terminal within 0.33 grid units (XZ). */
  updateConnections() {
    const parent = this.part.parent
    this.observable.connections = parent
      ? parent.topTerminals
          .filter((t) => this.distanceTo(t) < 0.33 * mg)
          .map((t) => t.name)
      : []
  }

  distanceTo(other: EditorTerminal) {
    const a = this.positionWorld
    const b = other.positionWorld
    return Math.hypot(a.x - b.x, a.z - b.z)
  }

  offsetFrom(other: EditorTerminal) {
    const space = this.part.container?.parent
    const a = this.positionWorld
    const b = other.positionWorld
    if (!space) return a.sub(b)
    return space.worldToLocal(a).sub(space.worldToLocal(b))
  }

  loadJSON(j: TerminalJSON) {
    this.observable.connections = j.connections
  }

  toJSON(): TerminalJSON {
    return { name: this.name, connections: this.connections }
  }
}
