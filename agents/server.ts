/**
 * bulbus agent server — defines the `bulbus` entity type for Electric Agents
 * and serves the webhook the coordinator wakes it through.
 *
 *   bun run agents:runtime   # docker: postgres + electric + coordinator on :4437
 *   bun run agents:server    # this file, on :4440
 *
 * Each chat in the UI is one `bulbus` entity (durable stream), spawned with
 * args { projectId } and tagged { project: projectId }, so several agents can
 * work on the same project concurrently.
 */
import http from 'node:http'
import {
  createEntityRegistry,
  createRuntimeHandler,
} from '@electric-ax/agents-runtime'
import { activity, bulbusTools, resetActivity } from './tools'

/** How many times the critic sends the model back after it stops with unresolved problems. */
const MAX_CRITIC_ROUNDS = 2

const ELECTRIC_AGENTS_URL =
  process.env.ELECTRIC_AGENTS_URL ?? 'http://localhost:4437'
const PORT = Number(process.env.AGENTS_APP_PORT ?? 4440)
const SERVE_URL = process.env.AGENTS_SERVE_URL ?? `http://localhost:${PORT}`
const MODEL = process.env.AGENTS_MODEL ?? 'gpt-5.1'
/** pi-ai provider id; models are looked up within it. */
/** pi-ai provider id (openai | anthropic | xai | openrouter | …); the model id must belong to it. */
const PROVIDER = (process.env.AGENTS_PROVIDER ?? 'openai')
const KEY_VARS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  xai: 'XAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
}
const keyVar = KEY_VARS[PROVIDER]
if (keyVar && !process.env[keyVar]) {
  console.warn(`${keyVar} is not set — agent runs will fail until it is.`)
}

export const ENTITY_TYPE = 'bulbus'

const SYSTEM_PROMPT = `You are bulbus, an electronics assistant inside a 3D breadboard/Arduino simulator. You belong to exactly one project (id below) and edit it through tools. You were asked to BUILD, so build: never end your turn asking whether to continue while "test" still reports problems you could fix.

You work in parts and nets — never in holes or coordinates. add_part places a part; connect joins two pins (the tool picks holes and routes the wire). Pins are written "<part>.<pin>", e.g. "led.+", "resistor.t1", "uno.13", "uno.gnd", "uno.5v", "uno.a0", "button.1", "battery.+", "breadboard.positive.a.1".

Procedure:
1. get_project — see what exists (the starter usually has a breadboard and a battery).
2. Decide the nets (e.g. 5V → button.1; button.3 → resistor.t1; resistor.t2 → led.+; led.− → GND).
3. add_part for each missing part, then connect for every net edge. A tactile switch has two sides, a and b; pressing joins them (a to the supply or an input pin, b onward).
4. If an Arduino is involved: set_arduino_code (must compile).
5. test (use press:[...] to tap buttons) and read "problems"; fix each one and test again until "problems" is empty and the behaviour matches the request. "test" runs the engine headlessly for you — the user sees nothing.
6. start_simulation once it passes, so the user watches it run in 3D.
7. Reply briefly: what you built and what the test showed. Never claim success without a test that proves it, and never stop to ask permission — you were asked to build it, so finish it. To change an existing link, remove(a, b) the old connection first.

Facts: LEDs need a series resistor (220 Ω–1 kΩ = kohm 0.22–1) and "+" on the positive side; the battery is 9 V unless changed; Arduino pins source 5 V; use uno.gnd as ground when an Arduino is present.`

const registry = createEntityRegistry()

registry.define(ENTITY_TYPE, {
  description: 'bulbus circuit assistant: edits and simulates a project',
  async handler(ctx) {
    const projectId = String(
      (ctx.args as { projectId?: string }).projectId ?? '',
    )
    ctx.useAgent({
      systemPrompt: `${SYSTEM_PROMPT}\n\nProject id: ${projectId}. Pins are written <part>.<pin> or <type>:<id>.<pin> exactly as get_project prints them.`,
      model: MODEL,
      provider: PROVIDER,
      tools: [...ctx.electricTools, ...bulbusTools(projectId)],
    })
    resetActivity(projectId)
    await ctx.agent.run()
    // Deterministic critic: a build is only done when a `test` after the last
    // edit reports no problems. Nudge the model back to work, at most twice.
    for (let round = 0; round < MAX_CRITIC_ROUNDS; round++) {
      const a = activity.get(projectId)
      if (!a?.edited) break
      let nudge: string | null = null
      if (!a.simulated)
        nudge =
          'You changed the circuit but never ran test. Run it now (tap buttons with press:[{part, ms}] where the behaviour depends on a press), then fix every entry in "problems" and test again.'
      else if (a.stale)
        nudge =
          'You changed the circuit after the last test. Test again and fix anything in "problems".'
      else if (a.problems.length)
        nudge = `The last test still reports problems:\n- ${a.problems.join('\n- ')}\nFix them (do not explain them away) and test again until "problems" is empty.`
      if (!nudge) break
      resetActivity(projectId)
      activity.get(projectId)!.edited = true
      await ctx.agent.run(nudge)
    }
  },
})

const runtime = createRuntimeHandler({
  baseUrl: ELECTRIC_AGENTS_URL,
  serveEndpoint: `${SERVE_URL}/webhook`,
  registry,
})

const server = http.createServer(async (req, res) => {
  if (req.url === '/webhook' && req.method === 'POST') {
    await runtime.onEnter(req, res)
    return
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, types: [ENTITY_TYPE], model: MODEL }))
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(PORT, async () => {
  await runtime.registerTypes()
  console.log(
    `bulbus agent server on ${SERVE_URL} (coordinator ${ELECTRIC_AGENTS_URL}, ${PROVIDER}/${MODEL})`,
  )
})
