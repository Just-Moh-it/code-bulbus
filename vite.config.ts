import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

/**
 * `CF_BUILD=1` swaps the nitro server build for the Cloudflare Workers one
 * (`bun run build:cf`, `bun run deploy` — see `docs/DEPLOY-CF.md`).
 *
 * Both plugins own the `ssr` environment and the server output, so exactly one
 * may be active. Everything without the flag — `bun run dev`, `bun run build`,
 * `deploy/deploy.sh` to the EC2 box — stays on nitro, unchanged.
 */
const cloudflareBuild = Boolean(process.env.CF_BUILD)

const config = defineConfig({
  // the dev server is exposed through a tunnel (bulbus.mohitya.dev / *.trycloudflare.com)
  server: { allowedHosts: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflareBuild
      ? cloudflare({ viteEnvironment: { name: 'ssr' } })
      : nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
