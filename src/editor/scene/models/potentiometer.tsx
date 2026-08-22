import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { ComponentProps } from 'react'
import type * as THREE from 'three'
import { mg } from '#/sim/types'

export interface KnobHandle {
  /** 0..1 → knob rotation (270° sweep). */
  setPosition: (p: number) => void
}

type Props = ComponentProps<'group'> & { position0?: number }

const BODY_W = 0.95
const BODY_H = 0.5
const BODY_D = 0.95
const SHAFT_R = 0.22
const SHAFT_H = 0.45
const SWEEP = (Math.PI * 3) / 2

/** Procedural breadboard trim-pot: square blue body, metal shaft with a pointer, 3 legs. */
export const PotentiometerModel = forwardRef<KnobHandle, Props>(
  function PotentiometerModel({ position0 = 0.5, ...props }, ref) {
    const shaft = useRef<THREE.Group>(null)
    const angle = (p: number) => -SWEEP / 2 + p * SWEEP
    useImperativeHandle(ref, () => ({
      setPosition(p) {
        if (shaft.current) shaft.current.rotation.y = angle(p)
      },
    }))
    return (
      <group {...props} dispose={null}>
        <mesh position-y={BODY_H / 2}>
          <boxGeometry args={[BODY_W, BODY_H, BODY_D]} />
          <meshStandardMaterial color="#2457c5" roughness={0.6} />
        </mesh>
        <group ref={shaft} position-y={BODY_H} rotation-y={angle(position0)}>
          <mesh position-y={SHAFT_H / 2}>
            <cylinderGeometry args={[SHAFT_R, SHAFT_R, SHAFT_H, 24]} />
            <meshStandardMaterial
              color="#d9d9d9"
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
          <mesh position={[0, SHAFT_H + 0.005, SHAFT_R * 0.55]}>
            <boxGeometry args={[0.05, 0.02, SHAFT_R * 0.9]} />
            <meshStandardMaterial color="#222222" />
          </mesh>
        </group>
        {[-1, 0, 1].map((i) => (
          <mesh key={i} position={[i * mg, -0.3, BODY_D / 2 - 0.1]}>
            <boxGeometry args={[0.06, 0.6, 0.06]} />
            <meshStandardMaterial
              color="#b8b8b8"
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
        ))}
      </group>
    )
  },
)
