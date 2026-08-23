import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createRuntimeServerClient } from '@electric-ax/agents-runtime'

const ELECTRIC_AGENTS_URL =
  process.env.ELECTRIC_AGENTS_URL ?? 'http://localhost:4437'

/** POST /api/agents/delete { entityUrl } — remove a chat (its entity) for good. */
export const Route = createFileRoute('/api/agents/delete')({
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
        await client.deleteEntity(body.entityUrl)
        return json({ ok: true })
      },
    },
  },
})
