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
export function runNetlist(netlist: string): Promise<SpiceResult> {
  const run = async () => {
    const t0 = performance.now()
    const sim = await getEngine()
    const t1 = performance.now()
    const text = /\n\s*\.end\s*$/i.test(netlist)
      ? netlist
      : `${netlist}\n.end\n`
    sim.setNetList(text)
    const result = await sim.runSim()
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
