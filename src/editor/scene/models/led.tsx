import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import type { ComponentProps } from 'react'
import * as THREE from 'three'
import { emissiveFor, useModel } from './util'
import type { IntensityHandle } from './arduino-uno'

type Props = ComponentProps<'group'> & { color?: string }

const HSL_PRESETS: Record<string, { h: number; s: number; l: number }> = {
  Crimson: { h: 1, s: 1, l: 0.2 },
  DeepSkyBlue: { h: 0.55, s: 1, l: 0.2 },
  MediumSeaGreen: { h: 0.4, s: 1, l: 0.2 },
}
const INTENSITY_RANGE: Record<string, [number, number]> = {
  Crimson: [0.99, 9.7 * 1.5],
  DeepSkyBlue: [0.99, 5.1],
  MediumSeaGreen: [0.99, 3.87],
}

export const LedModel = forwardRef<IntensityHandle, Props>(function LedModel(
  { color = 'Crimson', ...props },
  ref,
) {
  const { nodes, materials } = useModel('/led.glb')
  const body = useRef<THREE.Mesh>(null)

  const material = useMemo(
    () => materials.LedMaterial?.clone(),
    [materials.LedMaterial],
  )
  const emissive = useMemo(() => {
    const c = new THREE.Color(color)
    const preset = HSL_PRESETS[color]
    if (preset) c.setHSL(preset.h, preset.s, preset.l)
    return c
  }, [color])

  useLayoutEffect(() => {
    const mat = body.current?.material as THREE.MeshStandardMaterial | undefined
    if (mat) mat.emissiveIntensity = 0.99
  }, [])

  useImperativeHandle(ref, () => ({
    setIntensity(t) {
      const mat = body.current?.material as
        THREE.MeshStandardMaterial | undefined
      if (mat)
        mat.emissiveIntensity = emissiveFor(
          t,
          INTENSITY_RANGE[color] ?? [0.99, 8],
        )
    },
  }))

  return (
    <group {...props} dispose={null}>
      <group position-y={0.05}>
        <mesh
          ref={body}
          geometry={nodes.Cylinder_0?.geometry}
          material={material}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0.1}
          material-color={0x333333}
          material-emissive={emissive}
          material-toneMapped={false}
        />
        <mesh
          geometry={nodes.Cylinder_1?.geometry}
          material={materials.IronMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
          scale={0.1}
        />
      </group>
    </group>
  )
})
