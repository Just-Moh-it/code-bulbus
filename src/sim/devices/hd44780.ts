/**
 * HD44780 character LCD controller (16×2 configuration), pure TypeScript.
 *
 * Fed with bus writes (`write(rs, data)` for 8-bit, or `writeNibble(rs, nibble)`
 * for the 4-bit interface) exactly as the real chip sees them, so the stock
 * Arduino `LiquidCrystal` / `LiquidCrystal_I2C` libraries running on avr8js drive
 * it unmodified. Reads report busy-flag clear.
 */

export const LCD_COLS = 16
export const LCD_ROWS = 2
const DDRAM_LINE = 0x40 // DDRAM address of line 2
const LINE_LEN = 0x28 // 40 cells per line in DDRAM

export interface LcdSnapshot {
  /** Character codes of the visible cells, [row][col]. */
  lines: number[][]
  cursor: { col: number; row: number } | null
  cursorOn: boolean
  blink: boolean
  displayOn: boolean
  backlight: boolean
  /** 8 custom glyphs, each 8 rows of 5-bit bitmaps. */
  cgram: number[][]
  version: number
}

export class HD44780 {
  readonly ddram = new Uint8Array(0x80).fill(0x20)
  readonly cgram = new Uint8Array(64)
  private addr = 0
  private inCgram = false
  private increment = true
  private shiftOnWrite = false
  private shift = 0
  private fourBit = false
  private twoLines = true
  private nibbleHigh: number | null = null
  displayOn = false
  cursorOn = false
  blink = false
  backlight = true
  version = 0

  private bump() {
    this.version++
  }

  // ------------------------------------------------------------------ bus
  /** 4-bit interface: two nibbles (high first) make one byte. */
  writeNibble(rs: boolean, nibble: number) {
    nibble &= 0x0f
    if (!this.fourBit) {
      // Until "function set 4-bit" has been seen, a single nibble is a full
      // (upper-half) command — this is how the init sequence works.
      this.write(rs, nibble << 4)
      return
    }
    if (this.nibbleHigh === null) {
      this.nibbleHigh = nibble
      return
    }
    const byte = (this.nibbleHigh << 4) | nibble
    this.nibbleHigh = null
    this.write(rs, byte)
  }

  /** 8-bit write; `rs` false = instruction, true = data. */
  write(rs: boolean, data: number) {
    data &= 0xff
    if (rs) this.writeData(data)
    else this.command(data)
  }

  // ------------------------------------------------------------- commands
  private command(c: number) {
    if (c & 0x80) {
      this.inCgram = false
      this.addr = c & 0x7f
    } else if (c & 0x40) {
      this.inCgram = true
      this.addr = c & 0x3f
    } else if (c & 0x20) {
      this.fourBit = (c & 0x10) === 0
      this.twoLines = (c & 0x08) !== 0
      this.nibbleHigh = null
      this.bump()
    } else if (c & 0x10) {
      const display = (c & 0x08) !== 0
      const right = (c & 0x04) !== 0
      if (display) this.shift = mod(this.shift + (right ? -1 : 1), LINE_LEN)
      else this.moveCursor(right ? 1 : -1)
      this.bump()
    } else if (c & 0x08) {
      this.displayOn = (c & 0x04) !== 0
      this.cursorOn = (c & 0x02) !== 0
      this.blink = (c & 0x01) !== 0
      this.bump()
    } else if (c & 0x04) {
      this.increment = (c & 0x02) !== 0
      this.shiftOnWrite = (c & 0x01) !== 0
    } else if (c & 0x02) {
      this.addr = 0
      this.inCgram = false
      this.shift = 0
      this.bump()
    } else if (c & 0x01) {
      this.ddram.fill(0x20)
      this.addr = 0
      this.inCgram = false
      this.shift = 0
      this.increment = true
      this.bump()
    }
  }

  private writeData(d: number) {
    if (this.inCgram) {
      this.cgram[this.addr & 0x3f] = d & 0x1f
      this.addr = (this.addr + (this.increment ? 1 : -1)) & 0x3f
    } else {
      this.ddram[this.addr & 0x7f] = d
      this.moveCursor(this.increment ? 1 : -1)
      if (this.shiftOnWrite)
        this.shift = mod(this.shift + (this.increment ? 1 : -1), LINE_LEN)
    }
    this.bump()
  }

  /** Advance the DDRAM address the way the chip does on a 2-line display. */
  private moveCursor(delta: number) {
    let a = this.addr
    if (this.twoLines) {
      const line = a >= DDRAM_LINE ? 1 : 0
      let col = a - (line ? DDRAM_LINE : 0) + delta
      let newLine = line
      if (col >= LINE_LEN) {
        col = 0
        newLine = 1 - line
      } else if (col < 0) {
        col = LINE_LEN - 1
        newLine = 1 - line
      }
      a = (newLine ? DDRAM_LINE : 0) + col
    } else {
      a = mod(a + delta, 0x50)
    }
    this.addr = a
  }

  // ------------------------------------------------------------- readout
  get cursor(): { col: number; row: number } | null {
    const row = this.addr >= DDRAM_LINE ? 1 : 0
    const col = mod(this.addr - (row ? DDRAM_LINE : 0) - this.shift, LINE_LEN)
    if (!this.twoLines && row) return null
    return col < LCD_COLS ? { col, row } : null
  }

  /** Visible cell codes for `row` (0/1) after display shift. */
  line(row: number): number[] {
    const base = row ? DDRAM_LINE : 0
    const out: number[] = []
    for (let c = 0; c < LCD_COLS; c++)
      out.push(this.ddram[base + mod(c + this.shift, LINE_LEN)])
    return out
  }

  text(row: number) {
    return String.fromCharCode(...this.line(row).map((c) => (c < 8 ? 0x20 : c)))
  }

  snapshot(): LcdSnapshot {
    const cg: number[][] = []
    for (let g = 0; g < 8; g++)
      cg.push(Array.from(this.cgram.subarray(g * 8, g * 8 + 8)))
    return {
      lines: [this.line(0), this.line(1)],
      cursor: this.cursor,
      cursorOn: this.cursorOn,
      blink: this.blink,
      displayOn: this.displayOn,
      backlight: this.backlight,
      cgram: cg,
      version: this.version,
    }
  }

  /** 8 rows of 5-bit bitmaps for a character code (ROM font or CGRAM 0–7). */
  glyph(code: number): number[] {
    if (code < 8) return Array.from(this.cgram.subarray(code * 8, code * 8 + 8))
    return romGlyph(code)
  }
}

const mod = (a: number, n: number) => ((a % n) + n) % n

// ------------------------------------------------------------------- font
/**
 * 5×7 ROM font (HD44780 A00 / classic GLCD font), column-major: 5 bytes per
 * glyph, bit 0 = top row. Codes 0x20–0x7F; anything else renders blank.
 */
const FONT5X7 = [
  0x00,
  0x00,
  0x00,
  0x00,
  0x00, // 0x20 ' '
  0x00,
  0x00,
  0x5f,
  0x00,
  0x00, // !
  0x00,
  0x07,
  0x00,
  0x07,
  0x00, // "
  0x14,
  0x7f,
  0x14,
  0x7f,
  0x14, // #
  0x24,
  0x2a,
  0x7f,
  0x2a,
  0x12, // $
  0x23,
  0x13,
  0x08,
  0x64,
  0x62, // %
  0x36,
  0x49,
  0x55,
  0x22,
  0x50, // &
  0x00,
  0x05,
  0x03,
  0x00,
  0x00, // '
  0x00,
  0x1c,
  0x22,
  0x41,
  0x00, // (
  0x00,
  0x41,
  0x22,
  0x1c,
  0x00, // )
  0x14,
  0x08,
  0x3e,
  0x08,
  0x14, // *
  0x08,
  0x08,
  0x3e,
  0x08,
  0x08, // +
  0x00,
  0x50,
  0x30,
  0x00,
  0x00, // ,
  0x08,
  0x08,
  0x08,
  0x08,
  0x08, // -
  0x00,
  0x60,
  0x60,
  0x00,
  0x00, // .
  0x20,
  0x10,
  0x08,
  0x04,
  0x02, // /
  0x3e,
  0x51,
  0x49,
  0x45,
  0x3e, // 0
  0x00,
  0x42,
  0x7f,
  0x40,
  0x00, // 1
  0x42,
  0x61,
  0x51,
  0x49,
  0x46, // 2
  0x21,
  0x41,
  0x45,
  0x4b,
  0x31, // 3
  0x18,
  0x14,
  0x12,
  0x7f,
  0x10, // 4
  0x27,
  0x45,
  0x45,
  0x45,
  0x39, // 5
  0x3c,
  0x4a,
  0x49,
  0x49,
  0x30, // 6
  0x01,
  0x71,
  0x09,
  0x05,
  0x03, // 7
  0x36,
  0x49,
  0x49,
  0x49,
  0x36, // 8
  0x06,
  0x49,
  0x49,
  0x29,
  0x1e, // 9
  0x00,
  0x36,
  0x36,
  0x00,
  0x00, // :
  0x00,
  0x56,
  0x36,
  0x00,
  0x00, // ;
  0x08,
  0x14,
  0x22,
  0x41,
  0x00, // <
  0x14,
  0x14,
  0x14,
  0x14,
  0x14, // =
  0x00,
  0x41,
  0x22,
  0x14,
  0x08, // >
  0x02,
  0x01,
  0x51,
  0x09,
  0x06, // ?
  0x32,
  0x49,
  0x79,
  0x41,
  0x3e, // @
  0x7e,
  0x11,
  0x11,
  0x11,
  0x7e, // A
  0x7f,
  0x49,
  0x49,
  0x49,
  0x36, // B
  0x3e,
  0x41,
  0x41,
  0x41,
  0x22, // C
  0x7f,
  0x41,
  0x41,
  0x22,
  0x1c, // D
  0x7f,
  0x49,
  0x49,
  0x49,
  0x41, // E
  0x7f,
  0x09,
  0x09,
  0x09,
  0x01, // F
  0x3e,
  0x41,
  0x49,
  0x49,
  0x7a, // G
  0x7f,
  0x08,
  0x08,
  0x08,
  0x7f, // H
  0x00,
  0x41,
  0x7f,
  0x41,
  0x00, // I
  0x20,
  0x40,
  0x41,
  0x3f,
  0x01, // J
  0x7f,
  0x08,
  0x14,
  0x22,
  0x41, // K
  0x7f,
  0x40,
  0x40,
  0x40,
  0x40, // L
  0x7f,
  0x02,
  0x0c,
  0x02,
  0x7f, // M
  0x7f,
  0x04,
  0x08,
  0x10,
  0x7f, // N
  0x3e,
  0x41,
  0x41,
  0x41,
  0x3e, // O
  0x7f,
  0x09,
  0x09,
  0x09,
  0x06, // P
  0x3e,
  0x41,
  0x51,
  0x21,
  0x5e, // Q
  0x7f,
  0x09,
  0x19,
  0x29,
  0x46, // R
  0x46,
  0x49,
  0x49,
  0x49,
  0x31, // S
  0x01,
  0x01,
  0x7f,
  0x01,
  0x01, // T
  0x3f,
  0x40,
  0x40,
  0x40,
  0x3f, // U
  0x1f,
  0x20,
  0x40,
  0x20,
  0x1f, // V
  0x3f,
  0x40,
  0x38,
  0x40,
  0x3f, // W
  0x63,
  0x14,
  0x08,
  0x14,
  0x63, // X
  0x07,
  0x08,
  0x70,
  0x08,
  0x07, // Y
  0x61,
  0x51,
  0x49,
  0x45,
  0x43, // Z
  0x00,
  0x7f,
  0x41,
  0x41,
  0x00, // [
  0x02,
  0x04,
  0x08,
  0x10,
  0x20, // backslash (¥ on A00)
  0x00,
  0x41,
  0x41,
  0x7f,
  0x00, // ]
  0x04,
  0x02,
  0x01,
  0x02,
  0x04, // ^
  0x40,
  0x40,
  0x40,
  0x40,
  0x40, // _
  0x00,
  0x01,
  0x02,
  0x04,
  0x00, // `
  0x20,
  0x54,
  0x54,
  0x54,
  0x78, // a
  0x7f,
  0x48,
  0x44,
  0x44,
  0x38, // b
  0x38,
  0x44,
  0x44,
  0x44,
  0x20, // c
  0x38,
  0x44,
  0x44,
  0x48,
  0x7f, // d
  0x38,
  0x54,
  0x54,
  0x54,
  0x18, // e
  0x08,
  0x7e,
  0x09,
  0x01,
  0x02, // f
  0x0c,
  0x52,
  0x52,
  0x52,
  0x3e, // g
  0x7f,
  0x08,
  0x04,
  0x04,
  0x78, // h
  0x00,
  0x44,
  0x7d,
  0x40,
  0x00, // i
  0x20,
  0x40,
  0x44,
  0x3d,
  0x00, // j
  0x7f,
  0x10,
  0x28,
  0x44,
  0x00, // k
  0x00,
  0x41,
  0x7f,
  0x40,
  0x00, // l
  0x7c,
  0x04,
  0x18,
  0x04,
  0x78, // m
  0x7c,
  0x08,
  0x04,
  0x04,
  0x78, // n
  0x38,
  0x44,
  0x44,
  0x44,
  0x38, // o
  0x7c,
  0x14,
  0x14,
  0x14,
  0x08, // p
  0x08,
  0x14,
  0x14,
  0x18,
  0x7c, // q
  0x7c,
  0x08,
  0x04,
  0x04,
  0x08, // r
  0x48,
  0x54,
  0x54,
  0x54,
  0x20, // s
  0x04,
  0x3f,
  0x44,
  0x40,
  0x20, // t
  0x3c,
  0x40,
  0x40,
  0x20,
  0x7c, // u
  0x1c,
  0x20,
  0x40,
  0x20,
  0x1c, // v
  0x3c,
  0x40,
  0x30,
  0x40,
  0x3c, // w
  0x44,
  0x28,
  0x10,
  0x28,
  0x44, // x
  0x0c,
  0x50,
  0x50,
  0x50,
  0x3c, // y
  0x44,
  0x64,
  0x54,
  0x4c,
  0x44, // z
  0x00,
  0x08,
  0x36,
  0x41,
  0x00, // {
  0x00,
  0x00,
  0x7f,
  0x00,
  0x00, // |
  0x00,
  0x41,
  0x36,
  0x08,
  0x00, // }
  0x10,
  0x08,
  0x08,
  0x10,
  0x08, // ~
  0x7f,
  0x7f,
  0x7f,
  0x7f,
  0x7f, // 0x7F block
]

const romCache = new Map<number, number[]>()

/** Convert the column-major 5×7 glyph into 8 rows of 5-bit bitmaps (MSB = left). */
export function romGlyph(code: number): number[] {
  const cached = romCache.get(code)
  if (cached) return cached
  const rows: number[] = new Array(8).fill(0)
  if (code >= 0x20 && code <= 0x7f) {
    const base = (code - 0x20) * 5
    for (let col = 0; col < 5; col++) {
      const bits = FONT5X7[base + col]
      for (let row = 0; row < 7; row++) {
        if (bits & (1 << row)) rows[row] |= 1 << (4 - col)
      }
    }
  }
  romCache.set(code, rows)
  return rows
}
