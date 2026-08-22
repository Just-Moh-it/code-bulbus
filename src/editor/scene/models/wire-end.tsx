import type { ComponentProps } from 'react'

export function WireEndModel(props: ComponentProps<'group'>) {
  return (
    <group {...props}>
      <mesh>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhongMaterial color="#333333" />
      </mesh>
    </group>
  )
}
