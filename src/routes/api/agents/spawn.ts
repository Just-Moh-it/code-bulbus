import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createRuntimeServerClient } from '@electric-ax/agents-runtime'

const ELECTRIC_AGENTS_URL =
  process.env.ELECTRIC_AGENTS_URL ?? 'http://localhost:4437'

/**
 * POST /api/agents/spawn  { projectId, name?, message? }
 * Spawns one `bulbus` entity for the project. Browsers can only observe the
 * coordinator, so spawning goes through this server route.
 */
export const Route = createFileRoute('/api/agents/spawn')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          projectId?: string
          name?: string
          message?: string
        }
        if (!body.projectId)
          return json({ error: 'projectId required' }, { status: 400 })
        const client = createRuntimeServerClient({
          baseUrl: ELECTRIC_AGENTS_URL,
        })
        const id = `${body.projectId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`
        const info = await client.spawnEntity({
          type: 'bulbus',
          id,
          args: { projectId: body.projectId },
          tags: { project: body.projectId, name: body.name ?? 'Agent' },
          ...(body.message ? { initialMessage: body.message } : {}),
        })
        return json({ entityUrl: info.entityUrl })
      },
    },
  },
})
