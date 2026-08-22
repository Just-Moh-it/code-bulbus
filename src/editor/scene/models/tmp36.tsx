import type { ComponentProps } from 'react'
import { mg } from '#/sim/types'

const R = 0.25
const H = 0.5

/** TO-92 package: black half-cylinder body with a flat face, three legs. */
export function Tmp36Model(props: ComponentProps<'group'>) {
  return (
    <group {...props} dispose={null}>
      <mesh position-y={H / 2} rotation-y={Math.PI / 2}>
        <cylinderGeometry args={[R, R, H, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} />
      </mesh>
      <mesh position={[0, H / 2, -0.0]} rotation-y={Math.PI / 2}>
        <boxGeometry args={[0.02, H, 2 * R]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} />
      </mesh>
      <mesh
        position-y={H + 0.02}
        rotation-x={-Math.PI / 2}
        rotation-z={Math.PI / 2}
      >
        <circleGeometry args={[R, 24, 0, Math.PI]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.5} />
      </mesh>
      {[-1, 0, 1].map((i) => (
        <mesh key={i} position={[i * mg, -0.3, 0]}>
          <boxGeometry args={[0.05, 0.6, 0.05]} />
          <meshStandardMaterial
            color="#b8b8b8"
            metalness={0.6}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  )
}
