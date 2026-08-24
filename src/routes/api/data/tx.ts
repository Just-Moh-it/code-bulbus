import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { applyTx } from '../../../../server/db'
import type { TxInput } from '../../../../server/db'

/**
 * POST /api/data/tx
 * Body: { projectId, parts?, removeParts?, wires?, removeWires?, name?, camera?, simulating?, agentVersion? }
 *
 * The single write path for a project: entity upserts/removes and metadata are
 * applied in one Postgres transaction, whose id comes back as `txid` so the
 * caller's Electric collections can await the matching sync message.
 */
export const Route = createFileRoute('/api/data/tx')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as TxInput | null
        if (!body?.projectId)
          return json({ error: 'projectId required' }, { status: 400 })
        const { txid } = await applyTx(body)
        return json({ txid })
      },
    },
  },
})
