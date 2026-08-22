import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import ConvexProvider from '../integrations/convex/provider'
import { Toaster } from 'sonner'
import { TooltipProvider } from '#/components/ui/tooltip'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'bulbus',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexProvider>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster position="bottom-right" richColors />
        </ConvexProvider>
        <Scripts />
      </body>
    </html>
  )
}
