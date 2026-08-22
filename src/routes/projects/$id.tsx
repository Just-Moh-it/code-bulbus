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
import { debounce, defaultProject } from '#/lib/projects'
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
  // Agents edit projects server-side and bump `agentVersion`; adopt their version when it changes.
  const seenVersion = useRef<number | null>(null)
  useEffect(() => {
    if (row === undefined) return
    const version = (row as { agentVersion?: number } | null)?.agentVersion ?? 0
    if (!json) {
      if (row) setJson(row as ProjectJSON)
      else if (template === 'thermostat') setJson(thermostatProject(id))
      else if (template) {
        // brand-new project: persist the template now (later saves follow user edits only)
        const fresh = defaultProject(id)
        setJson(fresh)
        void upsert({
          id: fresh.id,
          name: fresh.name,
          user_id: null,
          parent_id: null,
          circuit: fresh.circuit,
        })
      }
      seenVersion.current = version
      return
    }
    if (
      row &&
      seenVersion.current !== null &&
      version !== seenVersion.current
    ) {
      seenVersion.current = version
      setJson(row as ProjectJSON)
    }
  }, [row, template, id, json])
  const project = useMemo(() => (json ? new EditorProject(json) : null), [json])
  const jsonStr = useMemo(() => JSON.stringify(json), [json])

  useEffect(() => {
    preloadSpice()
  }, [])

  // template projects ship with source but no hex: compile once on first load
  useEffect(() => {
    if (!project || row) return
    project.circuit.parts.forEach((p) => {
      if (p instanceof ArduinoUnoPart && !p.hexFile) void compileArduino(p)
    })
  }, [project])

  // Persist only on user edits (history pushes, camera moves) — never on load,
  // otherwise a freshly adopted agent write would be echoed back over later ones.
  // `baseAgentVersion` lets the server refuse a stale client; we then adopt the row.
  const save = useRef(
    debounce((j: ProjectJSON, base: number) => {
      void upsert({
        id: j.id,
        name: j.name,
        user_id: j.user_id ?? null,
        parent_id: j.parent_id ?? null,
        camera: j.camera,
        circuit: j.circuit,
        baseAgentVersion: base,
      }).then((res) => {
        const r = res as { conflict?: boolean; agentVersion?: number } | null
        if (r?.conflict && r.agentVersion !== undefined) {
          seenVersion.current = r.agentVersion
          setJson(r as unknown as ProjectJSON)
        }
      })
    }, 2000),
  )
  useEffect(() => {
    if (!project) return
    return project.onSave(() =>
      save.current(project.toJSON(), seenVersion.current ?? 0),
    )
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
                  <ProjectCanvas key={jsonStr} project={project} />
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
