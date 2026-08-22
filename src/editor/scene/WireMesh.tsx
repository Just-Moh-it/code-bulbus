import { useRef } from 'react'
import { observer } from 'mobx-react-lite'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mg } from '#/sim/types'
import type { EditorWire } from '#/editor/models'

/** Cubic Bézier from A to B lifted by 2·mg at the ends and `height` in the middle. */
export function wireCurve(a: THREE.Vector3, b: THREE.Vector3, height: number) {
  const lift = new THREE.Vector3(0, 2 * mg, 0)
  const head = new THREE.Vector3(0, height, 0)
  return new THREE.CubicBezierCurve3(
    a.clone().add(lift),
    a.clone().add(head),
    b.clone().add(head),
    b.clone().add(lift),
  )
}

export function wireGeometry(
  a: THREE.Vector3,
  b: THREE.Vector3,
  height: number,
) {
  return new THREE.TubeGeometry(wireCurve(a, b, height), 20, mg / 5)
}

/**
 * Editor wire: tube between the two wire-end *models*. Endpoints come from
 * `EditorPart.worldPosition` (model-derived), so the tube always agrees with
 * where the ends are, independent of scene-graph timing or animation.
 */
export const WireMesh = observer(function WireMesh({
  wire,
}: {
  wire: EditorWire
}) {
  const mesh = useRef<THREE.Mesh>(null)
  const last = useRef<{ a: THREE.Vector3; b: THREE.Vector3; h: number } | null>(
    null,
  )

  useFrame(() => {
    const m = mesh.current
    if (!m) return
    const a = wire.partOne.worldPosition
    const b = wire.partTwo.worldPosition
    const h = wire.height
    const l = last.current
    if (!l || !l.a.equals(a) || !l.b.equals(b) || l.h !== h) {
      m.geometry.dispose()
      m.geometry = wireGeometry(a, b, h)
      last.current = { a, b, h }
    }
  })

  return (
    <mesh ref={mesh}>
      <meshStandardMaterial color={wire.color} side={THREE.DoubleSide} />
    </mesh>
  )
})
