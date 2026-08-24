import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

/**
 * The SSR build must stay a single chunk. When rollup splits the SSR entry, the
 * namespace object the nitro service loader imports (`import(ssr.mjs).then(n => n.r)`)
 * is tree-shaken away while its `export { ssr_exports as ... }` survives, and the
 * built server boots into "Export 'ssr_exports' is not defined in module".
 * The split only starts once the server graph grows past some threshold, so this
 * is load-bearing even though the build succeeds without it.
 */
const config = defineConfig({
  environments: {
    ssr: {
      build: { rollupOptions: { output: { inlineDynamicImports: true } } },
    },
  },
  // the dev server is exposed through a tunnel (bulbus.mohitya.dev / *.trycloudflare.com)
  server: { allowedHosts: true },
  resolve: { tsconfigPaths: true },
  plugins: [
    nitro({ rollupConfig: { external: [/^@sentry\//] } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
