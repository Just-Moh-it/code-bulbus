import {
  forwardRef,
  memo,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { ComponentProps } from 'react'
import type * as THREE from 'three'
import { localBox, scaleToFit } from './fit'
import type { Dimensions } from '#/sim/types'

type Props = ComponentProps<'group'> & {
  dimensions: Dimensions
  /** Cache key for the computed scale — every instance of a part type shares one fit. */
  fitKey: string
}

/** Scale per `fitKey`, computed once from the first instance that has geometry. */
const fitCache = new Map<string, THREE.Vector3>()

/**
 * Scales a GLB model so its local bounding box equals the part's canonical
 * `dimensions`. The measurement is rotation-invariant and excludes labels
 * (see `fit.ts`), and is cached per part type, so it is deterministic.
 * Mount it below a `<Suspense>` so the model has resolved by the time it renders.
 */
export const ScaledGroup = memo(
  forwardRef<THREE.Group, Props>(function ScaledGroup(
    { dimensions, fitKey, children, ...rest },
    fwd,
  ) {
    const ref = useRef<THREE.Group>(null)
    useImperativeHandle(fwd, () => ref.current as THREE.Group)
    const [scale, setScale] = useState(() => fitCache.get(fitKey) ?? null)

    useLayoutEffect(() => {
      if (scale) return
      const g = ref.current
      if (!g) return
      const box = localBox(g)
      const s = box && scaleToFit(box, dimensions)
      if (!s) return // nothing with geometry yet; the model's Suspense will re-render us
      fitCache.set(fitKey, s)
      setScale(s)
    })

    return (
      <group {...rest} scale={scale ?? undefined} visible={!!scale} ref={ref}>
        {children}
      </group>
    )
  }),
)
