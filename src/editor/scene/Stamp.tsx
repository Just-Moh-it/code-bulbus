import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { observer } from 'mobx-react-lite'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { ScaledGroup } from './ScaledGroup'
import { useProject } from './context'
import { stampModels } from './PartModel'
import { wireGeometry } from './WireMesh'
import { WireEndPart, getPartModule } from '#/editor/models'
import type { EditorPart } from '#/editor/models'
import type { PartType } from '#/sim/types'

type Manager = NonNullable<ReturnType<typeof getPartModule>>['Manager'] & {
  type: PartType
  dimensions: { width: number; height: number; depth: number }
  eligibleParents: Set<PartType>
}

interface StampProps {
  partType: Manager
  offset?: THREE.Vector3
  onAdd: (part: EditorPart) => void
  children: ReactNode
}

const ORIGIN = new THREE.Vector3(500, 0, 500)

/** Ghost part following the cursor; placed on click (<6px move) or Enter. */
export function PartStamp({ partType, offset, onAdd, children }: StampProps) {
  const project = useProject()
  const { gl, raycaster, camera } = useThree()
  const ghost = useRef<THREE.Group>(null)
  const parentRef = useRef<EditorPart | null>(null)
  const [pos, setPos] = useState(() => ORIGIN.clone())
  const plane = useMemo(
    () => new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    [],
  )
  const down = useRef<{ x: number; y: number } | null>(null)
  const onAddRef = useRef(onAdd)
  onAddRef.current = onAdd

  useEffect(() => {
    const el = gl.domElement
    const hit = new THREE.Vector3()
    const ndc = new THREE.Vector2()

    const place = () => {
      const g = ghost.current
      const root = project.circuit.root
      if (!g || !root) return
      const parent = parentRef.current
      parent?.container?.attach(g)
      const p = g.position.clone()
      const rot = g.rotation.clone().reorder('YZX').y
      const part = project.circuit.addPart({
        id: crypto.randomUUID(),
        type: partType.type,
        position: { x: p.x, y: p.y, z: p.z },
        parentId: parent?.id ?? null,
        rotation: rot,
      })
      root.attach(g)
      if (!part) return
      setTimeout(() => {
        // same treatment as a drag end: snap to the nearest terminal, then record connections
        part.setPosition(part.position.clone())
        part.updateConnections()
      }, 100)
      onAddRef.current(part)
    }

    const onMove = (e: PointerEvent) => {
      const g = ghost.current
      if (!g) return
      const r = el.getBoundingClientRect()
      ndc.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        -((e.clientY - r.top) / r.height) * 2 + 1,
      )
      raycaster.setFromCamera(ndc, camera)
      if (!raycaster.ray.intersectPlane(plane, hit)) return
      const b3 = new THREE.Box3().setFromObject(g)
      const ghostBox = new THREE.Box2(
        new THREE.Vector2(b3.min.x, b3.min.z),
        new THREE.Vector2(b3.max.x, b3.max.z),
      )
      let parent: EditorPart | null = null
      let bestY = -100
      for (const p of project.circuit.parts) {
        if (
          !partType.eligibleParents.has(p.type) ||
          !p.box2.intersectsBox(ghostBox)
        )
          continue
        const y = p.positionWorld.y
        if (y > bestY) {
          bestY = y
          parent = p
        }
      }
      parentRef.current = parent
      hit.y = parent ? parent.positionWorld.y + parent.dragSurfaceHeight : 0
      setPos(hit.clone().add(offset ?? new THREE.Vector3()))
    }
    const onDown = (e: PointerEvent) => {
      down.current = { x: e.clientX, y: e.clientY }
    }
    const onUp = (e: PointerEvent) => {
      const d = down.current
      down.current = null
      if (d && Math.abs(e.clientX - d.x) < 6 && Math.abs(e.clientY - d.y) < 6)
        place()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') place()
    }
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      window.removeEventListener('keydown', onKey)
    }
  }, [gl, raycaster, camera, plane, project, partType, offset])

  const dims = partType.dimensions
  return (
    <group ref={ghost} position={pos}>
      <ScaledGroup position-y={dims.height / 2} dimensions={dims}>
        <Suspense fallback={null}>{children}</Suspense>
      </ScaledGroup>
    </group>
  )
}

/** Two wire-end stamps joined by a preview tube; creates the wire once both are placed. */
function WireStamp() {
  const project = useProject()
  const ends = useRef<{ a: EditorPart | null; b: EditorPart | null }>({
    a: null,
    b: null,
  })
  const preview = useRef<THREE.Mesh>(null)
  const ghostA = useRef<THREE.Group>(null)
  const ghostB = useRef<THREE.Group>(null)
  const last = useRef<{ a: THREE.Vector3; b: THREE.Vector3 } | null>(null)
  const offsetB = useMemo(() => new THREE.Vector3(0, 0, 2), [])

  useFrame(() => {
    const m = preview.current
    if (!m || !ghostA.current || !ghostB.current) return
    const a = ghostA.current.getWorldPosition(new THREE.Vector3())
    const b = ghostB.current.getWorldPosition(new THREE.Vector3())
    const l = last.current
    if (!l || !l.a.equals(a) || !l.b.equals(b)) {
      m.geometry.dispose()
      m.geometry = wireGeometry(a, b, 2)
      last.current = { a, b }
    }
  })

  const finish = () => {
    const { a: pa, b: pb } = ends.current
    if (!pa || !pb) return
    project.circuit.addWire({
      id: crypto.randomUUID(),
      partOneId: pa.id,
      partTwoId: pb.id,
      color: 'Crimson',
    })
    ends.current = { a: null, b: null }
    setTimeout(() => {
      project.setSelection(pa)
      project.setStampType(null)
      project.pushSnapshotToHistory()
    }, 0)
  }

  const Model = stampModels['wire-end']
  return (
    <>
      <PartStamp
        partType={WireEndPart}
        onAdd={(p) => {
          ends.current.a = p
          finish()
        }}
      >
        <group ref={ghostA} />
        <Model />
      </PartStamp>
      <PartStamp
        partType={WireEndPart}
        offset={offsetB}
        onAdd={(p) => {
          ends.current.b = p
          finish()
        }}
      >
        <group ref={ghostB} />
        <Model />
      </PartStamp>
      <mesh ref={preview}>
        <meshStandardMaterial color="Crimson" side={THREE.DoubleSide} />
      </mesh>
    </>
  )
}

/** Renders whatever the project is currently stamping. */
export const Stamp = observer(function Stamp() {
  const project = useProject()
  const type = project.stampType
  if (!type) return null
  if (type === 'wire') return <WireStamp />
  const mod = getPartModule(type)
  if (!mod) return null
  const Model = stampModels[type]
  return (
    <PartStamp
      partType={mod.Manager as unknown as Manager}
      onAdd={(p) =>
        setTimeout(() => {
          project.setSelection(p)
          project.setStampType(null)
          project.pushSnapshotToHistory()
        }, 0)
      }
    >
      <Model />
    </PartStamp>
  )
})
