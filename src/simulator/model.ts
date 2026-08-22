import { action, makeObservable, observable } from 'mobx'
import * as THREE from 'three'
import { Circuit } from '#/sim'
import type { Part } from '#/sim/part'
import { fitCameraToObjects } from '#/editor/models/three-helpers'
import type { Orbit } from '#/editor/models/three-helpers'
import type { ProjectJSON } from '#/sim/types'

/**
 * Viewer-side wrapper around the simulation `Circuit`: name/camera/selection/orbit
 * plus camera helpers. Mirrors the reference `Simulator` (module 641 `e3`).
 */
export class Simulator {
  readonly id: string
  readonly name: string
  readonly user_id: string | null | undefined
  readonly parent_id: string | null | undefined
  readonly created_at: string | undefined
  readonly featured: boolean | undefined
  readonly circuit: Circuit
  readonly camera: { position: THREE.Vector3; target: THREE.Vector3 }
  observable: {
    orbit: Orbit | null
    selection: Part | null
    errors: string[]
    warnings: string[]
  }

  constructor(json: ProjectJSON) {
    this.id = json.id
    this.name = json.name
    this.user_id = json.user_id
    this.parent_id = json.parent_id
    this.created_at = json.created_at
    this.featured = json.featured
    this.observable = { orbit: null, selection: null, errors: [], warnings: [] }
    this.circuit = new Circuit(json.circuit, {
      onError: (m) => this.observable.errors.push(m),
      onWarning: (m) => this.observable.warnings.push(m),
    })
    this.camera = {
      position: new THREE.Vector3(
        json.camera?.position.x ?? -35,
        json.camera?.position.y ?? 15,
        json.camera?.position.z ?? -25,
      ),
      target: new THREE.Vector3(
        json.camera?.target.x ?? 0,
        json.camera?.target.y ?? 0,
        json.camera?.target.z ?? 0,
      ),
    }
    makeObservable(this, {
      observable: observable,
      setOrbit: action,
      setSelection: action,
      clearMessages: action,
    })
  }

  get orbit() {
    return this.observable.orbit
  }
  get selection() {
    return this.observable.selection
  }

  setOrbit = (o: Orbit | null) => {
    if (this.observable.orbit !== o) this.observable.orbit = o
  }
  setSelection = (p: Part | null) => {
    this.observable.selection = p
  }
  clearMessages() {
    this.observable.errors = []
    this.observable.warnings = []
  }

  private objects() {
    return this.circuit.parts
      .map((p) => p.object)
      .filter((o): o is THREE.Object3D => !!o)
  }

  fitCamera() {
    if (this.orbit) fitCameraToObjects(this.orbit, this.objects(), 1)
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
    fitCameraToObjects(this.orbit, this.objects(), 1)
  }

  fitCameraTo(part: Part, scale?: number) {
    const d = part.dimensions
    const s = 4 / Math.sqrt(Math.max(d.width, d.depth, d.height))
    if (this.orbit && part.object)
      fitCameraToObjects(this.orbit, [part.object], scale ?? s)
  }

  lookAtPartOnAxis(part: Part, axis: 'x' | 'y' | 'z') {
    if (!this.orbit || !part.object) return
    const d = part.dimensions
    const s = 4 / Math.sqrt(Math.max(d.width, d.depth, d.height))
    this.orbit.target = new THREE.Vector3()
    this.orbit.object.position.copy(
      new THREE.Vector3(
        axis === 'x' ? 100 : 0,
        axis === 'y' ? 100 : 0,
        axis === 'z' ? 100 : 0,
      ),
    )
    fitCameraToObjects(this.orbit, [part.object], s)
  }
}
