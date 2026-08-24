import { createFileRoute } from '@tanstack/react-router'

import { auth } from '../../../../server/auth'

/**
 * Catch-all for better-auth: `/api/auth/*` (sign-in, callbacks, session, …).
 *
 * better-auth writes its own `Set-Cookie` headers onto the returned Response,
 * so the handler is passed straight through for both verbs.
 */
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => auth.handler(request),
      POST: ({ request }: { request: Request }) => auth.handler(request),
    },
  },
})
