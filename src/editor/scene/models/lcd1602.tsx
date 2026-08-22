import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react'
import type { ComponentProps } from 'react'
import * as THREE from 'three'
import { mg } from '#/sim/types'
import { LCD_COLS, LCD_ROWS, romGlyph } from '#/sim/devices/hd44780'
import type { LcdSnapshot } from '#/sim/devices/hd44780'

export interface LcdHandle {
  update: (s: LcdSnapshot) => void
}

type Props = ComponentProps<'group'> & { i2c?: boolean }

// Module geometry in scene units (1 unit ≈ 10 mm): 80 × 36 mm PCB, 10 mm tall with header.
const PCB_W = 8
const PCB_D = 3.6
const PCB_T = 0.16
const BEZEL_W = 7.1
const BEZEL_D = 2.4
const BEZEL_T = 0.5
const GLASS_W = 6.5
const GLASS_D = 1.6
const PIN_H = 0.9

// Texture: 16×2 cells of 5×8 dots
const DOT = 6
const GAP = 1
const CELL_W = 5 * DOT + 4 * GAP
const CELL_H = 8 * DOT + 7 * GAP
const CELL_GAP_X = 5
const CELL_GAP_Y = 10
const PAD = 16
const TEX_W = PAD * 2 + LCD_COLS * CELL_W + (LCD_COLS - 1) * CELL_GAP_X
const TEX_H = PAD * 2 + LCD_ROWS * CELL_H + (LCD_ROWS - 1) * CELL_GAP_Y

const COLORS = {
  on: { bg: '#1f4fc4', dotOff: '#2a5bd0', dotOn: '#e8f1ff' },
  off: { bg: '#6d7a6a', dotOff: '#66735f', dotOn: '#1a2118' },
}

function draw(
  ctx: CanvasRenderingContext2D,
  s: LcdSnapshot,
  blinkPhase: boolean,
) {
  const c = s.backlight ? COLORS.on : COLORS.off
  ctx.fillStyle = c.bg
  ctx.fillRect(0, 0, TEX_W, TEX_H)
  for (let row = 0; row < LCD_ROWS; row++) {
    for (let col = 0; col < LCD_COLS; col++) {
      const x0 = PAD + col * (CELL_W + CELL_GAP_X)
      const y0 = PAD + row * (CELL_H + CELL_GAP_Y)
      const code = s.lines[row]?.[col] ?? 0x20
      const glyph = s.displayOn
        ? code < 8
          ? s.cgram[code]
          : romGlyph(code)
        : null
      const isCursor =
        s.displayOn && s.cursor?.row === row && s.cursor.col === col
      const underline = isCursor && s.cursorOn
      const blinkBlock = isCursor && s.blink && blinkPhase
      for (let r = 0; r < 8; r++) {
        const bits = blinkBlock
          ? 0x1f
          : (glyph?.[r] ?? 0) | (underline && r === 7 ? 0x1f : 0)
        for (let k = 0; k < 5; k++) {
          const lit = (bits & (1 << (4 - k))) !== 0
          ctx.fillStyle = lit ? c.dotOn : c.dotOff
          ctx.fillRect(x0 + k * (DOT + GAP), y0 + r * (DOT + GAP), DOT, DOT)
        }
      }
    }
  }
}

const BLANK: LcdSnapshot = {
  lines: [new Array(LCD_COLS).fill(0x20), new Array(LCD_COLS).fill(0x20)],
  cursor: null,
  cursorOn: false,
  blink: false,
  displayOn: false,
  backlight: true,
  cgram: [],
  version: 0,
}

/**
 * Procedural 16×2 character LCD: PCB, bezel, glass with a CanvasTexture of the
 * dot matrix, and a pin header along the back edge (16-pin parallel, or a
 * 4-pin I²C backpack). `update(snapshot)` redraws the glass.
 */
export const Lcd1602Model = forwardRef<LcdHandle, Props>(function Lcd1602Model(
  { i2c = false, ...props },
  ref,
) {
  const canvas = useMemo(() => {
    const el = document.createElement('canvas')
    el.width = TEX_W
    el.height = TEX_H
    return el
  }, [])
  const texture = useMemo(() => {
    const t = new THREE.CanvasTexture(canvas)
    t.colorSpace = THREE.SRGBColorSpace
    t.minFilter = THREE.LinearFilter
    return t
  }, [canvas])
  const glass = useRef<THREE.MeshStandardMaterial>(null)
  const last = useRef<LcdSnapshot>(BLANK)
  const blink = useRef(false)

  const redraw = (s: LcdSnapshot) => {
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    draw(ctx, s, blink.current)
    texture.needsUpdate = true
    if (glass.current) glass.current.emissiveIntensity = s.backlight ? 1.4 : 0
  }

  useEffect(() => {
    redraw(BLANK)
    return () => texture.dispose()
  }, [texture])

  // cursor blink at ~2 Hz, only while a snapshot asks for it
  useEffect(() => {
    const id = setInterval(() => {
      if (!last.current.blink || !last.current.displayOn) return
      blink.current = !blink.current
      redraw(last.current)
    }, 500)
    return () => clearInterval(id)
  }, [])

  useImperativeHandle(ref, () => ({
    update(s) {
      last.current = s
      redraw(s)
    },
  }))

  const pinCount = i2c ? 4 : 16
  const pinX0 = i2c ? -PCB_W / 2 + 4 * mg : -((pinCount - 1) * mg) / 2
  return (
    <group {...props} dispose={null}>
      {/* PCB */}
      <mesh position-y={PCB_T / 2}>
        <boxGeometry args={[PCB_W, PCB_T, PCB_D]} />
        <meshStandardMaterial color="#1f6b3a" roughness={0.7} />
      </mesh>
      {/* bezel */}
      <mesh position-y={PCB_T + BEZEL_T / 2}>
        <boxGeometry args={[BEZEL_W, BEZEL_T, BEZEL_D]} />
        <meshStandardMaterial color="#111111" roughness={0.5} metalness={0.2} />
      </mesh>
      {/* glass */}
      <mesh position-y={PCB_T + BEZEL_T + 0.005} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[GLASS_W, GLASS_D]} />
        <meshStandardMaterial
          ref={glass}
          map={texture}
          emissiveMap={texture}
          emissive="#ffffff"
          emissiveIntensity={1.4}
          toneMapped={false}
          roughness={0.3}
        />
      </mesh>
      {/* header */}
      {Array.from({ length: pinCount }, (_, i) => (
        <group key={i} position={[pinX0 + i * mg, 0, -PCB_D / 2 + mg]}>
          <mesh position-y={PCB_T + 0.12}>
            <boxGeometry args={[mg * 0.95, 0.24, mg * 0.95]} />
            <meshStandardMaterial color="#111111" />
          </mesh>
          <mesh position-y={-PIN_H / 2 + 0.02}>
            <boxGeometry args={[0.06, PIN_H, 0.06]} />
            <meshStandardMaterial
              color="#b8b8b8"
              metalness={0.6}
              roughness={0.4}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
})
