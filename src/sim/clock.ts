type Listener = () => void

const raf: (cb: (t: number) => void) => number =
  typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(() => cb(performance.now()), 16) as unknown as number
const caf: (id: number) => void =
  typeof cancelAnimationFrame === 'function'
    ? (id) => cancelAnimationFrame(id)
    : (id) => clearTimeout(id)

/**
 * Playback clock. Advances `time` (ms of simulated time) in `tickLength`
 * steps at `rate` × wall-clock speed. The circuit pauses it when playback
 * catches up with the latest simulated sample and resumes after each window.
 */
export class Clock {
  tickLength: number
  rate: number
  time = 0
  tick = 0
  private internalTime = 0
  private lastTimestamp: number | null = null
  private rafId: number | null = null
  private listeners = new Set<Listener>()

  constructor(opts: { tickLength?: number; rate?: number } = {}) {
    this.tickLength = opts.tickLength ?? 16.666
    this.rate = opts.rate ?? 1
  }

  setRate = (rate: number) => {
    this.rate = rate
  }

  start = () => {
    this.internalTime = 0
    this.setTime(0)
    this.setTick(0)
    this.schedule()
  }

  pause = () => {
    if (this.rafId !== null) {
      caf(this.rafId)
      this.rafId = null
    }
  }

  resume = () => {
    this.schedule()
  }

  stop = () => {
    this.pause()
    this.internalTime = 0
    this.setTime(0)
    this.setTick(0)
  }

  /** Subscribe to time changes; returns a disposer. */
  onChange = (fn: Listener) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private schedule() {
    if (this.rafId !== null) return
    this.lastTimestamp = performance.now()
    this.rafId = raf(this.loop)
  }

  private loop = (now: number) => {
    const delta = now - (this.lastTimestamp ?? now)
    this.lastTimestamp = now
    this.internalTime += delta * this.rate
    const tick = Math.floor(this.internalTime / this.tickLength)
    this.rafId = raf(this.loop)
    if (tick > this.tick) {
      this.setTick(tick)
      this.setTime(this.internalTime)
    }
  }

  setTime(t: number) {
    if (t === this.time) return
    this.time = t
    this.listeners.forEach((l) => l())
  }

  setTick(t: number) {
    this.tick = t
  }
}

/**
 * Time-series sampler driven by its own clock. Used by interactive parts
 * (e.g. a tactile switch) to record user input between sim windows.
 */
export class Sampler<T = number> {
  times: number[] = []
  samples: T[] = []
  rate: number
  collector: (() => T) | null = null
  private clock?: Clock
  private disposer?: () => void

  constructor(opts: { rate?: number } = {}) {
    this.rate = opts.rate ?? 16.666
  }

  start() {
    this.times = []
    this.samples = []
    this.clock = new Clock({ tickLength: this.rate })
    const collect = () => {
      if (this.collector && this.clock) {
        this.times.push(this.clock.time)
        this.samples.push(this.collector())
      }
    }
    collect()
    this.disposer = this.clock.onChange(collect)
    this.clock.start()
  }

  flush() {
    this.times = []
    this.samples = []
    this.clock?.start()
  }

  stop() {
    this.times = []
    this.samples = []
    this.clock?.stop()
    this.disposer?.()
  }

  setCollector(fn: () => T) {
    this.collector = fn
  }

  /** Rescale recorded times so the last sample lands on `duration`. */
  resampled(duration: number) {
    const scale = duration / this.times[this.times.length - 1]
    return this.times.map((t) => t * scale)
  }
}
