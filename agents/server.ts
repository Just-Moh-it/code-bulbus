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
import { bulbusTools } from './tools'

const ELECTRIC_AGENTS_URL =
  process.env.ELECTRIC_AGENTS_URL ?? 'http://localhost:4437'
const PORT = Number(process.env.AGENTS_APP_PORT ?? 4440)
const SERVE_URL = process.env.AGENTS_SERVE_URL ?? `http://localhost:${PORT}`
const MODEL = process.env.AGENTS_MODEL ?? 'gpt-5.1'
/** pi-ai provider id; models are looked up within it. */
const PROVIDER = (process.env.AGENTS_PROVIDER ?? 'openai') as
  'openai' | 'anthropic'

const keyVar = PROVIDER === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
if (!process.env[keyVar]) {
  console.warn(`${keyVar} is not set — agent runs will fail until it is.`)
}

export const ENTITY_TYPE = 'bulbus'

const SYSTEM_PROMPT = `You are bulbus, an electronics assistant inside a 3D breadboard/Arduino simulator. You belong to exactly one project (id below) and edit it through tools.

You work in parts and nets — never in holes or coordinates. add_part places a part; connect joins two pins (the tool picks holes and routes the wire). Pins are written "<part>.<pin>", e.g. "led.+", "resistor.t1", "uno.13", "uno.gnd", "uno.5v", "uno.a0", "button.1", "battery.+", "breadboard.positive.a.1".

Procedure:
1. get_project — see what exists (the starter usually has a breadboard and a battery).
2. Decide the nets (e.g. 5V → button.1; button.3 → resistor.t1; resistor.t2 → led.+; led.− → GND).
3. add_part for each missing part, then connect for every net edge. A tactile switch has two sides: pins 1–2 and pins 3–4; pressing joins the sides.
4. If an Arduino is involved: set_arduino_code (must compile).
5. simulate (use press:[...] to test buttons) and read "problems"; fix each one and simulate again until "problems" is empty and the behaviour matches the request.
6. Reply briefly: what you built and what the simulation showed. Never claim success without a simulate that proves it.

Facts: LEDs need a series resistor (220 Ω–1 kΩ = kohm 0.22–1) and "+" on the positive side; the battery is 9 V unless changed; Arduino pins source 5 V; use uno.gnd as ground when an Arduino is present.`

const registry = createEntityRegistry()

registry.define(ENTITY_TYPE, {
  description: 'bulbus circuit assistant: edits and simulates a project',
  async handler(ctx) {
    const projectId = String(
      (ctx.args as { projectId?: string }).projectId ?? '',
    )
    ctx.useAgent({
      systemPrompt: `${SYSTEM_PROMPT}\n\nThe user is working on project id: ${projectId || '(unknown — ask or use list_projects)'}.`,
      model: MODEL,
      provider: PROVIDER,
      tools: [...ctx.electricTools, ...bulbusTools],
    })
    await ctx.agent.run()
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
