import { memo, useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import * as THREE from 'three'
import type { Dimensions } from '#/sim/types'

export function measure(obj: THREE.Object3D): Dimensions {
  const b = new THREE.Box3().setFromObject(obj)
  return {
    width: b.max.x - b.min.x,
    height: b.max.y - b.min.y,
    depth: b.max.z - b.min.z,
  }
}

/** Scale `object` so its bounding box matches `dimensions` exactly. */
export function fitToDimensions(
  object: THREE.Object3D,
  dimensions: Dimensions,
) {
  const e = measure(object)
  // an empty/unloaded model measures 0 — leave it unscaled rather than producing Infinity/NaN
  if (!(e.width > 0 && e.height > 0 && e.depth > 0)) return object.scale.clone()
  const s = new THREE.Vector3(
    (dimensions.width / e.width) * object.scale.x,
    (dimensions.height / e.height) * object.scale.y,
    (dimensions.depth / e.depth) * object.scale.z,
  )
  object.scale.copy(s)
  return s
}

type Props = ComponentProps<'group'> & { dimensions: Dimensions }

/** Wraps a GLB model and scales it to the part's canonical dimensions (once per dimensions value). */
export const ScaledGroup = memo(function ScaledGroup({
  dimensions,
  children,
  ...rest
}: Props) {
  const ref = useRef<THREE.Group>(null)
  const [scale, setScale] = useState(() => new THREE.Vector3(1, 1, 1))
  const key = JSON.stringify(dimensions)

  useLayoutEffect(() => {
    const g = ref.current
    if (!g) return
    if (g.userData.scaledTo !== key) {
      g.userData.scaledTo = key
      setScale(fitToDimensions(g, dimensions).clone())
    }
  }, [key, dimensions])

  return (
    <group {...rest} scale={scale} ref={ref}>
      {children}
    </group>
  )
})
