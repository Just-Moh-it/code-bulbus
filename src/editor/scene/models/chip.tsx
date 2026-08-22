import type { ComponentProps } from 'react'
import { Text } from '@react-three/drei'
import { useModel } from './util'

type Props = ComponentProps<'group'> & { name?: string }

/** DIP-8 package with an engraved label (used by the custom chip and the 555). */
export function EightPinChipModel({ name = 'Untitled', ...props }: Props) {
  const { nodes } = useModel('/8-pin-ic.glb')
  return (
    <group {...props} dispose={null}>
      <group position-y={-0.004} rotation-y={Math.PI / 2}>
        <Text
          fontSize={0.1}
          scale={0.014}
          rotation-x={-Math.PI / 2}
          rotation-z={Math.PI / 2}
          position-y={0.0052}
        >
          {name || 'Untitled'}
        </Text>
        <mesh
          geometry={nodes.dipChip8Case_C_001_DMSH?.geometry}
          position-y={0.0035}
        >
          <meshStandardMaterial
            color="#4a4a4a"
            metalness={0.3}
            roughness={0.4}
          />
        </mesh>
        <mesh geometry={nodes.dipChip8Pins_C_001_DMSH?.geometry}>
          <meshStandardMaterial color="gray" metalness={0.3} roughness={0.4} />
        </mesh>
      </group>
    </group>
  )
}

export function TimerModel(props: ComponentProps<'group'>) {
  return <EightPinChipModel {...props} name="UA555" />
}
