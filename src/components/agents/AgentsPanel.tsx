import { useEffect, useState } from 'react'
import { entities } from '@electric-ax/agents-runtime/client'
import type { ObservationStreamDB } from '@electric-ax/agents-runtime/client'
import {
  HistoryIcon,
  MoreHorizontalIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { ChatThread, agentsClient } from './ChatThread'

interface MemberRow {
  url: string
  status: 'spawning' | 'running' | 'idle' | 'stopped'
  tags: Record<string, string>
  created_at: number
}

/** The project's chats (one durable entity each), newest first. */
function useChats(projectId: string) {
  const [rows, setRows] = useState<MemberRow[]>([])
  useEffect(() => {
    let alive = true
    let db: ObservationStreamDB | null = null
    let timer: ReturnType<typeof setInterval> | null = null
    void (
      agentsClient().observe(
        entities({ tags: { project: projectId } }),
      ) as Promise<ObservationStreamDB>
    )
      .then(async (d) => {
        db = d
        await d.preload?.()
        if (!alive) return
        // the membership collection is a runtime proxy (`toArray`), not a TanStack Collection: sample it
        const members = (
          d.collections as { members?: { toArray: MemberRow[] } }
        ).members
        const read = () =>
          setRows(
            [...(members?.toArray ?? [])]
              .filter((r) => r.status !== 'stopped')
              .sort((a, b) => b.created_at - a.created_at),
          )
        read()
        timer = setInterval(read, 500)
      })
      .catch(() => {})
    return () => {
      alive = false
      if (timer) clearInterval(timer)
      db?.close?.()
    }
  }, [projectId])
  return rows
}

/**
 * Right-hand chat, ChatGPT-style: one conversation at a time, a history menu
 * for the others, "new chat" creates the entity lazily on the first message.
 */
export function AgentsPanel({
  projectId,
  action,
}: {
  projectId: string
  /** Rendered at the right of the header (the Simulate control). */
  action?: React.ReactNode
}) {
  const chats = useChats(projectId)
  const [selected, setSelected] = useState<string | null>(null)
  const current = chats.find((c) => c.url === selected) ?? null
  const title = current?.tags.name ?? 'New chat'

  const create = async (firstText: string) => {
    const res = await fetch('/api/agents/spawn', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectId, name: firstText.slice(0, 48) }),
    })
    const data = (await res.json()) as { entityUrl?: string }
    if (!data.entityUrl) throw new Error('could not create chat')
    setSelected(data.entityUrl)
    return data.entityUrl
  }

  const remove = async () => {
    if (!selected) return
    const url = selected
    setSelected(null)
    await fetch('/api/agents/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entityUrl: url }),
    })
  }

  return (
    <aside className="pointer-events-auto flex h-full min-h-0 w-96 flex-col overflow-hidden rounded-md border border-border bg-card shadow-sm">
      <header className="flex h-10 shrink-0 items-center justify-between gap-2 border-b border-border pr-1.5 pl-3">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {title}
        </span>
        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground">
          {selected && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="New chat"
                  onClick={() => setSelected(null)}
                >
                  <PlusIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="History">
                <HistoryIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuLabel>Chats</DropdownMenuLabel>
              {chats.length === 0 && (
                <DropdownMenuItem disabled>No chats yet</DropdownMenuItem>
              )}
              {chats.map((c) => (
                <DropdownMenuItem
                  key={c.url}
                  onSelect={() => setSelected(c.url)}
                >
                  <span
                    className={`size-2 shrink-0 rounded-full ${c.status === 'running' ? 'bg-primary' : 'bg-gray-300'}`}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {c.tags.name ?? c.url}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {selected && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Chat menu">
                  <MoreHorizontalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onSelect={() => setSelected(null)}>
                  <PlusIcon /> New chat
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => void remove()}
                >
                  <TrashIcon /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {action && (
            <span className="ml-1 pl-1.5 border-l border-border">{action}</span>
          )}
        </div>
      </header>
      <ChatThread
        key={selected ?? 'new'}
        entityUrl={selected}
        onCreate={create}
      />
    </aside>
  )
}
