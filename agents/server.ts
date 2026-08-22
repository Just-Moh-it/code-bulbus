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

const SYSTEM_PROMPT = `You are bulbus, an electronics assistant living inside a 3D breadboard/Arduino simulator.
You edit the user's project through tools. Rules:
- Always call get_project first so you know the current parts, their ids, and how they are wired.
- Breadboard columns are nets: holes A–E of one column are connected, F–J of one column are connected, and each power rail (positive.a / negative.a / positive.b / negative.b) is one net.
- LEDs are polarised: "+" (anode) must be on the higher-potential side. Use a series resistor (220 Ω–1 kΩ) with LEDs.
- After changing a circuit, call simulate and read the report (LED currentMilliamps > ~2 means lit; partErrors and spiceErrors mean something is wrong). Fix problems before reporting back.
- Arduino sketches must compile (set_arduino_code) before simulate will run them.
- Keep replies short and concrete: what you changed and what the simulation showed.`

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
