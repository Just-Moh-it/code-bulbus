import type { ComponentProps } from 'react'
import { Text } from '@react-three/drei'
import { useModel } from './util'

type Props = ComponentProps<'group'> & { capacitance?: number }

export function CapacitorModel({ capacitance: _capacitance, ...props }: Props) {
  const { nodes, materials } = useModel('/capacitor.glb')
  return (
    <group {...props} dispose={null}>
      <group position-y={-0.0034} rotation={[0, Math.PI / 2, 0]}>
        <mesh
          geometry={nodes.capacitatorBase_C_001_DMSH?.geometry}
          material={materials.MAT_PlasticBlackGeneric}
        />
        <mesh
          geometry={nodes.capacitatorBody_C_001_DMSH?.geometry}
          position={[0, 0.004, 0]}
          scale={0.8}
        >
          <meshStandardMaterial
            color={0x468234}
            metalness={0.33}
            roughness={0.5}
          />
        </mesh>
        <mesh
          geometry={nodes.capacitatorContacts_C_001_DMSH?.geometry}
          position={[0, -0.007, 0]}
        >
          <meshStandardMaterial
            color={0x888888}
            metalness={0.5}
            roughness={0.5}
          />
        </mesh>
        <mesh
          geometry={nodes.capacitatorMetalCap_C_001_DMSH?.geometry}
          material={materials.MAT_MetalBasic}
          position={[0, 0.00849, 0]}
        />
        <Text
          fontSize={0.1}
          scale={0.015}
          rotation-x={-Math.PI / 2}
          position-x={0.0008}
          position-y={0.00859}
        >
          +
        </Text>
        <Text
          fontSize={0.1}
          scale={0.015}
          rotation-x={-Math.PI / 2}
          position-x={-0.0008}
          position-y={0.00859}
        >
          -
        </Text>
      </group>
    </group>
  )
}
