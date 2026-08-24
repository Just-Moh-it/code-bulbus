import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import type { ComponentProps } from 'react'
import type * as THREE from 'three'
import { emissiveFor, useModel } from './util'

export interface IntensityHandle {
  setIntensity: (t: number) => void
}

type Props = ComponentProps<'group'> & { isOn?: boolean }

/**
 * Component groups on the board. Node names follow three's GLTFLoader:
 * single-primitive nodes keep the node name; multi-primitive meshes use the
 * mesh name (`Object_2.010` → `Object_2010`, `Object_2010_1`, …).
 * Reference positions are identical to the file's own translations.
 */
const GROUPS: {
  node: string
  pos: [number, number, number]
  mats: string[]
}[] = [
  {
    node: 'Object_2002',
    pos: [-36.68, 0.4, -58.41],
    mats: ['Solder.010', 'Plastic_White.010', 'Gold.010', 'DEL_Green.010'],
  }, // + power LED
  {
    node: 'Object_2003',
    pos: [-27.94, 0.48, -59.36],
    mats: ['Solder.010', 'Plastic_White.010', 'Plastic_Black.010'],
  },
  {
    node: 'Object_2004',
    pos: [-22.73, 0.31, -41.17],
    mats: ['Solder.010', 'Plastic_White.010', 'Plastic_Black.010'],
  },
  {
    node: 'Object_2005',
    pos: [-10.56, 0.45, -38.76],
    mats: ['Solder.010', 'Plastic_Orange.010'],
  },
  {
    node: 'Object_2006',
    pos: [-10.36, 0.45, -43.53],
    mats: ['Solder.010', 'Plastic_Orange.010'],
  },
  {
    node: 'Object_2007',
    pos: [-15.37, 0.45, -18.23],
    mats: ['Solder.010', 'Plastic_Orange.010'],
  },
  { node: 'Object_6007', pos: [-15.28, 0.45, -25.44], mats: ['Solder.010'] },
  { node: 'Object_6008', pos: [-29.89, 0.45, -11.87], mats: ['Solder.010'] },
  {
    node: 'Object_2011',
    pos: [-29.57, 0.45, -15.85],
    mats: ['Solder.010', 'Plastic_Grey.010'],
  },
  {
    node: 'Object_2012',
    pos: [-29.58, 0.31, -18.98],
    mats: ['Solder.010', 'Plastic_White.010', 'Plastic_Black.010'],
  },
  {
    node: 'Object_2013',
    pos: [-29.61, 0.45, -22.2],
    mats: ['Solder.010', 'Plastic_Grey.010'],
  },
  {
    node: 'Object_2014',
    pos: [-29.83, 0.45, -27.82],
    mats: ['Solder.010', 'Plastic_Orange.010'],
  },
  {
    node: 'Object_2015',
    pos: [-31.53, 0.45, -27.84],
    mats: ['Solder.010', 'Plastic_Orange.010'],
  },
  {
    node: 'Object_2016',
    pos: [-34.32, 0.4, -27.81],
    mats: [
      'Solder.010',
      'Plastic_White.010',
      'Gold.010',
      'DEL_Green.010',
      'Led_Glass_Green.010',
    ],
  },
  {
    node: 'Object_2017',
    pos: [-36.61, 0.4, -27.81],
    mats: [
      'Solder.010',
      'Plastic_White.010',
      'Gold.010',
      'DEL_Green.010',
      'Led_Glass_Green.010',
    ],
  },
  {
    node: 'Object_2018',
    pos: [-33.68, 0.3, -12.59],
    mats: ['Solder.010', 'Plastic_White.010', 'Plastic_Black.010'],
  },
  {
    node: 'Object_2019',
    pos: [-39.4, 0.3, -12.61],
    mats: ['Solder.010', 'Plastic_White.010', 'Plastic_Black.010'],
  },
  {
    node: 'Object_2020',
    pos: [-44.48, 0.45, -27.89],
    mats: ['Solder.010', 'Plastic_Orange.010'],
  },
  {
    node: 'Object_2021',
    pos: [-41.94, 0.45, -12.51],
    mats: ['Solder.010', 'Plastic_Orange.010'],
  },
  {
    node: 'Object_2022',
    pos: [-45.07, 0.45, -7.49],
    mats: ['Solder.010', 'Plastic_Grey.010'],
  },
  {
    node: 'Object_2023',
    pos: [-42.26, 0.4, -27.88],
    mats: ['Solder.010', 'Plastic_White.010', 'Gold.010', 'DEL_Green.010'],
  }, // + pin-13 LED
]

const BOARD_MATS = [
  'TextureTopOverlay.010',
  'PCB_FR4.010',
  'TextureBottomOverlay.010',
  'Solder.010',
  'Plastic_White.010',
  'Copper_Alloy.010',
  'Plastic_Black.010',
  'Aluminium_Brushed.010',
  'Gold.010',
  'Plastic_Brown.010',
  'Plastic_Orange.010',
  'Plastic_Grey.010',
  'DEL_Green.010',
  'Led_Glass_Green.010',
]

/**
 * The silkscreen layers are separate meshes coplanar with the PCB face, so the
 * depth test can't order them and the pin labels flicker as the camera moves.
 * Bias them toward the camera (the standard decal fix) and draw them after the
 * board.
 */
const OVERLAY_MATS = new Set([
  'TextureTopOverlay.010',
  'TextureBottomOverlay.010',
])
const overlayProps = (m: string) =>
  OVERLAY_MATS.has(m)
    ? ({
        renderOrder: 1,
        'material-polygonOffset': true,
        'material-polygonOffsetFactor': -4,
        'material-polygonOffsetUnits': -4,
        'material-depthWrite': false,
      } as const)
    : {}

const prim = (node: string, i: number) => (i === 0 ? node : `${node}_${i}`)

/** Arduino Uno board. Exposes setIntensity() for the on-board pin-13 LED. */
export const ArduinoUnoModel = forwardRef<IntensityHandle, Props>(
  function ArduinoUnoModel({ isOn = false, ...props }, ref) {
    const { nodes, materials } = useModel('/arduino-uno.glb')
    const led = useRef<THREE.Mesh>(null)
    const glass = nodes.Object_2002_4?.geometry // green LED glass, reused for both emissive LEDs

    useLayoutEffect(() => {
      const mat = led.current?.material as
        THREE.MeshStandardMaterial | undefined
      if (mat) mat.emissiveIntensity = 0.99
    }, [])

    useImperativeHandle(ref, () => ({
      setIntensity(t) {
        const mat = led.current?.material as
          THREE.MeshStandardMaterial | undefined
        if (mat) mat.emissiveIntensity = emissiveFor(t, [0.99, 20])
      },
    }))

    return (
      <group {...props} dispose={null}>
        <group
          rotation={[0, Math.PI / 2, 0]}
          receiveShadow={false}
          castShadow={false}
        >
          <group position-y={-2}>
            <group>
              {BOARD_MATS.map((m, i) => (
                <mesh
                  key={m}
                  geometry={nodes[prim('Object_2010', i)]?.geometry}
                  material={materials[m]}
                  material-color={
                    m === 'Aluminium_Brushed.010' ? 'white' : undefined
                  }
                  {...overlayProps(m)}
                />
              ))}
            </group>
            <group
              position={[-31.17, -3.5, 26.67]}
              rotation={[0, -Math.PI / 2, 0]}
            >
              {GROUPS.map((g) => (
                <group key={g.node} position={g.pos} rotation={[0, 1.57, 0]}>
                  {g.mats.map((m, i) => (
                    <mesh
                      key={m + i}
                      geometry={nodes[prim(g.node, i)]?.geometry}
                      material={materials[m]}
                    />
                  ))}
                  {g.node === 'Object_2002' && (
                    <mesh geometry={glass}>
                      <meshStandardMaterial
                        color="green"
                        emissive="green"
                        emissiveIntensity={isOn ? 20 : 1}
                        toneMapped={false}
                      />
                    </mesh>
                  )}
                  {g.node === 'Object_2023' && (
                    <mesh ref={led} geometry={glass}>
                      <meshStandardMaterial
                        color="green"
                        emissive="green"
                        toneMapped={false}
                      />
                    </mesh>
                  )}
                </group>
              ))}
            </group>
          </group>
        </group>
      </group>
    )
  },
)
