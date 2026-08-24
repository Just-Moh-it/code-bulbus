import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { removeProject } from '../../../../../server/db'

/** POST /api/data/projects/remove  { id } → { txid }. Removing a missing project is a no-op. */
export const Route = createFileRoute('/api/data/projects/remove')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          id?: string
        } | null
        if (!body?.id) return json({ error: 'id required' }, { status: 400 })
        return json(await removeProject(body.id))
      },
    },
  },
})
