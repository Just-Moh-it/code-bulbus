import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { createRuntimeServerClient } from '@electric-ax/agents-runtime'

const ELECTRIC_AGENTS_URL =
  process.env.ELECTRIC_AGENTS_URL ?? 'http://localhost:4437'

/**
 * POST /api/agents/send — multipart { entityUrl, text, files[] } or JSON { entityUrl, text }.
 *
 * Files become native Electric attachments keyed to the inbox message we are
 * about to send: the coordinator accepts a client-chosen inbox `key`, so the
 * attachments are created first (subject = that key) and the message follows.
 * The runtime then hands image attachments to the model as content blocks.
 */
export const Route = createFileRoute('/api/agents/send')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let entityUrl = ''
        let text = ''
        let files: File[] = []
        if (
          request.headers.get('content-type')?.includes('multipart/form-data')
        ) {
          const form = await request.formData()
          entityUrl = String(form.get('entityUrl') ?? '')
          text = String(form.get('text') ?? '')
          files = form
            .getAll('files')
            .filter((f): f is File => f instanceof File)
        } else {
          const body = (await request.json().catch(() => ({}))) as {
            entityUrl?: string
            text?: string
          }
          entityUrl = body.entityUrl ?? ''
          text = body.text ?? ''
        }
        if (!entityUrl || (!text.trim() && files.length === 0))
          return json(
            { error: 'entityUrl and text or files required' },
            { status: 400 },
          )

        const client = createRuntimeServerClient({
          baseUrl: ELECTRIC_AGENTS_URL,
        })
        const key = `msg-in-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        for (const file of files) {
          await client.createAttachment({
            entityUrl,
            attachment: {
              bytes: file,
              mimeType: file.type || 'application/octet-stream',
              filename: file.name,
              subject: { type: 'inbox', key },
              role: 'input',
            },
          })
        }
        const payload =
          text.trim() || `Attached: ${files.map((f) => f.name).join(', ')}`
        const res = await fetch(
          `${ELECTRIC_AGENTS_URL}/_electric/entities${entityUrl}/send`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              key,
              payload,
              type: 'user_message',
              mode: 'queued',
            }),
          },
        )
        if (!res.ok) return json({ error: await res.text() }, { status: 502 })
        return json({ ok: true, key })
      },
    },
  },
})
