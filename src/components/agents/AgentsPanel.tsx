import { useEffect, useState } from 'react'
import {
  createAgentsClient,
  entities,
  entity,
} from '@electric-ax/agents-runtime/client'
import type {
  AgentsClient,
  EntityStreamDB,
  EntityTimelineSection,
  ObservationStreamDB,
} from '@electric-ax/agents-runtime/client'
import { useChat } from '@electric-ax/agents-runtime/react'
import { Bot, Plus, Send } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { Textarea } from '#/components/ui/textarea'

/** Coordinator URL the browser observes directly (server routes handle spawn/send). */
const AGENTS_URL = import.meta.env.VITE_AGENTS_URL ?? 'http://localhost:4437'

let client: AgentsClient | null = null
function agentsClient() {
  client ??= createAgentsClient({ baseUrl: AGENTS_URL })
  return client
}

interface StreamHandle {
  preload?: () => Promise<void>
  close?: () => void
}

/**
 * Observe a source and hand back its live DB; null until loaded.
 * StreamDBs are lazy: `preload()` opens the stream and loads the initial
 * snapshot, `close()` stops the long-poll when the component goes away.
 */
function useObservation<T extends StreamHandle>(
  make: () => Promise<T>,
  deps: unknown[],
) {
  const [db, setDb] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    let opened: T | null = null
    setDb(null)
    setError(null)
    make()
      .then(async (d) => {
        opened = d
        await d.preload?.()
        if (alive) setDb(d)
        else d.close?.()
      })
      .catch(
        (e: unknown) =>
          alive && setError(e instanceof Error ? e.message : String(e)),
      )
    return () => {
      alive = false
      opened?.close?.()
    }
    // deps are the caller's identity keys (e.g. entityUrl); `make` is recreated per render on purpose
  }, deps)
  return { db, error }
}

interface MemberRow {
  url: string
  type: string
  status: 'spawning' | 'running' | 'idle' | 'stopped'
  tags: Record<string, string>
  created_at: number
}

function AgentList({
  projectId,
  selected,
  onSelect,
}: {
  projectId: string
  selected: string | null
  onSelect: (url: string) => void
}) {
  const { db, error } = useObservation(
    () =>
      agentsClient().observe(
        entities({ tags: { project: projectId } }),
      ) as Promise<ObservationStreamDB>,
    [projectId],
  )
  // the membership collection is a runtime proxy (`toArray`), not a TanStack
  // Collection, so it can't feed useLiveQuery; sample it at a modest cadence
  const [rows, setRows] = useState<MemberRow[]>([])
  useEffect(() => {
    if (!db) return
    const members = (db.collections as { members?: { toArray: MemberRow[] } })
      .members
    const read = () => setRows(members ? [...members.toArray] : [])
    read()
    const t = setInterval(read, 500)
    return () => clearInterval(t)
  }, [db])
  rows.sort((a, b) => a.created_at - b.created_at)

  if (error)
    return (
      <p className="px-4 py-2 text-xs text-red-500">
        Agents unavailable: {error}
      </p>
    )
  return (
    <ul className="flex flex-col gap-0.5 px-2 py-1">
      {rows.map((r) => (
        <li key={r.url}>
          <button
            type="button"
            onClick={() => onSelect(r.url)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-100 ${selected === r.url ? 'bg-gray-100' : ''}`}
          >
            <span
              className={`size-2 rounded-full ${r.status === 'running' ? 'bg-teal-400' : r.status === 'stopped' ? 'bg-gray-300' : 'bg-gray-400'}`}
            />
            <span className="truncate">{r.tags.name ?? r.url}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {r.status}
            </span>
          </button>
        </li>
      ))}
      {rows.length === 0 && !error && (
        <li className="px-2 py-1 text-xs text-muted-foreground">
          No agents yet.
        </li>
      )}
    </ul>
  )
}

function Section({ section }: { section: EntityTimelineSection }) {
  if (section.kind === 'user_message') {
    return (
      <div className="ml-8 whitespace-pre-wrap rounded-lg bg-teal-50 px-3 py-2 text-sm">
        {section.text}
      </div>
    )
  }
  if (section.kind === 'agent_response') {
    return (
      <div className="mr-4 flex flex-col gap-1">
        {section.items.map((item, i) =>
          item.kind === 'text' ? (
            <div
              key={i}
              className="whitespace-pre-wrap rounded-lg bg-gray-100 px-3 py-2 text-sm"
            >
              {item.text}
            </div>
          ) : (
            <details
              key={i}
              className="rounded-md border border-border px-2 py-1 text-xs"
            >
              <summary className="cursor-pointer">
                <span className="font-mono">{item.toolName}</span> ·{' '}
                {item.status}
                {item.isError && <span className="text-red-500"> · error</span>}
              </summary>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(item.args, null, 1)}
              </pre>
              {item.result && (
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap border-t border-border pt-1">
                  {item.result}
                </pre>
              )}
            </details>
          ),
        )}
        {section.error && (
          <p className="text-xs text-red-500">{section.error}</p>
        )}
      </div>
    )
  }
  return null
}

function Chat({ entityUrl }: { entityUrl: string }) {
  const { db, error } = useObservation(
    () => agentsClient().observe(entity(entityUrl)) as Promise<EntityStreamDB>,
    [entityUrl],
  )
  const chat = useChat(db)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    const text = draft.trim()
    if (!text) return
    setSending(true)
    try {
      const res = await fetch('/api/agents/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityUrl, text }),
      })
      if (res.ok) setDraft('')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 py-3">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {chat.sections.map((s, i) => (
          <Section key={i} section={s} />
        ))}
        {chat.state === 'working' ||
          (chat.state === 'queued' && (
            <p className="text-xs text-muted-foreground">thinking…</p>
          ))}
      </div>
      <div className="flex items-end gap-2 border-t border-border p-2">
        <Textarea
          className="min-h-9 resize-none text-sm"
          rows={2}
          placeholder="Ask the agent to change or check the circuit…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <Button
          size="icon"
          variant="secondary"
          aria-label="Send"
          disabled={sending || !draft.trim()}
          onClick={() => void send()}
        >
          <Send className="size-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Right-hand panel: the project's agents (one durable Electric Agents entity
 * each) and the chat for the selected one. Several agents can run at once.
 */
export function AgentsPanel({ projectId }: { projectId: string }) {
  const [selected, setSelected] = useState<string | null>(null)
  const [spawning, setSpawning] = useState(false)

  const spawn = async () => {
    setSpawning(true)
    try {
      const res = await fetch('/api/agents/spawn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          name: `Agent ${new Date().toLocaleTimeString()}`,
        }),
      })
      const data = (await res.json()) as { entityUrl?: string }
      if (data.entityUrl) setSelected(data.entityUrl)
    } finally {
      setSpawning(false)
    }
  }

  return (
    <aside className="hidden h-full min-h-0 w-80 shrink-0 flex-col border-l border-border bg-white md:flex">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-bold">
          <Bot className="size-4" /> Agents
        </span>
        <Button
          size="sm"
          variant="secondary"
          disabled={spawning}
          onClick={() => void spawn()}
        >
          <Plus className="mr-1 size-4" /> New
        </Button>
      </div>
      <div className="max-h-40 overflow-y-auto border-b border-border/60">
        <AgentList
          projectId={projectId}
          selected={selected}
          onSelect={setSelected}
        />
      </div>
      {selected ? (
        <Chat key={selected} entityUrl={selected} />
      ) : (
        <p className="px-4 py-3 text-sm text-muted-foreground">
          Pick an agent or create one.
        </p>
      )}
    </aside>
  )
}
