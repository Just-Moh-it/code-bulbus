import type { ComponentProps } from 'react'
import { useGLTF } from '@react-three/drei'
import { useModel } from './util'

export function BreadboardModel(props: ComponentProps<'group'>) {
  const { nodes, materials } = useModel('/breadboard.glb')
  return (
    <group {...props} dispose={null}>
      <group rotation-y={Math.PI / 2} position-y={-0.0042}>
        <group position={[0, -0.01, 0.02]} />
        <mesh
          geometry={nodes.breadboard_C_001_DMSH?.geometry}
          material={materials.MAT_PlasticWhite}
        />
        <mesh
          geometry={nodes.breadboard_L_001_DMSH?.geometry}
          material={materials.MAT_PlasticWhite}
        />
        <mesh
          geometry={nodes.breadboard_R_001_DMSH?.geometry}
          material={materials.MAT_PlasticWhite}
        />
        <mesh
          geometry={nodes.contacts_L_001_DMSH?.geometry}
          material={materials.MAT_BreadboardMetal}
        />
        <mesh
          geometry={nodes.sightBlocker_C_001_DMSH?.geometry}
          material={materials.MAT_PlasticWhite}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/breadboard.glb')
