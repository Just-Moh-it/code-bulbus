import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createProject } from '../../../../../server/db'
import type { CreateProjectInput } from '../../../../../server/db'

/**
 * POST /api/data/projects  { id, name, user_id?, parent_id?, camera?, parts, wires }
 * Creates a project with its initial rows. Existing id → `{ created: false }`
 * (the Convex `projects.create` no-op).
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
        return json(await createProject(body))
      },
    },
  },
})
