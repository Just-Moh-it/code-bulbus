import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { compileSketch } from '#/server/compile'
import type { SketchFiles } from '#/server/compile'

/**
 * POST /api/compile
 * Body: { "main.ino": { content, fileExtension, order }, ... }
 * Response: { data?: hex, stdout, stderr, error? }
 */
export const Route = createFileRoute('/api/compile')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let files: SketchFiles
        try {
          files = (await request.json()) as SketchFiles
        } catch {
          return json(
            { error: true, stdout: '', stderr: 'Invalid JSON body' },
            { status: 400 },
          )
        }
        if (!files || typeof files !== 'object' || !Object.keys(files).length) {
          return json(
            { error: true, stdout: '', stderr: 'No files provided' },
            { status: 400 },
          )
        }
        const result = await compileSketch(files)
        return json(result, { status: result.error ? 422 : 200 })
      },
    },
  },
})
