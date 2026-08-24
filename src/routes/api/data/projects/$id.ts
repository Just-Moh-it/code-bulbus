import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { getProject, toProjectJSON } from '../../../../../server/db'

/**
 * GET /api/data/projects/:id → the whole ProjectJSON (metadata + parts + wires)
 * for consumers that cannot hold an Electric shape (scripts, other services).
 * Browsers read the same data live through the collections instead.
 */
export const Route = createFileRoute('/api/data/projects/$id')({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const snapshot = await getProject(params.id)
        if (!snapshot) return json({ error: 'not found' }, { status: 404 })
        return json({
          ...toProjectJSON(snapshot),
          isPublic: snapshot.isPublic,
          simulating: snapshot.simulating,
          agentVersion: snapshot.agentVersion,
          preview: snapshot.preview,
        })
      },
    },
  },
})
