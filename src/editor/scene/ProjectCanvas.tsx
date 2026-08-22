import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { observer } from 'mobx-react-lite'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, OrbitControls, useHelper } from '@react-three/drei'
import type { EditorProject } from '#/editor/models'
import { ProjectContext, useProject } from './context'
import { PartContainer } from './PartContainer'
import { EditorPartModel } from './PartModel'
import { WireMesh } from './WireMesh'
import { Stamp } from './Stamp'
import { Hotkeys } from './Hotkeys'
import { preloadModels } from './models'

export const CANVAS_BG = '#F9FAFC'

/** Red BoxHelper around the selected part's model. */
const SelectionHelper = observer(function SelectionHelper() {
  const project = useProject()
  const ref = useRef<THREE.Object3D | null>(null)
  ref.current = project.selection?.selectionBox ?? null
  useHelper(ref as React.RefObject<THREE.Object3D>, THREE.BoxHelper, 'red')
  return null
})

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

function useDelayedTrue(ms: number) {
  const [v, setV] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setV(true), ms)
    return () => clearTimeout(t)
  }, [ms])
  return v
}

const Scene = observer(function Scene({ project }: { project: EditorProject }) {
  const visible = useDelayedTrue(400)
  const circuit = project.circuit
  useEffect(() => preloadModels(), [])
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
      style={{ opacity: visible ? 1 : 0, transition: 'opacity 1.5s' }}
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
        <SelectionHelper />
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
