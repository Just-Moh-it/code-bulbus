import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createRuntimeServerClient } from '@electric-ax/agents-runtime'

const ELECTRIC_AGENTS_URL =
  process.env.ELECTRIC_AGENTS_URL ?? 'http://localhost:4437'

/**
 * POST /api/agents/stop { entityUrl } — interrupt the agent's current run.
 * SIGINT aborts the active handler invocation; the entity stays alive and
 * keeps its history, so the next message continues the same chat.
 */
export const Route = createFileRoute('/api/agents/stop')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          entityUrl?: string
        }
        if (!body.entityUrl)
          return json({ error: 'entityUrl required' }, { status: 400 })
        const client = createRuntimeServerClient({
          baseUrl: ELECTRIC_AGENTS_URL,
        })
        await client.signalEntity({
          entityUrl: body.entityUrl,
          signal: 'SIGINT',
          reason: 'stopped by the user',
        })
        return json({ ok: true })
      },
    },
  },
})
