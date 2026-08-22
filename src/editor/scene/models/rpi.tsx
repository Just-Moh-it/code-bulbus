import type { ComponentProps } from 'react'
import { useModel } from './util'

export function RaspberryPiModel(props: ComponentProps<'group'>) {
  const { nodes, materials } = useModel('/rpi.glb')
  return (
    <group {...props} dispose={null}>
      <group position={[0, -0.5, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <mesh
          geometry={nodes.Cube001?.geometry}
          material={materials.Textura_Raspberry_Pi_3}
        />
        <mesh
          geometry={nodes.Cube001_1?.geometry}
          material={materials.Material_NONE}
        />
      </group>
    </group>
  )
}
