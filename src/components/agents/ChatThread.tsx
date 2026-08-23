import { useEffect, useMemo, useState } from 'react'
import { createAgentsClient, entity } from '@electric-ax/agents-runtime/client'
import type {
  AgentsClient,
  EntityStreamDB,
  EntityTimelineContentItem,
} from '@electric-ax/agents-runtime/client'
import { useChat } from '@electric-ax/agents-runtime/react'
import {
  CheckIcon,
  CopyIcon,
  CpuIcon,
  FileIcon,
  FolderOpenIcon,
  MessageCircleDashedIcon,
  MinusIcon,
  PlayIcon,
  PlusIcon,
  SparklesIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Streamdown } from 'streamdown'
import { Bubble, BubbleContent } from '#/components/ui/bubble'
import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#/components/ui/empty'
import { Marker, MarkerContent, MarkerIcon } from '#/components/ui/marker'
import { Message, MessageContent, MessageFooter } from '#/components/ui/message'
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '#/components/ui/message-scroller'
import { ChatComposer } from './ChatComposer'
import type { ComposerSubmit } from './ChatComposer'
import { cn } from '#/lib/utils.ts'

/** Coordinator URL the browser observes directly (server routes handle writes). */
const AGENTS_URL = import.meta.env.VITE_AGENTS_URL ?? 'http://localhost:4437'
let client: AgentsClient | null = null
export function agentsClient() {
  client ??= createAgentsClient({ baseUrl: AGENTS_URL })
  return client
}

/** Observe an entity; null until the initial snapshot is loaded. */
function useEntityDb(entityUrl: string | null) {
  const [db, setDb] = useState<EntityStreamDB | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    setDb(null)
    setError(null)
    if (!entityUrl) return
    let alive = true
    let opened: EntityStreamDB | null = null
    void (agentsClient().observe(entity(entityUrl)) as Promise<EntityStreamDB>)
      .then(async (d) => {
        opened = d
        await d.preload()
        if (alive) setDb(d)
        else d.close()
      })
      .catch(
        (e: unknown) =>
          alive && setError(e instanceof Error ? e.message : String(e)),
      )
    return () => {
      alive = false
      opened?.close()
    }
  }, [entityUrl])
  return { db, error }
}

type ToolPresentation = { Icon: LucideIcon; pending: string; done: string }
const TOOL_PRESENTATION: Record<string, ToolPresentation> = {
  get_project: {
    Icon: FolderOpenIcon,
    pending: 'Reading the project',
    done: 'Read the project',
  },
  list_projects: {
    Icon: FolderOpenIcon,
    pending: 'Listing projects',
    done: 'Listed projects',
  },
  list_part_types: {
    Icon: CpuIcon,
    pending: 'Checking available parts',
    done: 'Checked available parts',
  },
  add_part: {
    Icon: PlusIcon,
    pending: 'Placing a part',
    done: 'Placed a part',
  },
  update_part: {
    Icon: WrenchIcon,
    pending: 'Updating a part',
    done: 'Updated a part',
  },
  remove_part: {
    Icon: MinusIcon,
    pending: 'Removing a part',
    done: 'Removed a part',
  },
  add_wire: { Icon: PlusIcon, pending: 'Adding a wire', done: 'Added a wire' },
  set_arduino_code: {
    Icon: FileIcon,
    pending: 'Compiling the sketch',
    done: 'Compiled the sketch',
  },
  simulate: { Icon: PlayIcon, pending: 'Simulating', done: 'Simulated' },
  create_project: {
    Icon: SparklesIcon,
    pending: 'Creating a project',
    done: 'Created a project',
  },
}
function toolPresentation(name: string): ToolPresentation {
  return (
    TOOL_PRESENTATION[name] ?? {
      Icon: WrenchIcon,
      pending: `Running ${name.replaceAll('_', ' ')}`,
      done: `Finished ${name.replaceAll('_', ' ')}`,
    }
  )
}

function ToolMarker({
  item,
}: {
  item: Extract<EntityTimelineContentItem, { kind: 'tool_call' }>
}) {
  const { Icon, pending, done } = toolPresentation(item.toolName)
  const failed = item.status === 'failed' || item.isError
  const finished = item.status === 'completed' || failed
  const detail = failed ? (item.error ?? item.result) : null
  return (
    <Marker role="status">
      <MarkerIcon>{failed ? <XIcon /> : <Icon />}</MarkerIcon>
      <MarkerContent className={cn(!finished && 'shimmer')}>
        {failed ? `${pending} failed` : finished ? done : pending}
        {detail ? (
          <span className="text-destructive"> — {detail.slice(0, 240)}</span>
        ) : null}
      </MarkerContent>
    </Marker>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      aria-label={copied ? 'Copied' : 'Copy'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 2000)
        })
      }}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </Button>
  )
}

interface AttachmentRow {
  kind: string
  id: string
  filename?: string
  mimeType: string
  status: string
  subject: { type: string; key: string }
}

function UserAttachments({
  entityUrl,
  rows,
}: {
  entityUrl: string
  rows: AttachmentRow[]
}) {
  if (rows.length === 0) return null
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {rows.map((a) => {
        const src = `/api/agents/attachment?entityUrl=${encodeURIComponent(entityUrl)}&id=${encodeURIComponent(a.id)}&mime=${encodeURIComponent(a.mimeType)}`
        return a.mimeType.startsWith('image/') ? (
          <img
            key={a.id}
            src={src}
            alt={a.filename ?? 'Attachment'}
            className="max-h-48 max-w-full rounded-xl object-contain"
          />
        ) : (
          <a
            key={a.id}
            href={src}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-lg border border-border/80 px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <FileIcon className="size-4" />
            {a.filename ?? 'Attachment'}
          </a>
        )
      })}
    </div>
  )
}

const SUGGESTIONS = [
  'Blink an LED on pin 13 with a 220 Ω resistor',
  'Check my circuit for mistakes and fix them',
  'Build a thermostat: TMP36, potentiometer and an I²C LCD',
] as const

/**
 * One chat (one durable entity). `entityUrl` is null for a brand-new chat:
 * the first send spawns the entity (via `onCreate`) and then delivers.
 */
export function ChatThread({
  entityUrl,
  onCreate,
}: {
  entityUrl: string | null
  onCreate: (firstText: string) => Promise<string>
}) {
  const { db, error } = useEntityDb(entityUrl)
  const chat = useChat(db)
  // dev aid: inspect the live stream db from the console
  useEffect(() => {
    if (import.meta.env.DEV)
      (window as unknown as { chatDb?: EntityStreamDB | null }).chatDb = db
  }, [db])
  const [sending, setSending] = useState(false)
  const isBusy = sending || chat.state === 'working' || chat.state === 'queued'

  // attachments per inbox message key (manifests are observable rows)
  const attachmentsByKey = useMemo(() => {
    const byKey = new Map<string, AttachmentRow[]>()
    const manifests =
      (db?.collections.manifests as { toArray: AttachmentRow[] } | undefined)
        ?.toArray ?? []
    for (const m of manifests) {
      if (m.kind !== 'attachment' || m.subject.type !== 'inbox') continue
      byKey.set(m.subject.key, [...(byKey.get(m.subject.key) ?? []), m])
    }
    return byKey
    // chat.inbox changes whenever the stream does; manifests ride the same stream
  }, [db, chat.inbox, chat.sections.length])

  const send = async ({ text, attachments }: ComposerSubmit) => {
    setSending(true)
    try {
      const url =
        entityUrl ??
        (await onCreate(text || attachments[0]?.file.name || 'New chat'))
      const form = new FormData()
      form.set('entityUrl', url)
      form.set('text', text)
      attachments.forEach((a) => {
        form.append('files', a.file, a.file.name)
        URL.revokeObjectURL(a.preview)
      })
      await fetch('/api/agents/send', { method: 'POST', body: form })
    } finally {
      setSending(false)
    }
  }

  const sections = chat.sections.filter((s) => s.kind !== 'wake')
  let userIndex = -1
  const lastError = [...chat.sections]
    .reverse()
    .find((s) => s.kind === 'agent_response')?.error

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden pb-24">
        {error ? (
          <p className="px-4 py-3 text-sm text-destructive">
            Agents unavailable: {error}
          </p>
        ) : sections.length === 0 ? (
          <Empty className="h-full">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <MessageCircleDashedIcon />
              </EmptyMedia>
              <EmptyTitle>Ask bulbus</EmptyTitle>
              <EmptyDescription>
                Build, wire, code and simulate — the agent edits this project
                live.
              </EmptyDescription>
            </EmptyHeader>
            <div className="mt-2 w-full max-w-sm">
              {SUGGESTIONS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={isBusy}
                  onClick={() => void send({ text: prompt, attachments: [] })}
                  className="block w-full border-b px-1 py-3.5 text-left text-sm text-muted-foreground transition-colors last:border-b-0 hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </Empty>
        ) : (
          <MessageScrollerProvider autoScroll>
            <MessageScroller className="min-h-0 flex-1">
              <MessageScrollerViewport>
                <MessageScrollerContent
                  aria-busy={isBusy}
                  className="mx-auto w-full gap-4 px-3 py-4"
                >
                  {sections.map((section, index) => {
                    if (section.kind === 'user_message') {
                      userIndex += 1
                      const inboxKey = chat.inbox[userIndex]?.key
                      const atts = inboxKey
                        ? (attachmentsByKey.get(String(inboxKey)) ?? [])
                        : []
                      return (
                        <MessageScrollerItem
                          key={`u-${index}`}
                          messageId={`u-${index}`}
                          scrollAnchor
                        >
                          <Message align="end">
                            <MessageContent>
                              {entityUrl && (
                                <UserAttachments
                                  entityUrl={entityUrl}
                                  rows={atts}
                                />
                              )}
                              {section.text && (
                                <Bubble variant="default" align="end">
                                  <BubbleContent>
                                    <p className="whitespace-pre-wrap select-text">
                                      {section.text}
                                    </p>
                                  </BubbleContent>
                                </Bubble>
                              )}
                              <MessageFooter className="justify-end gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
                                <CopyButton text={section.text} />
                              </MessageFooter>
                            </MessageContent>
                          </Message>
                        </MessageScrollerItem>
                      )
                    }
                    if (section.kind !== 'agent_response') return null
                    const streaming =
                      !section.done && index === sections.length - 1 && isBusy
                    const text = section.items
                      .filter(
                        (
                          i,
                        ): i is Extract<
                          EntityTimelineContentItem,
                          { kind: 'text' }
                        > => i.kind === 'text',
                      )
                      .map((i) => i.text)
                      .join('\n\n')
                    return (
                      <MessageScrollerItem
                        key={`a-${index}`}
                        messageId={`a-${index}`}
                      >
                        <Message align="start">
                          <MessageContent>
                            {section.items.map((item, i) =>
                              item.kind === 'tool_call' ? (
                                <ToolMarker key={item.toolCallId} item={item} />
                              ) : item.text ? (
                                <Bubble key={i} variant="ghost">
                                  <BubbleContent>
                                    <Streamdown
                                      className="select-text text-sm **:select-text"
                                      isAnimating={streaming}
                                    >
                                      {item.text}
                                    </Streamdown>
                                  </BubbleContent>
                                </Bubble>
                              ) : null,
                            )}
                            {section.error && (
                              <div
                                role="alert"
                                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
                              >
                                {section.error}
                              </div>
                            )}
                            {text && section.done && (
                              <MessageFooter className="gap-0.5">
                                <CopyButton text={text} />
                              </MessageFooter>
                            )}
                          </MessageContent>
                        </Message>
                      </MessageScrollerItem>
                    )
                  })}
                  {chat.state === 'queued' || (sending && !lastError) ? (
                    <MessageScrollerItem messageId="pending">
                      <span className="shimmer text-sm">Thinking…</span>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
      </div>
      <div className="absolute right-0 bottom-0 left-0 px-2 pb-3">
        <ChatComposer isBusy={isBusy} onSubmit={send} autoFocus />
      </div>
    </div>
  )
}
