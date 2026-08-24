import { useEffect, useMemo, useRef, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { autorun } from 'mobx'
import { observer } from 'mobx-react-lite'
import { toast } from 'sonner'
import {
  applyTx,
  createProject,
  duplicateProject,
  removeProject,
} from '#/lib/api'
import { useProjectSnapshot } from '#/lib/collections'
import { useDocumentTitle } from '#/lib/use-document-title'
import { ArduinoUnoPart, EditorProject } from '#/editor/models'
import { ProjectCanvas } from '#/editor/scene/ProjectCanvas'
import { PartContextMenu } from '#/components/editor/ContextMenu'
import { EditorTopBar, SimulateButton } from '#/components/editor/Navbar'
import { EditorLeftPanel, SimLeftPanel } from '#/components/editor/Panels'
import { AgentsPanel } from '#/components/agents/AgentsPanel'
import { UserMenu } from '#/components/auth/UserMenu'
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

const CANVAS_BG = '#F3F5F9'

function ProjectPage() {
  const { id } = Route.useParams()
  const { template } = Route.useSearch()
  const server = useProjectSnapshot(id)
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
    void createProject({
      id,
      name: fresh.name,
      user_id: null,
      parent_id: null,
      camera: fresh.camera ?? null,
      parts: fresh.circuit.parts,
      wires: fresh.circuit.wires,
    })
  }, [server, template, id, json])
  const project = useMemo(() => (json ? new EditorProject(json) : null), [json])
  // the tab tracks the project as it is renamed, and flags a running simulation
  useDocumentTitle(
    server ? `${simulator ? '▶ ' : ''}${server.project.name}` : null,
  )
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

  // Simulation is shared project state, so the agent's start_simulation /
  // stop_simulation drive this editor exactly like the buttons do.
  const wantsSimulation = server?.project.simulating ?? false
  useEffect(() => {
    if (!project) return
    if (wantsSimulation && !simulator) {
      const sim = new Simulator(project.toJSON())
      sim.start()
      setSimulator(sim)
    } else if (!wantsSimulation && simulator) {
      simulator.stop()
      setSimulator(null)
    }
  }, [wantsSimulation, simulator, project])
  useEffect(() => {
    return () => simulator?.stop()
  }, [simulator])
  const setSimulating = (simulating: boolean) =>
    void applyTx({ projectId: id, simulating }).catch((e: unknown) =>
      console.error('setSimulating failed', e),
    )
  const startSimulation = () => setSimulating(true)
  const stopSimulation = () => setSimulating(false)
  const del = async () => {
    await removeProject(id)
    void navigate({ to: '/' })
  }

  const simulateButton = (
    <SimulateButton
      project={project}
      simulator={simulator}
      onStartSimulation={startSimulation}
      onStopSimulation={stopSimulation}
    />
  )

  // Islands: the canvas fills the window; every panel floats above it.
  return (
    <div
      className="relative h-screen select-none overflow-hidden"
      style={{ background: CANVAS_BG }}
    >
      <div className="absolute inset-0">
        {simulator ? (
          <>
            <SimCanvas simulator={simulator} />
            <SimMessages simulator={simulator} />
          </>
        ) : (
          project && (
            <>
              <ProjectCanvas project={project} />
              <PartContextMenu project={project} />
            </>
          )
        )}
      </div>
      <div className="pointer-events-none absolute inset-0 hidden p-3 md:block">
        <div className="flex h-full gap-3">
          <div className="flex shrink-0 flex-col gap-3">
            <EditorTopBar
              project={project}
              onDelete={del}
              onDuplicate={async () => {
                const newId = crypto.randomUUID()
                await duplicateProject({ id, newId })
                await navigate({ to: '/projects/$id', params: { id: newId } })
              }}
            />
            <div className="min-h-0 flex-1">
              {simulator ? (
                <SimLeftPanel simulator={simulator} />
              ) : (
                project && <EditorLeftPanel project={project} />
              )}
            </div>
          </div>
          <div className="flex-1" />
          <div className="flex h-full flex-col items-end gap-3">
            <div className="glass pointer-events-auto flex h-10 items-center gap-1.5 rounded-md border px-1.5">
              <UserMenu />
              {simulateButton}
            </div>
            <div className="flex-1" />
            <AgentsPanel projectId={id} compact={!!simulator} />
          </div>
        </div>
      </div>
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
