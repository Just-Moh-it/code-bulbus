import { useState } from 'react'
import * as THREE from 'three'
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { localBox } from './fit'

export const OUTLINE_COLOR = '#2563eb' // deviation from the reference (red BoxHelper): blue, thinner
export const OUTLINE_WIDTH = 1 // px; selected = 1.5× this

/** The 12 edges of a box as line segments (pairs of points). */
export function boxEdges(box: THREE.Box3): THREE.Vector3[] {
  const { min, max } = box
  const c = (x: number, y: number, z: number) =>
    new THREE.Vector3(x ? max.x : min.x, y ? max.y : min.y, z ? max.z : min.z)
  const edges: [number[], number[]][] = [
    // bottom
    [
      [0, 0, 0],
      [1, 0, 0],
    ],
    [
      [1, 0, 0],
      [1, 0, 1],
    ],
    [
      [1, 0, 1],
      [0, 0, 1],
    ],
    [
      [0, 0, 1],
      [0, 0, 0],
    ],
    // top
    [
      [0, 1, 0],
      [1, 1, 0],
    ],
    [
      [1, 1, 0],
      [1, 1, 1],
    ],
    [
      [1, 1, 1],
      [0, 1, 1],
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
    ],
    // verticals
    [
      [0, 0, 0],
      [0, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
    ],
    [
      [1, 0, 1],
      [1, 1, 1],
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
    ],
  ]
  return edges.flatMap(([a, b]) => [c(a[0], a[1], a[2]), c(b[0], b[1], b[2])])
}

interface Props {
  /** Group that contains the fitted model; the outline is drawn as its child, so it is measured in that same frame. */
  target: React.RefObject<THREE.Object3D | null>
  hovered: boolean
  selected: boolean
}

/**
 * Bounding-box outline for a part. Visible while hovered or selected;
 * selected draws 1.5× thicker. Rendered as a sibling of `target` so it shares
 * the container's transform, and padded slightly so it doesn't z-fight.
 */
export function BoxOutline({ target, hovered, selected }: Props) {
  const [points, setPoints] = useState<THREE.Vector3[] | null>(null)

  // the model may resolve after we mount; measure once it has geometry
  useFrame(() => {
    if (points || !target.current) return
    const box = localBox(target.current)
    if (box) setPoints(boxEdges(box.expandByScalar(0.02)))
  })

  if (!points || (!hovered && !selected)) return null
  return (
    <Line
      points={points}
      segments
      color={OUTLINE_COLOR}
      lineWidth={selected ? OUTLINE_WIDTH * 1.5 : OUTLINE_WIDTH}
      depthTest={false}
    />
  )
}
