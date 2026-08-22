import {
  Suspense,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { observer } from 'mobx-react-lite'
import * as THREE from 'three'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { AdaptiveDpr, Html, OrbitControls, useHelper } from '@react-three/drei'
import { Bloom, EffectComposer } from '@react-three/postprocessing'
import { toast } from 'sonner'
import { ScaledGroup } from '#/editor/scene/ScaledGroup'
import { CANVAS_BG } from '#/editor/scene/ProjectCanvas'
import { LABEL_STYLE, LABEL_WRAP_STYLE } from '#/editor/scene/PartContainer'
import { wireGeometry } from '#/editor/scene/WireMesh'
import { SimPartModel } from './SimPartModel'
import type { Simulator } from './model'
import type { Part } from '#/sim/part'
import type { Terminal } from '#/sim/terminal'
import type { Wire } from '#/sim/wire'

const SimulatorContext = createContext<Simulator | null>(null)
export function useSimulator() {
  const s = useContext(SimulatorContext)
  if (!s)
    throw new Error('useSimulator must be used inside the Simulator canvas')
  return s
}

/** Live voltage readout for a terminal (gated by part.showVoltages while running). */
const VoltageLabel = observer(function VoltageLabel({
  terminal,
}: {
  terminal: Terminal
}) {
  const sim = useSimulator()
  const p = useRef<HTMLParagraphElement>(null)
  const show = terminal.part.showVoltages && sim.circuit.running
  useFrame(() => {
    if (p.current)
      p.current.innerText = `${(terminal.currentVoltage + 1e-6).toFixed(3)} V`
  })
  return (
    <group
      position={[terminal.position.x, terminal.position.y, terminal.position.z]}
    >
      {show && (
        <>
          <group position-y={3.25}>
            <Html as="div" distanceFactor={1.15} style={LABEL_WRAP_STYLE}>
              <p ref={p} style={LABEL_STYLE} />
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

/** Clickable marker shown when a part has recorded rating errors. */
function ErrorMarker({ part }: { part: Part }) {
  const [hover, setHover] = useState(false)
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : 'auto'
    return () => {
      document.body.style.cursor = 'auto'
    }
  }, [hover])
  return (
    <mesh
      position-y={0.5 * part.dimensions.height + 1.5}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation()
        part.errors.forEach((err) =>
          toast.error(err.message, { duration: 5000 }),
        )
      }}
    >
      <sphereGeometry args={[0.35, 16, 16]} />
      <meshBasicMaterial color="#888888" transparent opacity={0.9} />
    </mesh>
  )
}

/** Read-only part view: placed under its parent, selectable, shows voltage labels + errors. */
const SimPartView = observer(function SimPartView({ part }: { part: Part }) {
  const sim = useSimulator()
  const scene = useThree((s) => s.scene)
  const [container, setContainer] = useState<THREE.Group | null>(null)
  const [, tick] = useState(0)
  const parentObj = part.parent?.container ?? scene

  useLayoutEffect(() => {
    if (!container) return
    parentObj.add(container)
    return () => {
      parentObj.remove(container)
    }
  }, [parentObj, container])

  // re-render every 30 ticks so error markers appear
  useEffect(
    () =>
      part.circuit.clock.onChange(
        () => part.circuit.clock.tick % 30 === 0 && tick((n) => n + 1),
      ),
    [part],
  )

  const containerRef = useCallback(
    (o: THREE.Group | null) => {
      setContainer(o)
      part.container = o
    },
    [part],
  )
  const objectRef = useCallback(
    (o: THREE.Object3D | null) => {
      part.object = o
    },
    [part],
  )
  const selectionRef = useCallback(
    (o: THREE.Object3D | null) => {
      part.selectionBox = o
    },
    [part],
  )
  const ready = !!container && !(part.parent && !part.parent.container)
  const dims = part.dimensions
  return (
    <group
      ref={containerRef}
      position={[part.position.x, part.position.y, part.position.z]}
      rotation-y={part.rotation}
      visible={ready}
    >
      <group
        ref={objectRef}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          if (!e.nativeEvent.altKey) {
            sim.setSelection(part)
            e.stopPropagation()
          }
        }}
      >
        <group ref={selectionRef}>
          <Suspense fallback={null}>
            <ScaledGroup position-y={dims.height / 2} dimensions={dims}>
              <SimPartModel part={part} />
            </ScaledGroup>
          </Suspense>
        </group>
        {part.terminals.map((t) => (
          <VoltageLabel key={t.name} terminal={t} />
        ))}
      </group>
      {part.errors.length > 0 && <ErrorMarker part={part} />}
    </group>
  )
})

interface ArrowHandle {
  showHead: () => void
  hideHead: () => void
}
const Arrow = forwardRef<ArrowHandle, { scale?: number }>(
  function Arrow(props, ref) {
    const head = useRef<THREE.Mesh>(null)
    useImperativeHandle(ref, () => ({
      showHead: () => head.current && (head.current.visible = true),
      hideHead: () => head.current && (head.current.visible = false),
    }))
    return (
      <group {...props}>
        <group rotation-x={Math.PI / 2}>
          <mesh>
            <cylinderGeometry args={[0.075, 0.075, 5]} />
            <meshBasicMaterial color="black" />
          </mesh>
          <mesh ref={head} position-y={2.5}>
            <coneGeometry args={[0.5, 1]} />
            <meshBasicMaterial color="black" />
          </mesh>
        </group>
      </group>
    )
  },
)

/** Wire tube plus (optional) current arrow + amps label while running. */
const WireView = observer(function WireView({ wire }: { wire: Wire }) {
  const sim = useSimulator()
  const mesh = useRef<THREE.Mesh>(null)
  const label = useRef<THREE.Group>(null)
  const text = useRef<HTMLParagraphElement>(null)
  const arrow = useRef<ArrowHandle>(null)
  const last = useRef<{ a: THREE.Vector3; b: THREE.Vector3; h: number } | null>(
    null,
  )
  const ready = !!wire.partOne.container && !!wire.partTwo.container

  useFrame(() => {
    const c1 = wire.partOne.container
    const c2 = wire.partTwo.container
    const m = mesh.current
    if (!c1 || !c2 || !m) return
    const a = c1.getWorldPosition(new THREE.Vector3())
    const b = c2.getWorldPosition(new THREE.Vector3())
    if (label.current) {
      const amps = wire.amperage
      const abs = Math.abs(amps)
      if (text.current) text.current.innerText = `${abs.toFixed(4)} A`
      const target = (amps > 0 ? b : a).clone().setY(label.current.position.y)
      label.current.lookAt(target)
      if (abs < 1e-6) arrow.current?.hideHead()
      else arrow.current?.showHead()
    }
    const l = last.current
    if (!l || !l.a.equals(a) || !l.b.equals(b) || l.h !== wire.height) {
      m.geometry.dispose()
      m.geometry = wireGeometry(a, b, wire.height)
      last.current = { a, b, h: wire.height }
      label.current?.position.copy(
        a
          .clone()
          .add(b)
          .multiplyScalar(0.5)
          .add(new THREE.Vector3(0, 0.75 * wire.height + 0.5, 0)),
      )
    }
  })

  return (
    <>
      <mesh ref={mesh} visible={ready}>
        <meshStandardMaterial color={wire.color} side={THREE.DoubleSide} />
      </mesh>
      {wire.showCurrents && (
        <group ref={label} visible={sim.circuit.running}>
          <Arrow ref={arrow} scale={0.1} />
          <group position-y={0.15}>
            <Html
              as="div"
              distanceFactor={1.15}
              style={{
                height: 'max-content',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                whiteSpace: 'nowrap',
                transform: 'translateX(-50%) translateY(-100%)',
              }}
            >
              <p
                ref={text}
                style={{
                  ...LABEL_STYLE,
                  padding: '0px 36px',
                  transform: 'none',
                }}
              />
            </Html>
          </group>
        </group>
      )}
    </>
  )
})

const SelectionHelper = observer(function SelectionHelper() {
  const sim = useSimulator()
  const ref = useRef<THREE.Object3D | null>(null)
  ref.current = sim.selection?.selectionBox ?? null
  useHelper(ref as React.RefObject<THREE.Object3D>, THREE.BoxHelper, 'red')
  return null
})

const CameraInit = observer(function CameraInit() {
  const sim = useSimulator()
  const orbit = sim.orbit
  useEffect(() => {
    if (!orbit) return
    orbit.object.position.copy(sim.camera.position)
    orbit.target.copy(sim.camera.target)
    orbit.update()
  }, [orbit, sim])
  return null
})

/** "Clock: 1.23s" badge, updated on every tick without re-rendering the tree. */
function ClockBadge({ simulator }: { simulator: Simulator }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(
    () =>
      simulator.circuit.clock.onChange(() => {
        if (ref.current)
          ref.current.innerText = `Clock: ${(simulator.circuit.clock.time / 1000).toFixed(2)}s`
      }),
    [simulator],
  )
  return (
    <div
      ref={ref}
      className="absolute top-4 left-1/2 -translate-x-1/2 rounded-md bg-[#2a2a2a] px-2 py-0.5 text-sm text-white"
    >
      Clock: 0.00s
    </div>
  )
}

function useDelayedTrue(ms: number) {
  const [v, setV] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setV(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return v
}

const Scene = observer(function Scene({ simulator }: { simulator: Simulator }) {
  const visible = useDelayedTrue(400)
  const circuit = simulator.circuit
  return (
    <Canvas
      shadows
      onCreated={({ raycaster }) => {
        raycaster.params.Line.threshold = 0.15
      }}
      camera={{ position: [-48, 24, 24], fov: 17.5 }}
      resize={{ debounce: 0 }}
      gl={{ preserveDrawingBuffer: true }}
      onPointerMissed={() => simulator.setSelection(null)}
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 1.5s' }}
    >
      <color attach="background" args={[CANVAS_BG]} />
      <AdaptiveDpr pixelated />
      <EffectComposer resolutionScale={2}>
        <Bloom
          mipmapBlur
          radius={0.5}
          kernelSize={4}
          luminanceThreshold={1.1}
          luminanceSmoothing={0}
          intensity={8}
        />
      </EffectComposer>
      <OrbitControls
        ref={simulator.setOrbit}
        makeDefault
        maxPolarAngle={Math.PI / 2}
        zoomSpeed={0.5}
      />
      <ambientLight intensity={1} />
      <directionalLight
        name="Directional Light 1"
        intensity={0.85}
        position={[200, 400, 300]}
      />
      <directionalLight
        name="Directional Light 2"
        intensity={0.85}
        position={[-200, 400, -300]}
      />
      <SimulatorContext.Provider value={simulator}>
        <CameraInit />
        <group>
          {circuit.parts.map((p) => (
            <SimPartView key={p.id} part={p} />
          ))}
          {circuit.wires.map((w) => (
            <WireView key={w.id} wire={w} />
          ))}
        </group>
        <SelectionHelper />
      </SimulatorContext.Provider>
    </Canvas>
  )
})

export function SimCanvas({ simulator }: { simulator: Simulator }) {
  return (
    <>
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            Loading…
          </div>
        }
      >
        <Scene simulator={simulator} />
      </Suspense>
      <ClockBadge simulator={simulator} />
    </>
  )
}
