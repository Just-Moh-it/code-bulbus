import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createRuntimeServerClient } from '@electric-ax/agents-runtime'

const ELECTRIC_AGENTS_URL =
  process.env.ELECTRIC_AGENTS_URL ?? 'http://localhost:4437'

/** POST /api/agents/send  { entityUrl, text } — queue a user message on an entity. */
export const Route = createFileRoute('/api/agents/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          entityUrl?: string
          text?: string
        }
        if (!body.entityUrl || !body.text?.trim())
          return json({ error: 'entityUrl and text required' }, { status: 400 })
        const client = createRuntimeServerClient({
          baseUrl: ELECTRIC_AGENTS_URL,
        })
        await client.sendEntityMessage({
          targetUrl: body.entityUrl,
          payload: body.text,
          type: 'user_message',
          mode: 'queued',
        })
        return json({ ok: true })
      },
    },
  },
})
