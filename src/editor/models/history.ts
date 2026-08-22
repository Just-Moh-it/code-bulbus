type Listener<T> = (ev: {
  action: 'push' | 'undo' | 'redo'
  item: T
  index: number
}) => void

/** Generic undo/redo stack of JSON snapshots (limit 30). Mirrors the reference `History`. */
export class History<T> {
  stack: T[]
  activeIndex: number
  limit: number
  private listeners = new Set<Listener<T>>()

  constructor(stack: T[] = [], limit = 30) {
    this.stack = stack
    this.activeIndex = stack.length - 1
    this.limit = limit
  }

  get activeItem(): T {
    return this.stack[this.activeIndex]
  }

  push(item: T) {
    if (JSON.stringify(item) === JSON.stringify(this.activeItem)) return
    if (this.stack.length === this.limit) {
      // reference behaviour: shift + push without moving activeIndex or notifying
      this.stack.shift()
      this.stack.push(item)
    } else {
      this.activeIndex += 1
      this.stack.splice(this.activeIndex)
      this.stack[this.activeIndex] = item
      this.notify('push')
    }
  }

  undo() {
    this.activeIndex = Math.max(this.activeIndex - 1, 0)
    this.notify('undo')
  }

  redo() {
    this.activeIndex = Math.min(this.activeIndex + 1, this.stack.length - 1)
    this.notify('redo')
  }

  onChange(fn: Listener<T>) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private notify(action: 'push' | 'undo' | 'redo') {
    const ev = { action, item: this.activeItem, index: this.activeIndex }
    this.listeners.forEach((l) => l(ev))
  }
}

/** Parses "4.7k", "100 ohm", "10uF" style strings. Mirrors the reference `UnitParser`. */
export class UnitParser {
  units: string[]
  defaultUnit: string

  constructor(opts: { units: string[]; defaultUnit: string }) {
    this.units = [...opts.units].sort((a, b) => b.length - a.length)
    this.defaultUnit = opts.defaultUnit
  }

  parse(str: string): { value: number; unit: string } {
    const s = str.trim()
    const n = Number(s)
    if (s.length && !isNaN(n)) return { value: n, unit: this.defaultUnit }
    for (const u of this.units) {
      if (s.endsWith(u)) {
        const v = Number(s.slice(0, -u.length))
        if (isNaN(v)) throw new Error(`Parse Error: could not parse "${s}"`)
        return { value: v, unit: u }
      }
    }
    throw new Error(`Parse Error: could not parse "${s}"`)
  }
}
