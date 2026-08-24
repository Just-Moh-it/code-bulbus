/**
 * Preview worker: every 30 s it asks Postgres which projects' stored preview
 * hash no longer matches their circuit, renders those in headless Chrome
 * (the chrome-less /preview/$id route) and stores the image.
 *
 *   bun run previews            # loop
 *   bun run previews --once     # single pass (CI / manual)
 *
 * Chrome is the system install — playwright-core downloads nothing.
 *
 * There is no blob store in the Postgres/Electric stack, so the image lives in
 * `projects.preview` as a JPEG data URL: it streams to the browser with the
 * project row and needs no second request. JPEG (not PNG) keeps a card-sized
 * render around a hundred kilobytes.
 */
import { chromium } from 'playwright-core'
import { setProjectPreview, stalePreviews } from '../server/db'
import type { Browser } from 'playwright-core'

const APP_URL = process.env.PREVIEW_APP_URL ?? 'http://localhost:3005'
const CHROME =
  process.env.PREVIEW_CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const INTERVAL_MS = Number(process.env.PREVIEW_INTERVAL_MS ?? 30_000)
const VIEWPORT = { width: 1024, height: 640 }
const JPEG_QUALITY = 78
/** A render that hangs (WebGL context lost, dev server restart) must not wedge the loop. */
const RENDER_TIMEOUT_MS = 40_000
const BATCH = Number(process.env.PREVIEW_BATCH ?? 6)

async function render(browser: Browser, id: string) {
  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  })
  try {
    await page.goto(`${APP_URL}/preview/${id}`, {
      waitUntil: 'domcontentloaded',
      timeout: RENDER_TIMEOUT_MS,
    })
    await page.waitForFunction(() => window.__previewReady === true, null, {
      timeout: RENDER_TIMEOUT_MS,
    })
    return await page.screenshot({ type: 'jpeg', quality: JPEG_QUALITY })
  } finally {
    await page.close()
  }
}

async function store(id: string, hash: string, jpeg: Buffer) {
  await setProjectPreview(
    id,
    `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    hash,
  )
}

async function pass(browser: Browser) {
  const stale = await stalePreviews(BATCH)
  if (!stale.length) return 0
  for (const { id, hash } of stale) {
    try {
      await store(id, hash, await render(browser, id))
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
// the postgres pool keeps the loop alive otherwise
process.exit(0)
