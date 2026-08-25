import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { observer } from 'mobx-react-lite'
import type * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, OrbitControls, useGLTF } from '@react-three/drei'
import type { EditorProject } from '#/editor/models'
import { ProjectContext, useProject } from './context'
import { PartContainer } from './PartContainer'
import { EditorPartModel } from './PartModel'
import { WireMesh } from './WireMesh'
import { Stamp } from './Stamp'
import { Hotkeys } from './Hotkeys'
import { modelUrlsFor } from './models'

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
 * White sheet over the canvas while its models stream in. The canvas itself
 * stays visible underneath, so a cold load reads as loading rather than as a
 * blank page.
 */
function LoadingVeil({ done }: { done?: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 bg-white transition-opacity duration-500 ${
        done ? 'opacity-0' : 'animate-canvas-pulse'
      }`}
    />
  )
}

/**
 * Suspends until every model this circuit needs sits in drei's cache, then
 * reports ready — a fact about the models rather than a guess.
 *
 * `useProgress` cannot answer this: drei zeroes `loaded`/`total` as soon as a
 * batch finishes, so a `total > 0 && loaded >= total` test is only ever true by
 * accident and normally left the scene hidden until the timeout fired.
 */
function ModelsProbe({
  urls,
  onReady,
}: {
  urls: string[]
  onReady: () => void
}) {
  useGLTF(urls)
  useEffect(() => onReady(), [onReady])
  return null
}

/** Reveal even if a model 404s or hangs — a broken part should not hide the circuit. */
const READY_TIMEOUT_MS = 12_000

const Scene = observer(function Scene({ project }: { project: EditorProject }) {
  const circuit = project.circuit
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

export const ProjectCanvas = observer(function ProjectCanvas({
  project,
  onReady,
}: {
  project: EditorProject
  /** Fired once every model in the circuit has loaded (the preview capture waits on it). */
  onReady?: () => void
}) {
  const [ready, setReady] = useState(false)
  const markReady = useCallback(() => {
    setReady(true)
    onReady?.()
  }, [onReady])
  // exactly the models this circuit needs, resolved as early as we know them
  const urls = useMemo(
    () => modelUrlsFor(project.circuit.parts.map((p) => p.type)),
    [project.circuit, project.circuit.parts.length],
  )
  useEffect(() => {
    const t = setTimeout(markReady, READY_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [markReady])
  // The probe sits beside the canvas, not inside it: a suspended sibling in the
  // R3F tree stops React from ever rendering later children there, so a probe
  // mounted inside never ran and every scene waited out the timeout.
  return (
    <>
      <Suspense fallback={null}>
        <Scene project={project} />
      </Suspense>
      <Suspense fallback={null}>
        <ModelsProbe urls={urls} onReady={markReady} />
      </Suspense>
      <LoadingVeil done={ready} />
    </>
  )
})
