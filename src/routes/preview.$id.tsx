import { useEffect, useMemo, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { EditorProject, fitCameraToObjects } from '#/editor/models'
import { ProjectCanvas, CANVAS_BG } from '#/editor/scene/ProjectCanvas'
import type { ProjectJSON } from '#/sim/types'

/** Give slow models this long before shooting anyway. */
const MAX_WAIT_MS = 20_000

/**
 * Chrome-less canvas used by the preview worker (`bun run previews`): it loads
 * the project, fits the camera and flips `__previewReady` once the scene has
 * had a couple of frames to settle. Not linked from the app.
 */
export const Route = createFileRoute('/preview/$id')({
  component: PreviewPage,
  ssr: false,
  head: () => ({ meta: [{ title: 'bulbus preview' }] }),
})

function PreviewPage() {
  const { id } = Route.useParams()
  const server = useQuery(api.circuit.get, { projectId: id })
  const [json, setJson] = useState<ProjectJSON | null>(null)
  useEffect(() => {
    if (server && !json) setJson({ ...server.project, circuit: server.circuit })
  }, [server, json])
  const project = useMemo(() => (json ? new EditorProject(json) : null), [json])

  useEffect(() => {
    if (!project) return
    let cancelled = false
    const started = Date.now()
    // GLB models stream in; a thumbnail taken before the Arduino resolves is
    // missing half the circuit. Wait until every part has a scene object and
    // reports ready, then fit and hand over — with a cap so a broken model
    // still produces a picture rather than a hung worker.
    const settle = () => {
      if (cancelled) return
      const parts = project.circuit.parts
      const ready =
        parts.length > 0 && parts.every((p) => p.object && p.isReady)
      if (!ready && Date.now() - started < MAX_WAIT_MS) {
        setTimeout(settle, 200)
        return
      }
      const orbit = project.orbit
      if (orbit)
        fitCameraToObjects(
          orbit,
          parts
            .map((p) => p.object)
            .filter((o): o is NonNullable<typeof o> => !!o),
          0.62,
        )
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (!cancelled)
            (window as unknown as { __previewReady?: boolean }).__previewReady =
              true
        }),
      )
    }
    const timer = setTimeout(settle, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [project])

  return (
    <div className="h-screen w-screen" style={{ background: CANVAS_BG }}>
      {project && <ProjectCanvas project={project} />}
    </div>
  )
}
