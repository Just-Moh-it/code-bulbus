import { Suspense, useCallback, useEffect, useState } from 'react'
import { observer } from 'mobx-react-lite'
import type * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, OrbitControls, useProgress } from '@react-three/drei'
import type { EditorProject } from '#/editor/models'
import { ProjectContext, useProject } from './context'
import { PartContainer } from './PartContainer'
import { EditorPartModel } from './PartModel'
import { WireMesh } from './WireMesh'
import { Stamp } from './Stamp'
import { Hotkeys } from './Hotkeys'
import { preloadModels } from './models'

export const CANVAS_BG = '#F3F5F9'

/** Copies persisted camera into OrbitControls and records it back on every orbit end. */
const CameraSync = observer(function CameraSync() {
  const project = useProject()
  const orbit = project.orbit
  useEffect(() => {
    if (!orbit) return
    orbit.object.position.copy(project.camera.position)
    orbit.target.copy(project.camera.target)
    orbit.update()
    const onEnd = () => project.updateCameraState()
    orbit.addEventListener('end', onEnd)
    return () => orbit.removeEventListener('end', onEnd)
  }, [orbit, project])
  return null
})

/**
 * True once every GLB the scene asked for has landed (drei's loader store),
 * with a floor so the first paint is never a flash and a ceiling so a failed
 * model still reveals the circuit. Parts mount behind their own Suspense, so
 * without this gate the scene pops in piece by piece — the Arduino, at 2.5 MB,
 * arriving seconds after the wires.
 */
function useSceneReady(minMs = 250, maxMs = 12_000) {
  const { active, loaded, total } = useProgress()
  const [floor, setFloor] = useState(false)
  const [ceiling, setCeiling] = useState(false)
  useEffect(() => {
    const a = setTimeout(() => setFloor(true), minMs)
    const b = setTimeout(() => setCeiling(true), maxMs)
    return () => {
      clearTimeout(a)
      clearTimeout(b)
    }
  }, [minMs, maxMs])
  const loadersIdle = !active && total > 0 && loaded >= total
  return ceiling || (floor && loadersIdle)
}

const Scene = observer(function Scene({ project }: { project: EditorProject }) {
  const visible = useSceneReady()
  const circuit = project.circuit
  // fetch exactly the models this circuit uses, as early as we know them
  useEffect(
    () => preloadModels(circuit.parts.map((p) => p.type)),
    [circuit, circuit.parts.length],
  )
  const rootRef = useCallback(
    (g: THREE.Group | null) => circuit.setRoot(g),
    [circuit],
  )
  return (
    <Canvas
      shadows
      onCreated={({ raycaster }) => {
        raycaster.params.Line.threshold = 0.15
      }}
      camera={{ position: [-12, 6, 6], fov: 17.5, near: 0.25 }}
      resize={{ debounce: 0 }}
      onPointerMissed={() => project.setSelection(null)}
      gl={{ preserveDrawingBuffer: true }}
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 300ms' }}
    >
      <color attach="background" args={[CANVAS_BG]} />
      <AdaptiveDpr pixelated />
      <OrbitControls
        ref={project.setOrbit}
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
      <ProjectContext.Provider value={project}>
        <CameraSync />
        <group ref={rootRef}>
          {circuit.parts.map((p) => (
            <PartContainer key={p.id} part={p}>
              <EditorPartModel part={p} />
            </PartContainer>
          ))}
          {circuit.wires.map((w) => (
            <WireMesh key={w.id} wire={w} />
          ))}
        </group>
        <Stamp />
        <Hotkeys />
      </ProjectContext.Provider>
    </Canvas>
  )
})

export function ProjectCanvas({ project }: { project: EditorProject }) {
  return (
    <Suspense
      fallback={
        <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <Scene project={project} />
    </Suspense>
  )
}
