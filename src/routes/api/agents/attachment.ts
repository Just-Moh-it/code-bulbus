import { createFileRoute } from '@tanstack/react-router'
import { createRuntimeServerClient } from '@electric-ax/agents-runtime'

const ELECTRIC_AGENTS_URL =
  process.env.ELECTRIC_AGENTS_URL ?? 'http://localhost:4437'

/** GET /api/agents/attachment?entityUrl=&id=&mime= — attachment bytes for previews. */
export const Route = createFileRoute('/api/agents/attachment')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const entityUrl = url.searchParams.get('entityUrl')
        const id = url.searchParams.get('id')
        if (!entityUrl || !id)
          return new Response('entityUrl and id required', { status: 400 })
        const client = createRuntimeServerClient({
          baseUrl: ELECTRIC_AGENTS_URL,
        })
        const bytes = await client.readAttachment({ entityUrl, id })
        return new Response(new Uint8Array(bytes).buffer, {
          headers: {
            'content-type':
              url.searchParams.get('mime') ?? 'application/octet-stream',
            'cache-control': 'private, max-age=3600',
          },
        })
      },
    },
  },
})
