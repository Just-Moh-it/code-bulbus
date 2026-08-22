import type { ComponentProps } from 'react'
import { resistorBands, useModel } from './util'

type Props = ComponentProps<'group'> & { kohms?: number }

export function ResistorModel({ kohms = 1, ...props }: Props) {
  const { nodes, materials } = useModel('/resistor.glb')
  const bands = resistorBands(kohms * 1000, 1)
  return (
    <group {...props} dispose={null}>
      <group rotation-x={Math.PI / 2} position-y={0.00025}>
        <group name="bands" position-y={-0.00025}>
          <mesh name="band-1" position-y={-0.002}>
            <cylinderGeometry args={[0.001141, 0.00121, 0.0005, 24, 12]} />
            <meshStandardMaterial color={bands[0]} />
          </mesh>
          <mesh name="band-2" position-y={-0.001}>
            <cylinderGeometry args={[0.00109, 0.00112, 0.0005, 12, 12]} />
            <meshStandardMaterial color={bands[1]} />
          </mesh>
          <mesh name="band-3" position-y={0}>
            <cylinderGeometry args={[0.00106, 0.00106, 0.0005, 12, 12]} />
            <meshStandardMaterial color={bands[2]} />
          </mesh>
          <mesh name="multiplier" position-y={0.001}>
            <cylinderGeometry args={[0.00107, 0.00106, 0.0005, 12, 12]} />
            <meshStandardMaterial color={bands[3]} />
          </mesh>
          <mesh name="tolerance" position-y={0.0025}>
            <cylinderGeometry args={[0.0012, 0.00114, 0.0005, 24, 12]} />
            <meshStandardMaterial color={bands[4]} />
          </mesh>
        </group>
      </group>
      <group
        rotation={[0, Math.PI / 2, 0]}
        position-y={-0.004}
        position-z={0.00508}
      >
        <mesh
          name="wire"
          geometry={nodes.resistorElement_C_001_DMSH?.geometry}
          material={materials.MAT_MetalBasic}
          rotation={[-Math.PI, 0, 0]}
          scale={-1}
        />
        <mesh
          name="pill"
          geometry={nodes.resistorElement_C_002_DMSH?.geometry}
          position={[0.005, 0.002, 0]}
        >
          <meshStandardMaterial color="tan" />
        </mesh>
      </group>
    </group>
  )
}
