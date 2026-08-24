import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { setProjectPublic } from '../../../../../server/db'

/** POST /api/data/projects/set-public  { id, isPublic } → { txid } */
export const Route = createFileRoute('/api/data/projects/set-public')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          id?: string
          isPublic?: boolean
        } | null
        if (!body?.id || typeof body.isPublic !== 'boolean')
          return json({ error: 'id and isPublic required' }, { status: 400 })
        return json(await setProjectPublic(body.id, body.isPublic))
      },
    },
  },
})
