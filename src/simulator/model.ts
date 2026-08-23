import { action, makeObservable, observable } from 'mobx'
import * as THREE from 'three'
import { Circuit } from '#/sim'
import type { Part } from '#/sim/part'
import { fitCameraToObjects } from '#/editor/models/three-helpers'
import type { Orbit } from '#/editor/models/three-helpers'
import type { ProjectJSON } from '#/sim/types'

/** Registry keys: `<partId>` = container group, `<partId>:object` = inner object. */
export const objectKey = (
  part: Part,
  kind: 'container' | 'object' = 'container',
) => (kind === 'container' ? part.id : `${part.id}:${kind}`)

const axisVector = (axis: 'x' | 'y' | 'z') =>
  new THREE.Vector3(
    axis === 'x' ? 100 : 0,
    axis === 'y' ? 100 : 0,
    axis === 'z' ? 100 : 0,
  )

/**
 * Viewer-side wrapper around the simulation `Circuit`: name/camera/selection/orbit,
 * camera helpers, and an observable registry of mounted scene objects.
 *
 * The engine (`src/sim`) knows nothing about three.js. Views register their
 * objects here so visibility/camera logic derives from observable state
 * instead of from ref timing.
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
  /** Mounted scene objects, see `objectKey`. */
  readonly objects = observable.map<string, THREE.Object3D>()
  observable: {
    orbit: Orbit | null
    selection: Part | null
    running: boolean
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
    this.observable = {
      orbit: null,
      selection: null,
      running: false,
      errors: [],
      warnings: [],
    }
    this.circuit = new Circuit(json.circuit, {
      onError: (m) => this.pushMessage('errors', m),
      onWarning: (m) => this.pushMessage('warnings', m),
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
      setObject: action,
      setRunning: action,
      pushMessage: action,
      clearMessages: action,
    })
  }

  get orbit() {
    return this.observable.orbit
  }
  get selection() {
    return this.observable.selection
  }
  get running() {
    return this.observable.running
  }

  setOrbit = (o: Orbit | null) => {
    if (this.observable.orbit !== o) this.observable.orbit = o
  }
  setSelection = (p: Part | null) => {
    this.observable.selection = p
  }
  setObject = (key: string, o: THREE.Object3D | null) => {
    if (o) this.objects.set(key, o)
    else this.objects.delete(key)
  }
  setRunning(v: boolean) {
    this.observable.running = v
  }
  pushMessage(kind: 'errors' | 'warnings', m: string) {
    this.observable[kind].push(m)
  }
  clearMessages() {
    this.observable.errors = []
    this.observable.warnings = []
  }

  /** Start/stop the engine and mirror its running flag observably. */
  start() {
    this.setRunning(true)
    // debugging hook for headless probes (dev only)
    if (import.meta.env.DEV) (globalThis as unknown as { __bulbusSim?: Simulator }).__bulbusSim = this
    void this.circuit.start().finally(() => this.setRunning(false))
  }
  stop() {
    this.circuit.stop()
    this.setRunning(false)
  }

  container(part: Part) {
    return this.objects.get(objectKey(part)) ?? null
  }
  /** A part is drawable once its container and its parent's container exist. */
  isReady(part: Part) {
    return (
      this.objects.has(objectKey(part)) &&
      (!part.parent || this.objects.has(objectKey(part.parent)))
    )
  }

  private partObjects() {
    return this.circuit.parts
      .map((p) => this.objects.get(objectKey(p, 'object')))
      .filter((o): o is THREE.Object3D => !!o)
  }

  fitCamera() {
    if (this.orbit) fitCameraToObjects(this.orbit, this.partObjects(), 1)
  }

  lookAtOnAxis(axis: 'x' | 'y' | 'z') {
    if (!this.orbit) return
    this.orbit.target = new THREE.Vector3()
    this.orbit.object.position.copy(axisVector(axis))
    fitCameraToObjects(this.orbit, this.partObjects(), 1)
  }

  fitCameraTo(part: Part, scale?: number) {
    const o = this.objects.get(objectKey(part, 'object'))
    const d = part.dimensions
    const s = 4 / Math.sqrt(Math.max(d.width, d.depth, d.height))
    if (this.orbit && o) fitCameraToObjects(this.orbit, [o], scale ?? s)
  }

  lookAtPartOnAxis(part: Part, axis: 'x' | 'y' | 'z') {
    const o = this.objects.get(objectKey(part, 'object'))
    if (!this.orbit || !o) return
    const d = part.dimensions
    const s = 4 / Math.sqrt(Math.max(d.width, d.depth, d.height))
    this.orbit.target = new THREE.Vector3()
    this.orbit.object.position.copy(axisVector(axis))
    fitCameraToObjects(this.orbit, [o], s)
  }
}
