import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import { observer } from 'mobx-react-lite'
import * as THREE from 'three'
import { animated, useSpring } from '@react-spring/three'
import { Html } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { ScaledGroup } from './ScaledGroup'
import { BoxOutline } from './BoxOutline'
import { useProject } from './context'
import type { EditorPart, EditorTerminal } from '#/editor/models'

function throttle<TArgs extends unknown[]>(
  fn: (...a: TArgs) => void,
  ms: number,
) {
  let last = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: TArgs | null = null
  return (...args: TArgs) => {
    const now = performance.now()
    const run = () => {
      last = performance.now()
      timer = null
      if (pending) {
        const p = pending
        pending = null
        fn(...p)
      }
    }
    pending = args
    if (now - last >= ms) run()
    else if (!timer) timer = setTimeout(run, ms - (now - last))
  }
}

/** Shared look for terminal / voltage / current labels. */
export const LABEL_STYLE: React.CSSProperties = {
  color: 'white',
  fontSize: 100,
  padding: '36px 0px',
  background: '#2a2a2a',
  borderRadius: 36,
  border: '4px solid rgba(255,255,255,0.8)',
  transform: 'rotate(180deg)',
}
export const LABEL_WRAP_STYLE: React.CSSProperties = {
  height: 'max-content',
  writingMode: 'vertical-rl',
  textOrientation: 'mixed',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  whiteSpace: 'nowrap',
  transform: 'translateX(-50%) translateY(-100%)',
}

/** Terminal anchor + optional label pill on a thin post (editor side). */
export const TerminalLabel = observer(function TerminalLabel({
  terminal,
}: {
  terminal: EditorTerminal
}) {
  const show = terminal.part.showLabels && !!terminal.label
  const setTerminalObject = useCallback(
    (o: THREE.Object3D | null) => terminal.setObject(o),
    [terminal],
  )
  return (
    <group ref={setTerminalObject} position={terminal.position}>
      {show && (
        <>
          <group position-y={3.25}>
            <Html as="div" distanceFactor={1.15} style={LABEL_WRAP_STYLE}>
              <p style={LABEL_STYLE}>{terminal.label}</p>
            </Html>
          </group>
          <mesh position-y={1.5}>
            <boxGeometry args={[0.01, 3.25, 0.01]} />
            <meshStandardMaterial color="black" />
          </mesh>
        </>
      )}
    </group>
  )
})

interface DraggableProps {
  plane: THREE.Plane
  visible: boolean
  onDrag: (hit: THREE.Vector3, offset: THREE.Vector3) => void
  onDragEnd: () => void
  onPointerDown?: (e: ThreeEvent<PointerEvent>) => void
  onPointerOver?: () => void
  onPointerOut?: () => void
  onContextMenu?: (e: ThreeEvent<MouseEvent>) => void
  spring: Record<string, unknown>
  containerRef: (o: THREE.Group | null) => void
  children: ReactNode
}

/** Pointer-drag on a horizontal plane; disables OrbitControls while dragging. Alt bypasses. */
function Draggable({
  plane,
  visible,
  onDrag,
  onDragEnd,
  onPointerDown,
  onPointerOver,
  onPointerOut,
  onContextMenu,
  spring,
  containerRef,
  children,
}: DraggableProps) {
  const controls = useThree((s) => s.controls) as unknown as {
    enabled: boolean
  } | null
  const dragging = useRef(false)
  const offset = useRef(new THREE.Vector3())
  const hit = useRef(new THREE.Vector3())

  return (
    <animated.group
      ref={containerRef}
      visible={visible}
      {...spring}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        if (e.nativeEvent.altKey) return
        onPointerDown?.(e)
        if (controls) controls.enabled = false
        dragging.current = true
        const origin = new THREE.Vector3().setFromMatrixPosition(
          e.eventObject.matrixWorld,
        )
        if (e.ray.intersectPlane(plane, hit.current))
          offset.current.copy(hit.current).sub(origin)
        e.stopPropagation()
        ;(e.target as Element).setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        if (!dragging.current) return
        if (e.ray.intersectPlane(plane, hit.current))
          onDrag(hit.current.clone(), offset.current)
        e.stopPropagation()
      }}
      onPointerUp={(e: ThreeEvent<PointerEvent>) => {
        if (!dragging.current) return
        e.stopPropagation()
        ;(e.target as Element).releasePointerCapture(e.pointerId)
        if (controls) controls.enabled = true
        dragging.current = false
        onDragEnd()
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation()
        onPointerOver?.()
      }}
      onPointerOut={onPointerOut}
      onContextMenu={onContextMenu}
    >
      {children}
    </animated.group>
  )
}

/** Places a part in the scene graph (under its parent), handles drag/select/context menu. */
export const PartContainer = observer(function PartContainer({
  part,
  children,
}: {
  part: EditorPart
  children: ReactNode
}) {
  const project = useProject()
  const scene = useThree((s) => s.scene)
  const [container, setContainer] = useState<THREE.Group | null>(null)
  const [hovered, setHovered] = useState(false)
  const boxGroup = useRef<THREE.Group>(null)
  // while the pointer drives the part, the scene mirrors the model immediately;
  // the spring is only for programmatic moves (snap, rotate, undo)
  const dragging = useRef(false)

  const [spring, api] = useSpring(() => ({
    'position-x': part.position.x,
    'position-y': part.position.y,
    'position-z': part.position.z,
    'rotation-y': part.rotation,
    config: { mass: 0.2, friction: 10 },
  }))

  // instant on re-parent, animated otherwise
  const parent = part.parent
  useEffect(() => {
    api.set({
      'position-x': part.position.x,
      'position-y': part.position.y,
      'position-z': part.position.z,
      'rotation-y': part.rotation,
    })
  }, [
    parent,
    api,
    part.position.x,
    part.position.y,
    part.position.z,
    part.rotation,
  ])
  useEffect(() => {
    const target = {
      'position-x': part.position.x,
      'position-y': part.position.y,
      'position-z': part.position.z,
      'rotation-y': part.rotation,
    }
    if (dragging.current) api.set(target)
    else api.start(target)
  }, [api, part.position.x, part.position.y, part.position.z, part.rotation])

  // mount container under the parent's container (or the scene)
  const parentObj = part.parent?.container ?? scene
  useLayoutEffect(() => {
    if (!container) return
    parentObj.add(container)
    return () => {
      parentObj.remove(container)
    }
  }, [parentObj, container])

  const plane = useMemo(
    () =>
      new THREE.Plane(
        new THREE.Vector3(0, 1, 0),
        container ? -part.positionWorld.y : 0,
      ),
    [container, part, parent],
  )

  const onDrag = useMemo(
    () =>
      throttle((hit: THREE.Vector3, offset: THREE.Vector3) => {
        const v = hit.sub(offset)
        const pc = part.parent?.container
        if (pc) v.applyMatrix4(pc.matrixWorld.clone().invert())
        part.setPosition(v, { shouldUpdateConnections: false })
      }, 40),
    [part],
  )

  const containerRef = useCallback(
    (o: THREE.Group | null) => {
      setContainer(o)
      part.setContainer(o)
    },
    [part],
  )
  const objectRef = useCallback(
    (o: THREE.Object3D | null) => part.setObject(o),
    [part],
  )
  const selectionRef = useCallback(
    (o: THREE.Group | null) => {
      boxGroup.current = o
      part.setSelectionBox(o)
    },
    [part],
  )

  const dims = part.dimensions
  return (
    <Draggable
      containerRef={containerRef}
      visible={part.isReady}
      plane={plane}
      spring={spring}
      onPointerDown={(e) => {
        if (!e.nativeEvent.altKey && project.stampType === null)
          project.setSelection(part)
        dragging.current = true
        project.held.add(part.id)
      }}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
      onDrag={onDrag}
      onDragEnd={() => {
        dragging.current = false
        // final settle goes through setPosition so snapping applies once more
        part.setPosition(part.position.clone())
        project.pushSnapshotToHistory()
        project.held.delete(part.id)
      }}
      onContextMenu={(e) => {
        if (!e.nativeEvent.altKey) {
          part.circuit.setContextMenu({
            x: e.nativeEvent.clientX,
            y: e.nativeEvent.clientY,
            part,
          })
        }
        e.stopPropagation()
        e.nativeEvent.preventDefault()
      }}
    >
      <group ref={objectRef}>
        <group ref={selectionRef}>
          <Suspense fallback={null}>
            <ScaledGroup
              position-y={dims.height / 2}
              dimensions={dims}
              fitKey={part.type}
            >
              {children}
            </ScaledGroup>
          </Suspense>
          <BoxOutline
            target={boxGroup}
            hovered={hovered}
            selected={project.selection === part}
          />
        </group>
        {part.terminals.map((t) => (
          <TerminalLabel key={t.name} terminal={t} />
        ))}
      </group>
    </Draggable>
  )
})
