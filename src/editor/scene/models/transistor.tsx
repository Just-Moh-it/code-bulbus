import type { ComponentProps } from 'react'
import { useModel } from './util'

export function TransistorModel(props: ComponentProps<'group'>) {
  const { nodes, materials } = useModel('/bjt-transistor.glb')
  return (
    <group {...props} dispose={null}>
      <group rotation-z={Math.PI / 2} rotation-y={Math.PI / 2}>
        <group
          position-z={0.019}
          position-x={-1.7}
          rotation={[Math.PI / 2 + 0.2673, 0, Math.PI / 2]}
        >
          <mesh
            geometry={nodes.Circle003?.geometry}
            material={materials.Plastic}
            material-color="gray"
          />
          <mesh
            geometry={nodes.Circle003_1?.geometry}
            material={materials.Silver}
          />
        </group>
      </group>
    </group>
  )
}
