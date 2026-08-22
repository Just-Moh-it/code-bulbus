import type { ComponentProps } from 'react'
import { animated, useSpring } from '@react-spring/three'
import type { ThreeEvent } from '@react-three/fiber'
import { useModel } from './util'

type Props = ComponentProps<'group'> & {
  pressed?: boolean
  onPress?: () => void
  onRelease?: () => void
}

export function TactileSwitchModel({
  pressed,
  onPress,
  onRelease,
  ...props
}: Props) {
  const { nodes, materials } = useModel('/switch.glb')
  const spring = useSpring({
    'position-y': pressed ? 0.00085 : 0.0014,
    config: { mass: 0.2, friction: 18 },
  })
  const interactive = !!onPress && !!onRelease

  return (
    <group {...props} dispose={null}>
      <group position={[0, 0.001, 0]}>
        <animated.mesh
          {...spring}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => {
            if (!interactive) return
            e.stopPropagation()
            ;(e.target as Element).setPointerCapture(e.pointerId)
            onPress?.()
          }}
          onPointerUp={(e: ThreeEvent<PointerEvent>) => {
            if (!interactive) return
            e.stopPropagation()
            ;(e.target as Element).releasePointerCapture(e.pointerId)
            onRelease?.()
          }}
          onPointerOver={() => {
            if (interactive) document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            if (interactive) document.body.style.cursor = 'auto'
          }}
        >
          <cylinderGeometry args={[0.002, 0.002, 0.00225, 20]} />
          <meshStandardMaterial
            color={0x666666}
            metalness={0.33}
            roughness={0.5}
          />
        </animated.mesh>
        <mesh
          geometry={nodes.pushbuttonElement_C_001_DMSH?.geometry}
          material={materials.MAT_PlasticBlackGeneric}
        />
        <mesh
          geometry={nodes.pushbuttonElement_C_002_DMSH?.geometry}
          material={materials.MAT_MetalBasic}
          position={[0, -0.00195, 0]}
        />
      </group>
    </group>
  )
}
