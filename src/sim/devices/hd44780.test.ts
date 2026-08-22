import { describe, expect, test } from 'bun:test'
import { HD44780, romGlyph } from './hd44780'

/** Drive the chip the way LiquidCrystal's 4-bit init + print does. */
function fourBitInit(lcd: HD44780) {
  lcd.writeNibble(false, 0x3)
  lcd.writeNibble(false, 0x3)
  lcd.writeNibble(false, 0x3)
  lcd.writeNibble(false, 0x2) // 4-bit
  lcd.write(false, 0x28) // function set: 4-bit, 2 lines, 5x8
  lcd.write(false, 0x0c) // display on
  lcd.write(false, 0x01) // clear
  lcd.write(false, 0x06) // entry mode: increment
}

function print(lcd: HD44780, s: string) {
  for (const ch of s) {
    const code = ch.charCodeAt(0)
    lcd.writeNibble(true, code >> 4)
    lcd.writeNibble(true, code & 0xf)
  }
}

describe('HD44780', () => {
  test('prints on line 1 and line 2 via setCursor', () => {
    const lcd = new HD44780()
    fourBitInit(lcd)
    print(lcd, 'hello, world!')
    lcd.write(false, 0x80 | 0x40) // setCursor(0,1)
    print(lcd, '42')
    expect(lcd.text(0)).toBe('hello, world!   ')
    expect(lcd.text(1)).toBe('42              ')
    expect(lcd.displayOn).toBe(true)
    expect(lcd.cursor).toEqual({ col: 2, row: 1 })
  })

  test('clear resets memory and cursor; home resets shift', () => {
    const lcd = new HD44780()
    fourBitInit(lcd)
    print(lcd, 'abc')
    const v = lcd.version
    lcd.write(false, 0x01)
    expect(lcd.text(0)).toBe(' '.repeat(16))
    expect(lcd.cursor).toEqual({ col: 0, row: 0 })
    expect(lcd.version).toBeGreaterThan(v)
  })

  test('display shift scrolls the visible window', () => {
    const lcd = new HD44780()
    fourBitInit(lcd)
    print(lcd, 'ABCDEFGHIJKLMNOPQR')
    lcd.write(false, 0x18) // shift display left
    expect(lcd.text(0)).toBe('BCDEFGHIJKLMNOPQ')
    lcd.write(false, 0x02) // home
    expect(lcd.text(0)).toBe('ABCDEFGHIJKLMNOP')
  })

  test('custom glyphs land in CGRAM and are addressable as codes 0-7', () => {
    const lcd = new HD44780()
    fourBitInit(lcd)
    const heart = [0x00, 0x0a, 0x1f, 0x1f, 0x0e, 0x04, 0x00, 0x00]
    lcd.write(false, 0x40 | (1 << 3)) // createChar(1, …)
    heart.forEach((row) => lcd.write(true, row))
    lcd.write(false, 0x80) // back to DDRAM
    lcd.write(true, 1)
    expect(lcd.glyph(1)).toEqual(heart)
    expect(lcd.line(0)[0]).toBe(1)
    expect(lcd.snapshot().cgram[1]).toEqual(heart)
  })

  test('display/cursor/blink flags', () => {
    const lcd = new HD44780()
    fourBitInit(lcd)
    lcd.write(false, 0x0f)
    expect(lcd.cursorOn && lcd.blink && lcd.displayOn).toBe(true)
    lcd.write(false, 0x08)
    expect(lcd.displayOn).toBe(false)
  })

  test('ROM font has sensible glyphs', () => {
    const A = romGlyph(0x41)
    expect(A).toHaveLength(8)
    expect(A[0]).toBe(0b01110) // top of 'A'
    expect(A[7]).toBe(0)
    expect(romGlyph(0x20).every((r) => r === 0)).toBe(true)
  })
})
