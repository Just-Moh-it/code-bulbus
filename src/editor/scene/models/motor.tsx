import { forwardRef, useImperativeHandle, useRef } from 'react'
import type { ComponentProps } from 'react'
import type * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useModel } from './util'

export interface SpeedHandle {
  setSpeed: (v: number) => void
}

export const MotorModel = forwardRef<SpeedHandle, ComponentProps<'group'>>(
  function MotorModel(props, ref) {
    const { nodes, materials } = useModel('/motor.glb')
    const rotor = useRef<THREE.Group>(null)
    const speed = useRef(0)

    useImperativeHandle(ref, () => ({
      setSpeed(v) {
        speed.current = v
      },
    }))

    // Priority must stay 0: a useFrame with renderPriority > 0 hands the render
    // loop to the caller, and nothing here calls gl.render(), so mounting a
    // motor would freeze the editor canvas. Use the delta argument rather than
    // clock.getDelta(), which consumes the delta R3F reads once per frame.
    useFrame((_, delta) => {
      if (rotor.current) rotor.current.rotation.y += delta * speed.current
    })

    return (
      <group {...props} dispose={null}>
        <group position-y={-10.25}>
          <group
            position={[-0.15, 0.01, 0.07]}
            rotation={[Math.PI / 2, Math.PI / 2, 0]}
            scale={1}
          >
            <mesh
              geometry={nodes.Boolean?.geometry}
              position={[0.42, -2.11, 0]}
              scale={[1.31, 1.13, 1.11]}
            >
              <meshStandardMaterial
                color="gray"
                metalness={0.5}
                roughness={0.6}
              />
            </mesh>
            <group position-x={0.5}>
              <mesh
                geometry={nodes.Cylinder001?.geometry}
                position={[0, 5.44, 0.06]}
                scale-x={0.8}
                scale-z={0.8}
              >
                <meshStandardMaterial
                  color="gray"
                  metalness={0.3}
                  roughness={0.5}
                />
              </mesh>
              <group ref={rotor}>
                <mesh
                  geometry={nodes.Shape_3?.geometry}
                  position={[0, 7.2, 0.1]}
                  rotation={[-Math.PI / 2, 0, 0]}
                  scale={0.75}
                >
                  <meshPhongMaterial color="#444444" />
                </mesh>
              </group>
            </group>
          </group>
          <mesh
            geometry={nodes.pinheaderMetal_C_003_DMSH003?.geometry}
            position={[0, 5.2, -5.5]}
            rotation={[-Math.PI, -Math.PI / 2, 0]}
            scale={670}
          >
            <meshStandardMaterial
              color="gray"
              metalness={0.3}
              roughness={0.4}
            />
          </mesh>
          <mesh
            geometry={nodes.pinheaderPlastic_C_002_DMSH003?.geometry}
            material={materials['MAT_PlasticBlackGeneric.003']}
            position={[0, 5.2, -5.5]}
            rotation={[0, -Math.PI / 2, 0]}
            scale={670}
          />
        </group>
      </group>
    )
  },
)
