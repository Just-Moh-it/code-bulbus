import { action, makeObservable, observable } from 'mobx'
import * as THREE from 'three'
import { EditorCircuit } from './circuit'
import { History } from './history'
import { fitCameraToObjects } from './three-helpers'
import type { Orbit } from './three-helpers'
import type { EditorPart } from './part'
import type { CircuitJSON, PartType, ProjectJSON } from '#/sim/types'

export type StampType = PartType | 'wire'

export interface ProjectRow extends ProjectJSON {
  circuit: CircuitJSON
}

/** Top-level editor model: circuit + camera + selection + stamp + undo history. */
export class EditorProject {
  id: string
  user_id: string | null | undefined
  parent_id: string | null | undefined
  created_at: string | undefined
  featured: boolean | undefined
  circuit: EditorCircuit
  history: History<ProjectJSON>
  /** Fired after a user edit (history push) or a camera change — the only times the project should be persisted. */
  private saveListeners = new Set<() => void>()
  observable: {
    name: string
    stampType: StampType | null
    selection: EditorPart | null
    orbit: Orbit | null
    camera: { position: THREE.Vector3; target: THREE.Vector3 }
    hasChanges: boolean
  }

  constructor(row: ProjectRow) {
    this.id = row.id
    this.user_id = row.user_id
    this.parent_id = row.parent_id
    this.created_at = row.created_at
    this.featured = row.featured
    this.circuit = new EditorCircuit({ ...row.circuit, project: this })
    this.observable = {
      name: row.name,
      stampType: null,
      selection: null,
      orbit: null,
      camera: {
        position: new THREE.Vector3(
          row.camera?.position.x ?? -35,
          row.camera?.position.y ?? 15,
          row.camera?.position.z ?? -25,
        ),
        target: new THREE.Vector3(row.camera?.target.x ?? 0, 0, 0),
      },
      hasChanges: false,
    }
    makeObservable(this, {
      observable: observable,
      setName: action,
      setStampType: action,
      setSelection: action,
      setOrbit: action,
      updateCameraState: action,
      pushSnapshotToHistory: action,
      loadJSON: action,
    })
    this.history = new History<ProjectJSON>([row])
    this.history.onChange((ev) => {
      if ((ev.action === 'undo' || ev.action === 'redo') && ev.item)
        this.loadJSON(ev.item)
    })
  }

  get orbit() {
    return this.observable.orbit
  }
  get camera() {
    return this.observable.camera
  }
  get name() {
    return this.observable.name
  }
  get stampType() {
    return this.observable.stampType
  }
  get selection() {
    return this.observable.selection
  }
  get hasChanges() {
    return this.observable.hasChanges
  }

  setOrbit = (o: Orbit | null) => {
    if (this.observable.orbit !== o) this.observable.orbit = o
  }
  setName(s: string) {
    this.observable.name = s || 'Untitled'
  }
  setStampType(t: StampType | null) {
    this.observable.stampType = t
  }
  setSelection(p: EditorPart | null) {
    this.observable.selection = p
  }
  setCameraPosition(v: THREE.Vector3) {
    this.observable.camera.position = v
  }
  setCameraTarget(v: THREE.Vector3) {
    this.observable.camera.target = v
  }

  onSave(fn: () => void) {
    this.saveListeners.add(fn)
    return () => {
      this.saveListeners.delete(fn)
    }
  }
  private emitSave() {
    this.saveListeners.forEach((l) => l())
  }

  updateCameraState() {
    const o = this.orbit
    if (!o) return
    this.observable.camera.position = o.object.position.clone()
    this.observable.camera.target = o.target.clone()
    this.emitSave()
  }

  pushSnapshotToHistory() {
    this.history.push(this.toJSON())
    this.observable.hasChanges = true
    this.emitSave()
  }

  undo() {
    this.history.undo()
    this.emitSave()
  }
  redo() {
    this.history.redo()
    this.emitSave()
  }

  fitCamera() {
    if (!this.orbit) return
    const objects = this.circuit.parts
      .map((p) => p.object)
      .filter((o): o is THREE.Object3D => !!o)
    fitCameraToObjects(this.orbit, objects, 1)
    this.updateCameraState()
  }

  lookAtOnAxis(axis: 'x' | 'y' | 'z') {
    if (!this.orbit) return
    this.orbit.target = new THREE.Vector3()
    this.orbit.object.position.copy(
      new THREE.Vector3(
        axis === 'x' ? 100 : 0,
        axis === 'y' ? 100 : 0,
        axis === 'z' ? 100 : 0,
      ),
    )
    const objects = this.circuit.parts
      .map((p) => p.object)
      .filter((o): o is THREE.Object3D => !!o)
    fitCameraToObjects(this.orbit, objects, 1)
    this.updateCameraState()
  }

  /** Undo/redo target — camera is deliberately not restored. */
  loadJSON(j: ProjectJSON) {
    this.observable.name = j.name
    this.circuit.loadJSON(j.circuit)
  }

  toJSON(): ProjectJSON {
    const c = this.camera
    return {
      id: this.id,
      name: this.name,
      circuit: this.circuit.toJSON(),
      camera: {
        position: { x: c.position.x, y: c.position.y, z: c.position.z },
        target: { x: c.target.x, y: c.target.y, z: c.target.z },
      },
      parent_id: this.parent_id,
      user_id: this.user_id,
      created_at: this.created_at,
      featured: this.featured,
    }
  }
}
