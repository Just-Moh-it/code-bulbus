import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { duplicateProject } from '../../../../../server/db'
import { auth } from '../../../../../server/auth'

/** POST /api/data/projects/duplicate  { id, newId, name? } → { id, txid } */
export const Route = createFileRoute('/api/data/projects/duplicate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          id?: string
          newId?: string
          name?: string
        } | null
        if (!body?.id || !body.newId)
          return json({ error: 'id and newId required' }, { status: 400 })
        try {
          const session = await auth.api.getSession({
            headers: request.headers,
          })
          return json(
            await duplicateProject({
              id: body.id,
              newId: body.newId,
              name: body.name,
              userId: session?.user.id ?? null,
            }),
          )
        } catch (e) {
          return json({ error: (e as Error).message }, { status: 404 })
        }
      },
    },
  },
})
