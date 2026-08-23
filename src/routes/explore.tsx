import { createFileRoute, redirect } from '@tanstack/react-router'

/** The landing page is the explore page now; keep old links working. */
export const Route = createFileRoute('/explore')({
  beforeLoad: () => {
    throw redirect({ to: '/' })
  },
})
