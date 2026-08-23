/**
 * Preview worker: every 30 s it asks Convex which projects' stored preview
 * hash no longer matches their circuit, renders those in headless Chrome
 * (the chrome-less /preview/$id route) and uploads the PNG.
 *
 *   bun run previews            # loop
 *   bun run previews --once     # single pass (CI / manual)
 *
 * Chrome is the system install — playwright-core downloads nothing.
 */
import { chromium } from 'playwright-core'
import type { Browser } from 'playwright-core'
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'

const CONVEX_URL = process.env.VITE_CONVEX_URL
if (!CONVEX_URL) throw new Error('VITE_CONVEX_URL is not set (see .env.local)')
const APP_URL = process.env.PREVIEW_APP_URL ?? 'http://localhost:3005'
const CHROME =
  process.env.PREVIEW_CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const INTERVAL_MS = Number(process.env.PREVIEW_INTERVAL_MS ?? 30_000)
const VIEWPORT = { width: 1024, height: 640 }
/** A render that hangs (WebGL context lost, dev server restart) must not wedge the loop. */
const RENDER_TIMEOUT_MS = 40_000
const BATCH = Number(process.env.PREVIEW_BATCH ?? 6)

const convex = new ConvexHttpClient(CONVEX_URL)

async function render(browser: Browser, id: string) {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  })
  try {
    await page.goto(`${APP_URL}/preview/${id}`, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT_MS,
    })
    await page.waitForFunction(() => window.__previewReady === true, null, {
      timeout: RENDER_TIMEOUT_MS,
    })
    return await page.screenshot({ type: 'png' })
  } finally {
    await page.close()
  }
}

async function upload(id: string, hash: string, png: Buffer) {
  const url = await convex.mutation(api.projects.generatePreviewUploadUrl, {})
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'image/png' },
    body: new Uint8Array(png),
  })
  if (!res.ok) throw new Error(`upload failed (${res.status})`)
  const { storageId } = (await res.json()) as { storageId: string }
  await convex.mutation(api.projects.setPreview, {
    id,
    storageId: storageId as never,
    hash,
  })
}

async function pass(browser: Browser) {
  const stale = await convex.query(api.projects.stalePreviews, { limit: BATCH })
  if (!stale.length) return 0
  for (const { id, hash } of stale) {
    try {
      await upload(id, hash, await render(browser, id))
      console.log(`preview ${id.slice(0, 8)} → ${hash}`)
    } catch (e) {
      console.error(`preview ${id.slice(0, 8)} failed:`, (e as Error).message)
    }
  }
  return stale.length
}

const browser = await chromium.launch({ executablePath: CHROME })
const once = process.argv.includes('--once')
try {
  do {
    const n = await pass(browser)
    if (once) {
      console.log(`done (${n} rendered)`)
      break
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
    // eslint-disable-next-line no-constant-condition
  } while (true)
} finally {
  await browser.close()
}
