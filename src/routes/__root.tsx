import { useEffect } from 'react'
import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'

import { Toaster } from 'sonner'
import { OneTapPrompt } from '#/components/auth/OneTapPrompt'
import { TooltipProvider } from '#/components/ui/tooltip'

import '#/lib/gltf-setup'

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
      { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/logo.svg' },
      // the two models every circuit shows; the browser starts them with the
      // document instead of after the project data resolves
      {
        rel: 'prefetch',
        href: '/breadboard.glb',
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'prefetch',
        href: '/arduino-uno.glb',
        as: 'fetch',
        crossOrigin: 'anonymous',
      },
    ],
  }),
  shellComponent: RootDocument,
})

/** Warms the GLB cache app-wide (landing included) once the browser is idle. */
function ModelWarmup() {
  useEffect(() => {
    void import('#/lib/models-warmup').then((m) => m.warmModels())
  }, [])
  return null
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        {/* Client-only by construction: renders null, acts only from effects. */}
        <OneTapPrompt />
        <ModelWarmup />
        <Toaster position="bottom-right" richColors />
        <Scripts />
      </body>
    </html>
  )
}
