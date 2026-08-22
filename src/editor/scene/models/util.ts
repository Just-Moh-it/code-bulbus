import type * as THREE from 'three'
import { useGLTF } from '@react-three/drei'

/** Linear map with clamping (popmotion `transform`). */
export function mapRange(
  v: number,
  [inLo, inHi]: [number, number],
  [outLo, outHi]: [number, number],
) {
  const t = (v - inLo) / (inHi - inLo)
  const c = Math.min(1, Math.max(0, isNaN(t) ? 0 : t))
  return outLo + c * (outHi - outLo)
}

export type GLTFNodes = Record<string, THREE.Mesh>
export type GLTFMaterials = Record<string, THREE.MeshStandardMaterial>

export function useModel(url: string) {
  const g = useGLTF(url) as unknown as {
    nodes: GLTFNodes
    materials: GLTFMaterials
  }
  return g
}

/** Intensity easing used by the reference for LEDs: pow(t, 0.6) → [0.99, max]. */
export function emissiveFor(t: number, range: [number, number]) {
  const e = Math.pow(t, 0.6) || 0
  return mapRange(e, [0, 1], range)
}

// ---------------------------------------------------------- resistor bands
const DIGIT_COLORS = [
  'black',
  'brown',
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'grey',
  'white',
]
const MULTIPLIER_COLORS: Record<number, string> = {
  [-2]: 'silver',
  [-1]: 'gold',
  0: 'black',
  1: 'brown',
  2: 'red',
  3: 'orange',
  4: 'yellow',
  5: 'green',
  6: 'blue',
  7: 'violet',
  8: 'grey',
  9: 'white',
}
const TOLERANCE_COLORS: Record<number, string> = {
  1: 'brown',
  2: 'red',
  5: 'gold',
  10: 'silver',
  0.5: 'green',
  0.25: 'blue',
  0.1: 'violet',
}

export const BAND_COLOR_HEX: Record<string, string> = {
  black: '#000000',
  brown: '#996633',
  red: '#FF0000',
  orange: '#FF9900',
  yellow: '#FFFF00',
  green: 'green',
  blue: 'blue',
  violet: '#FF00FF',
  grey: 'grey',
  white: '#FFFFFF',
  gold: '#D4AF37',
  silver: '#C0C0C0',
}

/** 5-band colours [d1, d2, d3, multiplier, tolerance] for a resistance in ohms; 'tan' on failure. */
export function resistorBands(ohms: number, tolerance = 1): string[] {
  try {
    if (!(ohms > 0) || !isFinite(ohms)) throw new Error('bad value')
    const exp = Math.floor(Math.log10(ohms))
    let mant = Math.round(ohms / Math.pow(10, exp - 2)) // 3 significant digits
    let mult = exp - 2
    if (mant >= 1000) {
      mant = Math.round(mant / 10)
      mult += 1
    }
    const digits = String(mant).padStart(3, '0').split('').map(Number)
    const multColor = MULTIPLIER_COLORS[mult]
    const tolColor = TOLERANCE_COLORS[tolerance]
    if (!multColor || !tolColor) throw new Error('out of range')
    return [
      ...digits.map((d) => BAND_COLOR_HEX[DIGIT_COLORS[d]]),
      BAND_COLOR_HEX[multColor],
      BAND_COLOR_HEX[tolColor],
    ]
  } catch {
    return ['tan', 'tan', 'tan', 'tan', 'tan']
  }
}
