import { action, makeObservable, observable } from 'mobx'
import type * as THREE from 'three'
import { EditorWire } from './wire'
import type { EditorPart } from './part'
import type { EditorProject } from './project'
import { getPartModule } from './parts'
import { orderByParent } from '#/sim/circuit'
import type { CircuitJSON, PartInput, PartJSON, WireJSON } from '#/sim/types'

export interface ContextMenuState {
  x: number
  y: number
  part: EditorPart
}

/** Editor-side circuit: the bag of part/wire models plus scene root + context-menu state. */
export class EditorCircuit {
  project: EditorProject
  data: {
    partsById: Record<string, EditorPart>
    wiresById: Record<string, EditorWire>
    root: THREE.Object3D | null
    contextMenu: ContextMenuState | null
  }

  constructor(j: {
    project: EditorProject
    parts: PartJSON[]
    wires: WireJSON[]
  }) {
    this.project = j.project
    this.data = { partsById: {}, wiresById: {}, root: null, contextMenu: null }
    makeObservable(this, {
      data: observable,
      setRoot: action,
      addPart: action,
      addWire: action,
      setContextMenu: action,
      loadJSON: action,
    })
    const byId = Object.fromEntries(j.parts.map((p) => [p.id, p]))
    for (const id of orderByParent(j.parts)) this.addPart(byId[id])
    for (const w of j.wires) this.addWire(w)
  }

  get partsById() {
    return this.data.partsById
  }
  get wiresById() {
    return this.data.wiresById
  }
  get root() {
    return this.data.root
  }
  get contextMenu() {
    return this.data.contextMenu
  }
  get parts() {
    return Object.values(this.data.partsById)
  }
  get wires() {
    return Object.values(this.data.wiresById)
  }

  addPart(json: PartInput): EditorPart | null {
    const mod = getPartModule(json.type)
    if (!mod) return null
    const p = new mod.Manager({ ...json, circuit: this })
    this.data.partsById[p.id] = p
    return p
  }

  addWire(
    json: Partial<WireJSON> & {
      partOneId: string
      partTwoId: string
      color: string
    },
  ) {
    const w = new EditorWire({ ...json, circuit: this })
    this.data.wiresById[w.id] = w
    return w
  }

  setRoot(o: THREE.Object3D | null) {
    if (this.data.root !== o) this.data.root = o
  }
  setContextMenu(m: ContextMenuState | null) {
    this.data.contextMenu = m
  }
  getPartById(id: string) {
    return this.data.partsById[id]
  }
  getWireById(id: string) {
    return this.data.wiresById[id]
  }

  /** Reconcile with a snapshot (undo/redo): delete vanished parts, update or add the rest. */
  loadJSON(j: CircuitJSON) {
    const incoming = new Set(j.parts.map((p) => p.id))
    this.parts.filter((p) => !incoming.has(p.id)).forEach((p) => p.delete())
    const byId = Object.fromEntries(j.parts.map((p) => [p.id, p]))
    for (const id of orderByParent(j.parts)) {
      const existing = this.data.partsById[id]
      if (existing) existing.loadJSON(byId[id])
      else this.addPart(byId[id])
    }
    for (const w of j.wires) {
      const existing = this.data.wiresById[w.id]
      if (existing) existing.loadJSON(w)
      else this.addWire(w)
    }
  }

  toJSON(): CircuitJSON {
    return {
      parts: this.parts.map((p) => p.toJSON()),
      wires: this.wires.map((w) => w.toJSON()),
    }
  }
}
