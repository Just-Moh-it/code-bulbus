import { useLayoutEffect } from 'react'
import type { ComponentProps } from 'react'
import { Text } from '@react-three/drei'
import { useModel } from './util'

type Props = ComponentProps<'group'> & { voltage?: number }

export function BatteryModel({ voltage = 9, ...props }: Props) {
  const { nodes, materials } = useModel('/battery.glb')

  useLayoutEffect(() => {
    if (materials.lambert1) materials.lambert1.roughness = 0.9
    if (materials.lambert4) materials.lambert4.roughness = 0.9
  }, [materials])

  return (
    <group {...props} dispose={null}>
      <group position-y={-0.0019}>
        <group position-y={0.0046}>
          <Text
            fontSize={0.1}
            scale={0.015}
            rotation-x={-Math.PI / 2}
            position-x={-0.0009}
            position-z={-0.008}
          >
            +
          </Text>
          <Text fontSize={0.1} scale={0.015} rotation-x={-Math.PI / 2}>
            {`${voltage.toFixed(1)} Volts`}
          </Text>
          <Text
            fontSize={0.1}
            scale={0.015}
            rotation-x={-Math.PI / 2}
            position-x={0.0009}
            position-z={-0.008}
          >
            -
          </Text>
          <mesh
            geometry={nodes.pinheaderMetal_C_003_DMSH001?.geometry}
            position-z={-0.01}
            rotation={[-Math.PI, -Math.PI / 2, 0]}
            scale={0.7}
          >
            <meshStandardMaterial
              color="gray"
              metalness={0.3}
              roughness={0.4}
            />
          </mesh>
          <mesh
            geometry={nodes.pinheaderPlastic_C_002_DMSH001?.geometry}
            material={materials['MAT_PlasticBlackGeneric.001']}
            position-z={-0.01}
            scale={0.7}
            rotation={[0, -Math.PI / 2, 0]}
            material-color="#111111"
          />
        </group>
        <group position={[0, 0, 0]} scale={0.01}>
          <mesh
            geometry={nodes.Mesh?.geometry}
            material={materials.lambert4}
            material-color="#333333"
            material-metalness={0.2}
            material-roughness={0.1}
          />
          <mesh
            geometry={nodes.Mesh_1?.geometry}
            material={materials.lambert1}
            material-color="#111111"
            material-metalness={0.2}
            material-roughness={0.1}
          />
          <mesh
            geometry={nodes.Mesh_2?.geometry}
            material={materials.black_bump}
            material-color="#111111"
            material-metalness={0.3}
            material-roughness={0.1}
          />
        </group>
      </group>
    </group>
  )
}
