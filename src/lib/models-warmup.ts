import { useGLTF } from '@react-three/drei'
import '#/lib/gltf-setup'
import { MODEL_URLS, preloadModels } from '#/editor/scene/models'

/** The models almost every circuit shows; warmed first. */
const COMMON = [
  '/breadboard.glb',
  '/arduino-uno.glb',
  '/led.glb',
  '/resistor.glb',
  '/battery.glb',
]

let started = false

/**
 * Warm the model cache from the moment the app boots — including the landing
 * page — so opening a project does not start a 2.5 MB download. Runs when the
 * browser is idle so it never competes with the first paint. drei keeps parsed
 * GLTFs in a module-level cache for the session; the HTTP cache covers reloads.
 */
export function warmModels() {
  if (started || typeof window === 'undefined') return
  started = true
  const idle =
    window.requestIdleCallback ?? ((fn: () => void) => setTimeout(fn, 200))
  idle(() => {
    COMMON.forEach((u) => useGLTF.preload(u))
    // the long tail, once the common set is on its way
    idle(() => preloadModels(), { timeout: 4000 })
  })
  void MODEL_URLS
}
