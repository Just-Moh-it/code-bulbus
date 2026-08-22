import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { autorun } from 'mobx'
import { observer } from 'mobx-react-lite'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { ArduinoUnoPart, EditorProject } from '#/editor/models'
import { ProjectCanvas } from '#/editor/scene/ProjectCanvas'
import { PartContextMenu } from '#/components/editor/ContextMenu'
import { EditorNavbar } from '#/components/editor/Navbar'
import { EditorLeftPanel, SimLeftPanel } from '#/components/editor/Panels'
import { AgentsPanel } from '#/components/agents/AgentsPanel'
import { Simulator } from '#/simulator/model'
import { SimCanvas } from '#/simulator/SimCanvas'
import { defaultProject } from '#/lib/projects'
import { useProjectSync } from '#/editor/sync/useProjectSync'
import { thermostatProject } from '#/lib/thermostat'
import { compileArduino } from '#/lib/compile-client'
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
  const server = useQuery(api.circuit.get, { projectId: id })
  const create = useMutation(api.projects.create)
  const remove = useMutation(api.projects.remove)
  const navigate = useNavigate()
  const [simulator, setSimulator] = useState<Simulator | null>(null)

  // The model is built once per id from the first server snapshot; every later
  // snapshot is reconciled into it by useProjectSync (never rebuilt).
  const [json, setJson] = useState<ProjectJSON | null>(null)
  useEffect(() => {
    setJson(null)
  }, [id])
  useEffect(() => {
    if (server === undefined || json) return
    if (server) {
      setJson({ ...server.project, circuit: server.circuit })
      return
    }
    if (!template) return
    const fresh =
      template === 'thermostat' ? thermostatProject(id) : defaultProject(id)
    void create({
      id,
      name: fresh.name,
      user_id: null,
      parent_id: null,
      parts: fresh.circuit.parts,
      wires: fresh.circuit.wires,
    })
  }, [server, template, id, json, create])
  const project = useMemo(() => (json ? new EditorProject(json) : null), [json])
  useProjectSync(project, server)
  // dev aid: inspect the live model from the console
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as unknown as { project?: EditorProject | null }).project =
        project
  }, [project])

  useEffect(() => {
    preloadSpice()
  }, [])

  // template projects ship with source but no hex: compile once
  useEffect(() => {
    if (!project) return
    project.circuit.parts.forEach((p) => {
      if (p instanceof ArduinoUnoPart && !p.hexFile) void compileArduino(p)
    })
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
    sim.start()
    setSimulator(sim)
  }
  const stopSimulation = () => {
    simulator?.stop()
    setSimulator(null)
  }
  const fork = async () => {
    if (!project) return
    const j = project.toJSON()
    const newId = crypto.randomUUID()
    await create({
      id: newId,
      name: `${j.name} (fork)`,
      user_id: j.user_id ?? null,
      parent_id: project.id,
      camera: j.camera,
      parts: j.circuit.parts,
      wires: j.circuit.wires,
    })
    void navigate({ to: '/projects/$id', params: { id: newId } })
  }
  const del = async () => {
    await remove({ id })
    void navigate({ to: '/' })
  }

  return (
    <div className="flex h-screen select-none flex-col">
      <EditorNavbar
        project={project}
        simulator={simulator}
        onStartSimulation={startSimulation}
        onStopSimulation={stopSimulation}
        onFork={fork}
        onDelete={del}
      />
      <main className="flex min-h-0 flex-1">
        {simulator ? (
          <>
            <SimLeftPanel simulator={simulator} />
            <div
              className="relative min-w-0 flex-1"
              style={{ background: CANVAS_BG }}
            >
              <SimCanvas simulator={simulator} />
              <SimMessages simulator={simulator} />
            </div>
          </>
        ) : (
          <>
            {project ? (
              <EditorLeftPanel project={project} />
            ) : (
              <aside className="hidden w-64 shrink-0 border-r border-border bg-white md:block" />
            )}
            <div
              className="relative min-w-0 flex-1"
              style={{ background: CANVAS_BG }}
            >
              {project && (
                <>
                  <ProjectCanvas project={project} />
                  <PartContextMenu project={project} />
                </>
              )}
            </div>
            <AgentsPanel projectId={id} />
          </>
        )}
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
