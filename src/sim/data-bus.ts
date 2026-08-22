import type { SpiceResult } from './types'

function sortedIndex(arr: number[], value: number) {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid] < value) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * Rolling store of simulation samples. Each ngspice window is appended with
 * its times offset by the previous latest time, so `times` is one continuous
 * millisecond axis. Only the last SAMPLE_LIMIT samples are kept.
 */
export class DataBus {
  static SAMPLE_LIMIT = 100

  times: number[] = []
  voltages: Record<string, (number | undefined)[]> = {}
  amperages: Record<string, (number | undefined)[]> = {}

  get SAMPLE_LIMIT() {
    return (this.constructor as typeof DataBus).SAMPLE_LIMIT
  }

  get latestTime() {
    return this.times.length === 0 ? 0 : this.times[this.times.length - 1]
  }

  append(result: SpiceResult) {
    const limit = this.SAMPLE_LIMIT
    const volts = Object.fromEntries(
      result.variables
        .filter((v) => v.type === 'voltage')
        .map((v) => [v.name, v]),
    )
    const amps = Object.fromEntries(
      result.variables
        .filter((v) => v.type === 'current')
        .map((v) => [v.name, v]),
    )
    const timeVar = result.variables.find((v) => v.type === 'time')
    if (!timeVar) throw new Error('spice result has no time variable')
    const times = timeVar.data
    const offset = this.latestTime
    // series that first appear this window are front-padded so every series
    // stays index-aligned with `times` (the reference only padded disappearing ones)
    const lead = this.times.length

    for (const t of times) this.times.push(1e3 * t + offset)
    this.times = this.times.slice(-limit)

    for (const name in volts) {
      this.voltages[name] = (
        this.voltages[name] ?? Array<undefined>(lead).fill(undefined)
      )
        .concat(volts[name].data)
        .slice(-limit)
    }
    // pad series that disappeared this window so indexes stay aligned
    for (const name in this.voltages) {
      if (!volts[name])
        this.voltages[name] = this.voltages[name]
          .concat(times.map(() => undefined))
          .slice(-limit)
    }
    for (const name in amps) {
      this.amperages[name] = (
        this.amperages[name] ?? Array<undefined>(lead).fill(undefined)
      )
        .concat(amps[name].data)
        .slice(-limit)
    }
    for (const name in this.amperages) {
      if (!amps[name])
        this.amperages[name] = this.amperages[name]
          .concat(times.map(() => undefined))
          .slice(-limit)
    }
  }

  private indexAt(time: number) {
    let i = sortedIndex(this.times, time)
    if (i >= this.times.length) i = this.times.length - 1
    return i
  }

  getVoltage(node: string, time: number): number {
    if (node === '0') return 0
    const i = this.indexAt(time)
    return this.voltages[`v(${node})`]?.[i] ?? 0
  }

  getAmperage(deviceId: string, time: number): number {
    const i = this.indexAt(time)
    const series =
      this.amperages[`i(@${deviceId}[i])`] ??
      this.amperages[`i(@${deviceId}[id])`] ??
      this.amperages[`i(${deviceId})`] ??
      []
    return series[i] ?? 0
  }

  reset() {
    this.times = []
    this.voltages = {}
    this.amperages = {}
  }
}
