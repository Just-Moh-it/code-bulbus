import { action, makeObservable, observable } from 'mobx'
import * as THREE from 'three'
import { EditorTerminal } from './terminal'
import { fitCameraToObjects, withTemporaryTransform } from './three-helpers'
import type { EditorCircuit } from './circuit'
import { mg } from '#/sim/types'
import type {
  Dimensions,
  PartJSON,
  PartType,
  TerminalDefinition,
  TerminalJSON,
} from '#/sim/types'

export interface EditorPartInit extends Partial<PartJSON> {
  circuit: EditorCircuit
  parentId: string | null
  position: { x: number; y: number; z: number }
  rotation: number
}

export interface Snap {
  terminal: EditorTerminal
  target: EditorTerminal
  distance: number
  offset: THREE.Vector3
}

/**
 * Editor-side part model (scene placement, parenting, snapping, serialisation).
 * Subclasses add per-type fields and declare static `type`, `dimensions`, `eligibleParents`.
 */
export abstract class EditorPart {
  static type: PartType
  static dimensions: Dimensions
  static eligibleParents: Set<PartType> = new Set()
  static dragSurfaceHeight?: number

  observable: {
    id: string
    parent: EditorPart | null
    circuit: EditorCircuit
    position: THREE.Vector3
    rotation: number
    showLabels: boolean
    showVoltages: boolean
    container: THREE.Object3D | null
    object: THREE.Object3D | null
    selectionBox: THREE.Object3D | null
  }
  terminals: EditorTerminal[] = []
  topTerminals: EditorTerminal[] = []
  bottomTerminals: EditorTerminal[] = []
  terminalsByName: Record<string, EditorTerminal> = {}

  constructor(j: EditorPartInit) {
    this.observable = {
      id: j.id ?? crypto.randomUUID(),
      parent: (j.parentId && j.circuit.partsById[j.parentId]) || null,
      circuit: j.circuit,
      position: new THREE.Vector3(j.position.x, j.position.y, j.position.z),
      rotation: j.rotation,
      showLabels: j.showLabels ?? false,
      showVoltages: j.showVoltages ?? false,
      container: null,
      object: null,
      selectionBox: null,
    }
    makeObservable(this, {
      observable: observable,
      setParent: action,
      setContainer: action,
      setObject: action,
      setSelectionBox: action,
      setPosition: action,
      setRotation: action,
      setShowLabels: action,
      setShowVoltages: action,
      rotate: action,
      loadJSON: action,
    })
    this.init(j)
  }

  /** Subclasses read their own fields then call super.init. */
  protected init(j: EditorPartInit) {
    this.initTerminals(j.terminals ?? [])
  }

  protected initTerminals(saved: TerminalJSON[]) {
    const byName = Object.fromEntries(saved.map((t) => [t.name, t]))
    this.terminals = this.terminalDefinitions.map(
      (def) =>
        new EditorTerminal({
          ...def,
          part: this,
          connections: byName[def.name]?.connections,
        }),
    )
    this.topTerminals = this.terminals.filter((t) => t.surface === 'top')
    this.bottomTerminals = this.terminals.filter((t) => t.surface === 'bottom')
    this.terminalsByName = Object.fromEntries(
      this.terminals.map((t) => [t.name, t]),
    )
  }

  abstract get terminalDefinitions(): TerminalDefinition[]

  // ------------------------------------------------------------------ getters
  get ctor() {
    return this.constructor as typeof EditorPart
  }
  get id() {
    return this.observable.id
  }
  get type(): PartType {
    return this.ctor.type
  }
  get circuit() {
    return this.observable.circuit
  }
  get parent() {
    return this.observable.parent
  }
  get container() {
    return this.observable.container
  }
  get object() {
    return this.observable.object
  }
  get selectionBox() {
    return this.observable.selectionBox
  }
  get position() {
    return this.observable.position
  }
  get rotation() {
    return this.observable.rotation
  }
  get showLabels() {
    return this.observable.showLabels
  }
  get showVoltages() {
    return this.observable.showVoltages
  }
  get dimensions(): Dimensions {
    return this.ctor.dimensions
  }
  get dragSurfaceHeight() {
    return this.ctor.dragSurfaceHeight ?? this.dimensions.height
  }
  get eligibleParents() {
    return this.ctor.eligibleParents
  }
  /**
   * World transform derived purely from the model (position/rotation through the
   * parent chain). Anything that must agree with the model mid-interaction
   * (wires, snapping) reads this, never a three.js object, so it is correct
   * before the scene mounts and during animation.
   */
  get worldTransform(): { position: THREE.Vector3; rotationY: number } {
    const parent = this.parent
    if (!parent)
      return { position: this.position.clone(), rotationY: this.rotation }
    const pt = parent.worldTransform
    const local = this.position
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), pt.rotationY)
    return {
      position: pt.position.add(local),
      rotationY: pt.rotationY + this.rotation,
    }
  }
  get worldPosition() {
    return this.worldTransform.position
  }

  /** World position of the rendered container (three.js); only for picking/measuring. */
  get positionWorld() {
    return this.container
      ? this.container.getWorldPosition(new THREE.Vector3())
      : new THREE.Vector3()
  }
  get isReady() {
    return !!this.container && !(this.parent && !this.parent.container)
  }
  /** XZ footprint of the rendered object. */
  get box2() {
    const b = new THREE.Box2()
    if (!this.object) return b
    const b3 = new THREE.Box3().setFromObject(this.object)
    b.min.set(b3.min.x, b3.min.z)
    b.max.set(b3.max.x, b3.max.z)
    return b
  }
  /** Highest eligible parent whose footprint intersects ours and sits at/below us. */
  get topmostIntersectingPart(): EditorPart | null {
    const myY = this.positionWorld.y
    let best: EditorPart | null = null
    let bestY = -100
    for (const p of this.circuit.parts) {
      if (
        p === this ||
        !this.eligibleParents.has(p.type) ||
        !this.intersects(p)
      )
        continue
      const y = p.positionWorld.y
      if (y <= myY + 1e-4 && y > bestY) {
        best = p
        bestY = y
      }
    }
    return best
  }

  // ------------------------------------------------------------------ setters
  setContainer(o: THREE.Object3D | null) {
    if (this.observable.container !== o) this.observable.container = o
  }
  setObject(o: THREE.Object3D | null) {
    if (this.observable.object !== o) this.observable.object = o
  }
  setSelectionBox(o: THREE.Object3D | null) {
    if (this.observable.selectionBox !== o) this.observable.selectionBox = o
  }
  setShowLabels(b: boolean) {
    this.observable.showLabels = b
  }
  setShowVoltages(b: boolean) {
    this.observable.showVoltages = b
  }
  setX(x: number) {
    this.setPosition(new THREE.Vector3(x, this.position.y, this.position.z))
  }
  setZ(z: number) {
    this.setPosition(new THREE.Vector3(this.position.x, this.position.y, z))
  }
  setY(y: number) {
    this.observable.position.y = y
  }

  rotate(delta: number) {
    this.setRotation(this.rotation + delta)
  }

  setRotation(y: number, opts: { shouldUpdateConnections?: boolean } = {}) {
    const { shouldUpdateConnections = true } = opts
    withTemporaryTransform(this.container, ({ setRotation }) => {
      setRotation(new THREE.Euler(0, y, 0))
      const top = this.topmostIntersectingPart
      if (top !== this.parent) this.setParent(top)
      else this.observable.rotation = y
      if (shouldUpdateConnections) this.updateConnections()
    })
  }

  setPosition(
    v: THREE.Vector3,
    opts: { shouldSnap?: boolean; shouldUpdateConnections?: boolean } = {},
  ) {
    const { shouldSnap = true, shouldUpdateConnections = true } = opts
    withTemporaryTransform(this.container, ({ setPosition }) => {
      setPosition(v)
      if (shouldSnap) {
        const s = this.getSnap()
        if (s) {
          v.sub(s.offset)
          setPosition(v)
        }
      }
      const top = this.topmostIntersectingPart
      if (top !== this.parent) this.setParent(top)
      else
        this.observable.position = new THREE.Vector3(v.x, this.position.y, v.z)
      if (shouldUpdateConnections) this.updateConnections()
    })
  }

  /** Re-parent in the scene graph, preserving world transform; y snaps to the parent's drag surface. */
  setParent(p: EditorPart | null) {
    if (p === this.parent || p === this) return
    const container = this.container
    if (!container) {
      this.observable.parent = p
      return
    }
    const root = this.circuit.root
    const prev = container.parent
    if (p === null) {
      this.observable.parent = null
      root?.attach(container)
    } else {
      this.observable.parent = p
      p.container?.attach(container)
    }
    const rotY = container.rotation.clone().reorder('YZX').y
    const pos = container.position.clone()
    prev?.attach(container)
    pos.y = p ? p.dragSurfaceHeight : 0
    this.observable.rotation = rotY
    this.observable.position = pos
  }

  updateConnections() {
    this.bottomTerminals.forEach((t) => t.updateConnections())
  }

  intersects(other: EditorPart) {
    return this.box2.intersectsBox(other.box2)
  }

  /** Nearest bottom→top terminal pair within 0.68 grid units, if any. */
  getSnap(): Snap | null {
    const parent = this.parent
    if (!parent) return null
    for (const b of this.bottomTerminals) {
      for (const t of parent.topTerminals) {
        const d = b.distanceTo(t)
        if (d < 0.68 * mg)
          return {
            terminal: b,
            target: t,
            distance: d,
            offset: b.offsetFrom(t),
          }
      }
    }
    return null
  }

  fitCamera(scale?: number) {
    const d = this.dimensions
    const s = 4 / Math.sqrt(Math.max(d.width, d.depth, d.height))
    const project = this.circuit.project
    if (project.orbit && this.object) {
      fitCameraToObjects(project.orbit, [this.object], scale ?? s)
      project.updateCameraState()
    }
  }

  lookAtOnAxis(axis: 'x' | 'y' | 'z', scale?: number) {
    const d = this.dimensions
    const s = 4 / Math.sqrt(Math.max(d.width, d.depth, d.height))
    const dir = new THREE.Vector3(
      axis === 'x' ? 100 : 0,
      axis === 'y' ? 100 : 0,
      axis === 'z' ? 100 : 0,
    )
    const project = this.circuit.project
    if (project.orbit && this.object) {
      project.orbit.target = new THREE.Vector3()
      project.orbit.object.position.copy(dir)
      fitCameraToObjects(project.orbit, [this.object], scale ?? s)
      project.updateCameraState()
    }
  }

  /** Remove this part and everything parented to it. */
  delete() {
    this.circuit.parts
      .filter((p) => p.parent?.id === this.id)
      .forEach((p) => p.delete())
    this.circuit.wires
      .filter((w) => w.partOne === this || w.partTwo === this)
      .forEach((w) => w.delete())
    delete this.circuit.data.partsById[this.id]
  }

  loadJSON(j: PartJSON) {
    this.observable.parent =
      (j.parentId && this.circuit.partsById[j.parentId]) || null
    this.observable.position = new THREE.Vector3(
      j.position.x,
      j.position.y,
      j.position.z,
    )
    this.observable.rotation = j.rotation
    this.observable.showLabels = j.showLabels ?? false
    this.observable.showVoltages = j.showVoltages ?? false
    j.terminals?.forEach((t) => this.terminalsByName[t.name]?.loadJSON(t))
  }

  toJSON(): PartJSON {
    return {
      type: this.type,
      id: this.id,
      parentId: this.parent?.id ?? null,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      rotation: this.rotation,
      terminals: this.bottomTerminals.map((t) => t.toJSON()),
      showLabels: this.showLabels,
      showVoltages: this.showVoltages,
    }
  }
}
