import { Simulation } from 'eecircuit-engine'
import type { ResultType } from 'eecircuit-engine'
import type { SpiceFailure, SpiceResult } from '../types'

/**
 * ngspice compiled to WebAssembly. One engine instance is kept warm and
 * reused; ngspice is not re-entrant so runs are serialised through a queue.
 */
let engine: Simulation | null = null
let ready: Promise<Simulation> | null = null
let queue: Promise<unknown> = Promise.resolve()
let errorCursor = 0

export const spiceDebug = { enabled: false }

async function getEngine() {
  if (!ready) {
    ready = (async () => {
      engine = new Simulation()
      await engine.start()
      return engine
    })()
  }
  return ready
}

/** Warm the WASM module ahead of the first simulation. */
export function preloadSpice() {
  void getEngine()
}

function normalise(r: ResultType): SpiceResult {
  if (r.dataType === 'complex') {
    return {
      dataType: 'complex',
      variables: r.data.map((v) => ({
        name: v.name,
        type: v.type,
        data: v.values.map((c) => c.real),
      })),
    }
  }
  return {
    dataType: 'real',
    variables: r.data.map((v) => ({
      name: v.name,
      type: v.type,
      data: v.values,
    })),
  }
}

/**
 * Run a transient netlist and return parsed vectors.
 * Rejects with `{ errors, warnings }` if ngspice reports a failure.
 */
/**
 * ngspice writes its per-run chatter ("Note: ... dc value used for op ...") to
 * stderr and eecircuit-engine forwards every line to `console.error` — about
 * five calls per 50 ms window, so ~110 a second while a simulation plays.
 *
 * React DevTools patches console.error/warn/trace to append a component stack,
 * which is far more expensive than a plain log. At this call rate the extension
 * saturates the main thread, requestAnimationFrame starves, and the playback
 * clock never advances — the tab looks frozen with the clock stuck at 0.
 *
 * Nothing is lost: `sim.getError()` below is the authoritative source for this
 * run's errors and warnings. With `spiceDebug.enabled` the lines still reach the
 * console, as console.debug, which DevTools does not instrument.
 */
function muteEngineChatter() {
  const real = console.error
  console.error = (...args: unknown[]) => {
    // the engine forwards one stderr line per call; anything else is ours
    if (args.length === 1 && typeof args[0] === 'string') {
      if (spiceDebug.enabled) console.debug(...args)
      return
    }
    real.apply(console, args as Parameters<typeof console.error>)
  }
  return () => {
    console.error = real
  }
}

export function runNetlist(netlist: string): Promise<SpiceResult> {
  const run = async () => {
    const t0 = performance.now()
    const sim = await getEngine()
    const t1 = performance.now()
    const text = /\n\s*\.end\s*$/i.test(netlist)
      ? netlist
      : `${netlist}\n.end\n`
    sim.setNetList(text)
    const unmute = muteEngineChatter()
    let result
    try {
      result = await sim.runSim()
    } finally {
      unmute()
    }
    const t2 = performance.now()
    // eecircuit-engine accumulates stderr across runs; only look at this run's lines.
    // Match the reference: only lines starting with Error/Warning count.
    const all = sim.getError()
    const stderr = all.slice(errorCursor).map((l) => l.trim())
    errorCursor = all.length
    const errors = stderr.filter((l) => l.startsWith('Error'))
    const warnings = stderr.filter((l) => l.startsWith('Warning'))
    if (errors.length > 0 || !result.data || result.data.length === 0) {
      const failure: SpiceFailure = {
        errors: errors.length ? errors : ['Simulation produced no data'],
        warnings,
      }
      throw failure
    }
    const out = normalise(result)
    if (spiceDebug.enabled) {
      console.info('simulation performance (ms)', {
        total: t2 - t0,
        initialize: t1 - t0,
        simulate: t2 - t1,
      })
    }
    return out
  }
  const next = queue.then(run, run)
  queue = next.catch(() => {})
  return next
}
