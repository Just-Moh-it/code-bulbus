/**
 * Local-first reads: Electric streams Postgres shapes into TanStack DB
 * collections, and every screen reads them through live queries. Writes never
 * go through here — they go to `/api/data/*` (see `#/lib/api`) and come back
 * with a txid the collections await, so optimistic state is dropped exactly
 * when the synced rows arrive.
 *
 * Rows carry raw Postgres column names (`project_id`, `is_public`, …) because
 * that is what a shape delivers and what its `where` clause speaks.
 */
import { createCollection, useLiveQuery } from '@tanstack/react-db'
import { electricCollectionOptions } from '@tanstack/electric-db-collection'
import { useMemo } from 'react'
import type { CameraJSON, CircuitJSON, PartJSON, WireJSON } from '#/sim/types'

const ELECTRIC_URL =
  import.meta.env.VITE_ELECTRIC_URL ?? 'http://localhost:5444'

const SHAPE_URL = `${ELECTRIC_URL.replace(/\/$/, '')}/v1/shape`

/**
 * `bigint` columns (agent_version) would otherwise arrive as BigInt, which
 * neither JSON.stringify nor the editor models can handle.
 */
const parser = { int8: (value: string) => Number(value) }

/** `projects` as Electric delivers it. Written as a type alias so it satisfies Electric's `Row`. */
export type ProjectRow = {
  id: string
  name: string
  user_id: string | null
  parent_id: string | null
  is_public: boolean
  featured: boolean
  created_at: string
  camera: CameraJSON | null
  simulating: boolean
  agent_version: number
  preview: string | null
  preview_hash: string | null
}

export type PartRow = {
  project_id: string
  id: string
  data: PartJSON
}

export type WireRow = {
  project_id: string
  id: string
  data: WireJSON
}

/**
 * Automated browsers (navigator.webdriver) report document.hidden === true
 * forever, which makes the Electric client pause every stream and the app
 * never load. Report always-visible there; real browsers keep the default
 * pause-when-hidden behaviour.
 */
const forceVisible = () => {
  try {
    return (
      (typeof navigator !== 'undefined' && navigator.webdriver) ||
      (typeof localStorage !== 'undefined' &&
        localStorage.getItem('bulbus:always-visible') === '1')
    )
  } catch {
    return false
  }
}
const runtimeVisibility = forceVisible()
  ? {
      getCurrentState: () => 'visible' as const,
      subscribe: () => () => {},
    }
  : undefined

const makeProjects = () =>
  createCollection(
    electricCollectionOptions<ProjectRow>({
      id: 'projects',
      shapeOptions: {
        url: SHAPE_URL,
        runtimeVisibility,
        params: { table: 'projects' },
        parser,
      },
      getKey: (row) => row.id,
    }),
  )

/** One shape per project, so an editor only ever streams its own circuit. */
const makeParts = (projectId: string) =>
  createCollection(
    electricCollectionOptions<PartRow>({
      id: `parts-${projectId}`,
      shapeOptions: {
        url: SHAPE_URL,
        runtimeVisibility,
        params: {
          table: 'parts',
          where: 'project_id = $1',
          params: [projectId],
        },
        parser,
      },
      getKey: (row) => row.id,
    }),
  )

const makeWires = (projectId: string) =>
  createCollection(
    electricCollectionOptions<WireRow>({
      id: `wires-${projectId}`,
      shapeOptions: {
        url: SHAPE_URL,
        runtimeVisibility,
        params: {
          table: 'wires',
          where: 'project_id = $1',
          params: [projectId],
        },
        parser,
      },
      getKey: (row) => row.id,
    }),
  )

export type ProjectsCollection = ReturnType<typeof makeProjects>
export type PartsCollection = ReturnType<typeof makeParts>
export type WiresCollection = ReturnType<typeof makeWires>

let projects: ProjectsCollection | null = null
const partsByProject = new Map<string, PartsCollection>()
const wiresByProject = new Map<string, WiresCollection>()

/** Every project row. Screens filter client-side in their live queries. */
export function projectsCollection(): ProjectsCollection {
  projects ??= makeProjects()
  return projects
}

export function partsCollection(projectId: string): PartsCollection {
  let c = partsByProject.get(projectId)
  if (!c) {
    c = makeParts(projectId)
    partsByProject.set(projectId, c)
  }
  return c
}

export function wiresCollection(projectId: string): WiresCollection {
  let c = wiresByProject.get(projectId)
  if (!c) {
    c = makeWires(projectId)
    wiresByProject.set(projectId, c)
  }
  return c
}

/** Project metadata in the shape the app has always used (`convex/circuit.get`'s `project`). */
export interface ProjectMeta {
  id: string
  name: string
  user_id: string | null
  parent_id: string | null
  featured: boolean
  isPublic: boolean
  created_at: string
  camera: CameraJSON | undefined
  simulating: boolean
  agentVersion: number
  preview: string | null
}

export const rowToMeta = (r: ProjectRow): ProjectMeta => ({
  id: r.id,
  name: r.name,
  user_id: r.user_id,
  parent_id: r.parent_id,
  featured: r.featured,
  isPublic: r.is_public,
  created_at: r.created_at,
  camera: r.camera ?? undefined,
  simulating: r.simulating,
  agentVersion: Number(r.agent_version ?? 0),
  preview: r.preview,
})

/** Card data for the grids. `undefined` while the shape is still loading. */
export function useProjectList(filter?: { isPublic?: boolean }) {
  const onlyPublic = filter?.isPublic
  const { data, isLoading } = useLiveQuery(
    (q) => q.from({ p: projectsCollection() }),
    [],
  )
  return useMemo(() => {
    if (isLoading) return undefined
    const rows = ((data as ProjectRow[] | undefined) ?? []).filter((r) =>
      onlyPublic === undefined ? true : r.is_public === onlyPublic,
    )
    return rows
      .slice()
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .map((r) => ({ id: r.id, name: r.name, previewUrl: r.preview }))
  }, [data, isLoading, onlyPublic])
}

/** Project metadata + circuit. `undefined` while loading, `null` when there is no such project. */
export interface ProjectSnapshot {
  project: ProjectMeta
  circuit: CircuitJSON
}

export function useProjectSnapshot(
  projectId: string,
): ProjectSnapshot | null | undefined {
  const projectQuery = useLiveQuery(
    (q) => q.from({ p: projectsCollection() }),
    [],
  )
  const partsQuery = useLiveQuery(
    (q) => q.from({ part: partsCollection(projectId) }),
    [projectId],
  )
  const wiresQuery = useLiveQuery(
    (q) => q.from({ wire: wiresCollection(projectId) }),
    [projectId],
  )
  const loading =
    projectQuery.isLoading || partsQuery.isLoading || wiresQuery.isLoading
  const row = ((projectQuery.data as ProjectRow[] | undefined) ?? []).find(
    (r) => r.id === projectId,
  )
  const partRows = (partsQuery.data as PartRow[] | undefined) ?? []
  const wireRows = (wiresQuery.data as WireRow[] | undefined) ?? []
  return useMemo(() => {
    if (loading) return undefined
    if (!row) return null
    return {
      project: rowToMeta(row),
      circuit: {
        parts: partRows.map((r) => r.data),
        wires: wireRows.map((r) => r.data),
      },
    }
  }, [loading, row, partRows, wireRows])
}
