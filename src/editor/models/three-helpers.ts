import * as THREE from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'

export type Orbit = OrbitControlsImpl

/** Move the orbit camera so `objects` fill the view (reference `fitCameraToObjects`). */
export function fitCameraToObjects(
  orbit: Orbit,
  objects: THREE.Object3D[],
  scale = 1,
) {
  const cam = orbit.object as THREE.PerspectiveCamera
  const box = new THREE.Box3()
  const size = new THREE.Vector3()
  const center = new THREE.Vector3()
  for (const o of objects) box.expandByObject(o)
  box.getSize(size)
  box.getCenter(center)
  const d =
    Math.max(size.x, size.y, size.z) /
    (2 * Math.atan((Math.PI * cam.fov) / 360))
  const d2 = d / cam.aspect
  const dist = scale * Math.max(d, d2)
  const offset = orbit.target
    .clone()
    .sub(cam.position)
    .normalize()
    .multiplyScalar(dist)
  orbit.target.copy(center)
  cam.updateProjectionMatrix()
  cam.position.copy(orbit.target).sub(offset)
  orbit.update()
}

/** Apply a transform, run `fn`, then restore the original transform. */
export function withTemporaryTransform(
  obj: THREE.Object3D | null,
  fn: (api: {
    setPosition: (v: THREE.Vector3) => void
    setRotation: (e: THREE.Euler) => void
  }) => void,
) {
  if (!obj) {
    fn({ setPosition: () => {}, setRotation: () => {} })
    return
  }
  const pos = obj.position.clone()
  const rot = obj.rotation.clone()
  try {
    fn({
      setPosition: (v) => {
        obj.position.copy(v)
        obj.updateWorldMatrix(false, true)
      },
      setRotation: (e) => {
        obj.rotation.copy(e)
        obj.updateWorldMatrix(false, true)
      },
    })
  } finally {
    obj.position.copy(pos)
    obj.rotation.copy(rot)
    obj.updateWorldMatrix(false, true)
  }
}
