/**
 * Typed fetch helpers for the write API (`src/routes/api/data/*`).
 *
 * Reads are local-first — the browser gets them from the Electric-backed
 * collections in `#/lib/collections`. Writes go here and come back with the
 * Postgres transaction id, which the collections await so optimistic state is
 * dropped exactly when the synced rows land.
 */
import type { CameraJSON, PartJSON, ProjectJSON, WireJSON } from '#/sim/types'

const BASE = '/api/data'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${path} failed (${res.status}) ${detail}`)
  }
  return (await res.json()) as T
}

/** Entity ops + metadata for one project, applied in a single transaction. */
export interface TxRequest {
  projectId: string
  /** upserts (whole entities; last writer wins) */
  parts?: PartJSON[]
  removeParts?: string[]
  wires?: WireJSON[]
  removeWires?: string[]
  name?: string
  camera?: CameraJSON | null
  simulating?: boolean
  agentVersion?: number
}

export const applyTx = (body: TxRequest) => post<{ txid: string }>('/tx', body)

export interface CreateProjectRequest {
  id: string
  name: string
  user_id?: string | null
  parent_id?: string | null
  camera?: CameraJSON | null
  parts?: PartJSON[]
  wires?: WireJSON[]
}

/** No-op (`created: false`) if the id already exists. */
export const createProject = (body: CreateProjectRequest) =>
  post<{ created: boolean; txid: string }>('/projects', body)

export const duplicateProject = (body: {
  id: string
  newId: string
  name?: string
}) => post<{ id: string; txid: string }>('/projects/duplicate', body)

export const removeProject = (id: string) =>
  post<{ txid: string }>('/projects/remove', { id })

export const setProjectPublic = (id: string, isPublic: boolean) =>
  post<{ txid: string }>('/projects/set-public', { id, isPublic })

/** Whole project (metadata + circuit) for consumers without a live collection. */
export async function fetchProject(id: string): Promise<
  | (ProjectJSON & {
      isPublic: boolean
      simulating: boolean
      agentVersion: number
      preview: string | null
    })
  | null
> {
  const res = await fetch(`${BASE}/projects/${id}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`GET /projects/${id} failed (${res.status})`)
  return (await res.json()) as ProjectJSON & {
    isPublic: boolean
    simulating: boolean
    agentVersion: number
    preview: string | null
  }
}
