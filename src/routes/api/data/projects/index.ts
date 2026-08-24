import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createProject } from '../../../../../server/db'
import { auth } from '../../../../../server/auth'
import type { CreateProjectInput } from '../../../../../server/db'

/**
 * POST /api/data/projects  { id, name, parent_id?, camera?, parts, wires }
 * Creates a project with its initial rows, owned by the session's user
 * (anonymous or real — the server stamps it, the client cannot choose).
 * Existing id → `{ created: false }` (the old `projects.create` no-op).
 */
export const Route = createFileRoute('/api/data/projects/')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request
          .json()
          .catch(() => null)) as CreateProjectInput | null
        if (!body?.id || !body.name)
          return json({ error: 'id and name required' }, { status: 400 })
        const session = await auth.api.getSession({ headers: request.headers })
        return json(
          await createProject({
            ...body,
            user_id: session?.user.id ?? null,
          }),
        )
      },
    },
  },
})
