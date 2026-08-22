import * as THREE from 'three'
import type { Dimensions } from '#/sim/types'

/**
 * Bounding box of `root`'s mesh descendants expressed in `root`'s local frame.
 *
 * Unlike `Box3.setFromObject` (world space) this is invariant to however the
 * part is positioned/rotated in the scene, so the result is a property of the
 * model alone. Troika `Text` is skipped: it sizes itself asynchronously and is
 * decoration, not the part's body. Returns null if nothing measurable exists.
 */
export function localBox(root: THREE.Object3D): THREE.Box3 | null {
  root.updateWorldMatrix(true, true)
  const rootInverse = root.matrixWorld.clone().invert()
  const box = new THREE.Box3()
  const tmp = new THREE.Box3()
  let found = false
  root.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh || isText(o) || !mesh.geometry.attributes.position) return
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox()
    tmp.copy(mesh.geometry.boundingBox!)
    tmp.applyMatrix4(rootInverse.clone().multiply(mesh.matrixWorld))
    box.union(tmp)
    found = true
  })
  return found ? box : null
}

function isText(o: THREE.Object3D) {
  return (
    (o as { isTroikaText?: boolean }).isTroikaText === true ||
    o.constructor.name === 'Text'
  )
}

/** Per-axis scale that maps `box` onto `dimensions`; null if the box has a zero extent. */
export function scaleToFit(
  box: THREE.Box3,
  dimensions: Dimensions,
): THREE.Vector3 | null {
  const size = box.getSize(new THREE.Vector3())
  if (!(size.x > 0 && size.y > 0 && size.z > 0)) return null
  return new THREE.Vector3(
    dimensions.width / size.x,
    dimensions.height / size.y,
    dimensions.depth / size.z,
  )
}
