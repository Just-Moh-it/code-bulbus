import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { autorun } from 'mobx'
import { observer } from 'mobx-react-lite'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { EditorProject } from '#/editor/models'
import { ProjectCanvas } from '#/editor/scene/ProjectCanvas'
import { PartContextMenu } from '#/components/editor/ContextMenu'
import { EditorNavbar } from '#/components/editor/Navbar'
import {
  EditorLeftPanel,
  EditorRightPanel,
  SimLeftPanel,
  SimRightPanel,
} from '#/components/editor/Panels'
import { Simulator } from '#/simulator/model'
import { SimCanvas } from '#/simulator/SimCanvas'
import { debounce, defaultProject } from '#/lib/projects'
import { preloadSpice } from '#/sim'
import type { ProjectJSON } from '#/sim/types'

export const Route = createFileRoute('/projects/$id')({
  validateSearch: (s: Record<string, unknown>): { template?: string } =>
    typeof s.template === 'string' ? { template: s.template } : {},
  component: ProjectPage,
  ssr: false,
  head: () => ({ meta: [{ title: 'bulbus' }] }),
})

const CANVAS_BG = '#F9FAFC'

function ProjectPage() {
  const { id } = Route.useParams()
  const { template } = Route.useSearch()
  const row = useQuery(api.projects.getById, { id })
  const upsert = useMutation(api.projects.upsert)
  const remove = useMutation(api.projects.remove)
  const navigate = useNavigate()
  const [simulator, setSimulator] = useState<Simulator | null>(null)

  // Take the row once per id: Convex is reactive, so our own autosave would otherwise
  // rebuild the editor on every write. (Reference: react-query with a 10 min staleTime.)
  const [json, setJson] = useState<ProjectJSON | null>(null)
  useEffect(() => {
    setJson(null)
  }, [id])
  useEffect(() => {
    if (json || row === undefined) return
    if (row) setJson(row as ProjectJSON)
    else if (template) setJson(defaultProject(id))
  }, [row, template, id, json])
  const project = useMemo(() => (json ? new EditorProject(json) : null), [json])
  const jsonStr = useMemo(() => JSON.stringify(json), [json])

  useEffect(() => {
    preloadSpice()
  }, [])

  // autosave: any observable change → debounced upsert (2s), like the reference
  const save = useRef(
    debounce((j: ProjectJSON) => {
      void upsert({
        id: j.id,
        name: j.name,
        user_id: j.user_id ?? null,
        parent_id: j.parent_id ?? null,
        camera: j.camera,
        circuit: j.circuit,
      })
    }, 2000),
  )
  useEffect(() => {
    if (!project) return
    const dispose = autorun(() => save.current(project.toJSON()))
    return dispose
  }, [project])

  useEffect(() => {
    if (!project) return
    const onKey = (e: KeyboardEvent) =>
      e.key === 'Escape' && project.setStampType(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [project])

  const startSimulation = () => {
    if (!project) return
    const sim = new Simulator(project.toJSON())
    void sim.circuit.start()
    setSimulator(sim)
  }
  const stopSimulation = () => {
    simulator?.circuit.stop()
    setSimulator(null)
  }
  const fork = async () => {
    if (!project) return
    const j = project.toJSON()
    const newId = crypto.randomUUID()
    await upsert({
      id: newId,
      name: `${j.name} (fork)`,
      user_id: j.user_id ?? null,
      parent_id: project.id,
      camera: j.camera,
      circuit: j.circuit,
    })
    void navigate({ to: '/projects/$id', params: { id: newId } })
  }
  const del = async () => {
    await remove({ id })
    void navigate({ to: '/' })
  }

  return (
    <div className="select-none">
      <EditorNavbar
        project={project}
        simulator={simulator}
        onStartSimulation={startSimulation}
        onStopSimulation={stopSimulation}
        onFork={fork}
        onDelete={del}
      />
      <main className="min-h-[calc(100vh-4rem)]">
        <div className="relative z-0 flex min-h-[calc(100vh-4rem)]">
          {simulator ? (
            <>
              <SimLeftPanel simulator={simulator} />
              <div className="relative flex-1">
                <div
                  className="absolute inset-0"
                  style={{ background: CANVAS_BG }}
                >
                  <SimCanvas simulator={simulator} />
                  <SimMessages simulator={simulator} />
                </div>
              </div>
              <SimRightPanel simulator={simulator} />
            </>
          ) : (
            <>
              {project ? (
                <EditorLeftPanel project={project} />
              ) : (
                <aside className="hidden w-64 shrink-0 border-r border-border bg-white md:block" />
              )}
              <div className="relative flex-1">
                <div
                  className="absolute inset-0"
                  style={{ background: CANVAS_BG }}
                >
                  {project && (
                    <>
                      <ProjectCanvas key={jsonStr} project={project} />
                      <PartContextMenu project={project} />
                    </>
                  )}
                </div>
              </div>
              {project && <EditorRightPanel project={project} />}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

/** Surfaces ngspice errors/warnings as toasts (deduped per run). */
const SimMessages = observer(function SimMessages({
  simulator,
}: {
  simulator: Simulator
}) {
  const shown = useRef(new Set<string>())
  useEffect(
    () =>
      autorun(() => {
        simulator.observable.errors.forEach((m) => {
          if (!shown.current.has(m)) {
            shown.current.add(m)
            toast.error(m)
          }
        })
        simulator.observable.warnings.forEach((m) => {
          if (!shown.current.has(m)) {
            shown.current.add(m)
            toast.warning(m)
          }
        })
      }),
    [simulator],
  )
  return null
})
