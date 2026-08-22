import { describe, expect, test } from 'bun:test'
import * as THREE from 'three'
import { localBox, scaleToFit } from './fit'

const dims = { width: 2, height: 4, depth: 6 }

function boxMesh(w: number, h: number, d: number) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d))
}

describe('localBox', () => {
  test('is independent of how the parent is rotated/positioned', () => {
    const parent = new THREE.Group()
    const root = new THREE.Group()
    parent.add(root)
    root.add(boxMesh(1, 2, 3))
    const a = localBox(root)!.getSize(new THREE.Vector3())
    parent.rotation.y = Math.PI / 2
    parent.position.set(10, 5, -3)
    const b = localBox(root)!.getSize(new THREE.Vector3())
    expect(a.toArray().map((v) => +v.toFixed(6))).toEqual([1, 2, 3])
    expect(b.toArray().map((v) => +v.toFixed(6))).toEqual([1, 2, 3])
  })

  test('includes child transforms inside the root', () => {
    const root = new THREE.Group()
    const inner = new THREE.Group()
    inner.scale.setScalar(0.5)
    inner.rotation.x = Math.PI / 2 // swaps y and z
    inner.add(boxMesh(1, 2, 3))
    root.add(inner)
    const s = localBox(root)!.getSize(new THREE.Vector3())
    expect(s.toArray().map((v) => +v.toFixed(6))).toEqual([0.5, 1.5, 1])
  })

  test('ignores troika Text and returns null for empty models', () => {
    const root = new THREE.Group()
    const text = new THREE.Mesh(new THREE.PlaneGeometry(100, 100))
    ;(text as unknown as { isTroikaText: boolean }).isTroikaText = true
    root.add(text)
    expect(localBox(root)).toBeNull()
    root.add(boxMesh(1, 1, 1))
    expect(localBox(root)!.getSize(new THREE.Vector3()).x).toBeCloseTo(1)
  })
})

describe('scaleToFit', () => {
  test('maps the box onto the canonical dimensions per axis', () => {
    const box = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 2, 3),
    )
    expect(scaleToFit(box, dims)!.toArray()).toEqual([2, 2, 2])
  })
  test('rejects degenerate boxes', () => {
    const flat = new THREE.Box3(new THREE.Vector3(), new THREE.Vector3(1, 0, 1))
    expect(scaleToFit(flat, dims)).toBeNull()
  })
})
