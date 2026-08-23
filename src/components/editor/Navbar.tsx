import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  Check,
  Clipboard,
  Code2,
  GitFork,
  MoreHorizontal,
  Play,
  Square,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Kbd } from '#/components/ui/kbd'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { Label } from '#/components/ui/label'
import { allArduinosCompiled, embedCode, embedUrl } from '#/lib/projects'
import type { EditorProject } from '#/editor/models'
import type { Simulator } from '#/simulator/model'

export const NAVBAR_H = 'h-11'

/** Logo mark (the reference's `DiodeLogo` is a custom glyph; we use a simple diode symbol). */
export function Logo({
  className = 'size-6 text-primary',
}: {
  className?: string
}) {
  return (
    <svg viewBox="0 0 61 61" className={className} aria-hidden>
      <circle
        cx="30.5"
        cy="30.5"
        r="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <path
        d="M14 30.5h10M24 19v23l16-11.5z M40 19v23M40 30.5h8"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Click-to-edit project name (Enter submits, max 40 chars). */
export const EditableName = observer(function EditableName({
  project,
}: {
  project: EditorProject
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(project.name)
  const submit = () => {
    setEditing(false)
    if (value !== project.name) {
      project.setName(value)
      project.pushSnapshotToHistory()
    }
  }
  if (!editing) {
    return (
      <button
        className="inline-block max-w-[28ch] cursor-text truncate rounded-sm px-2 -ml-2 text-left text-sm font-medium hover:bg-muted"
        onClick={() => {
          setValue(project.name)
          setEditing(true)
        }}
      >
        {project.name || 'Untitled'}
      </button>
    )
  }
  return (
    <textarea
      autoFocus
      className="-ml-2 w-[calc(100%+1rem)] resize-none rounded-sm border border-ring px-2 text-sm font-medium outline-none"
      rows={1}
      maxLength={40}
      placeholder="Untitled"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={submit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          submit()
        }
      }}
    />
  )
})

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="secondary"
          className="size-7"
          aria-label="Copy"
          onClick={() => {
            void navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? (
            <Check className="size-3" />
          ) : (
            <Clipboard className="size-3" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? 'Copied!' : 'Copy'}</TooltipContent>
    </Tooltip>
  )
}

const EmbedPopover = observer(function EmbedPopover({
  project,
}: {
  project: EditorProject | null
}) {
  const url = project ? embedUrl(project.id) : ''
  const code = project ? embedCode(project.id, project.name) : ''
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          disabled={!project}
          className="hidden md:inline-flex"
        >
          <Code2 className="size-3.5" />
          Embed
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-sm font-semibold">Embed URL</Label>
            <div className="flex items-center gap-1">
              <Input className="h-8 text-xs" value={url} readOnly />
              <CopyButton value={url} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-sm font-semibold">Embed Code</Label>
            <div className="flex items-center gap-1">
              <Input className="h-8 text-xs" value={code} readOnly />
              <CopyButton value={code} />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
})

const ProjectMenu = observer(function ProjectMenu({
  project,
  onDelete,
}: {
  project: EditorProject
  onDelete: () => Promise<void>
}) {
  const [confirm, setConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="-mr-1 size-6 text-muted-foreground"
            aria-label="Project menu"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem
            onSelect={() => project.undo()}
            className="flex justify-between gap-6"
          >
            Undo
            <span className="flex gap-1 text-sm">
              <Kbd>cmd</Kbd>
              <Kbd>z</Kbd>
            </span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => project.redo()}
            className="flex justify-between gap-6"
          >
            Redo
            <span className="flex gap-1 text-sm">
              <Kbd>cmd</Kbd>
              <Kbd>shift</Kbd>
              <Kbd>z</Kbd>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirm(true)}>
            Delete Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-5">
            <h5 className="text-sm font-semibold">
              Are you sure you want to delete this project?
            </h5>
            <Button
              size="sm"
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true)
                try {
                  await onDelete()
                } catch {
                  toast.error('Unable to delete project.', { duration: 5000 })
                  setDeleting(false)
                }
              }}
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
})

interface NavbarProps {
  project: EditorProject | null
  simulator: Simulator | null
  onStartSimulation: () => void
  onStopSimulation: () => void
  onFork: () => Promise<void>
  onDelete: () => Promise<void>
}

export const EditorNavbar = observer(function EditorNavbar({
  project,
  simulator,
  onStartSimulation,
  onStopSimulation,
  onFork,
  onDelete,
}: NavbarProps) {
  const navigate = useNavigate()
  void navigate
  const simulate = () => {
    if (!project) return
    if (allArduinosCompiled(project.toJSON().circuit.parts)) onStartSimulation()
    else
      toast.error(
        'Unable to run simulation: Code compilation errors detected',
        { duration: 3000 },
      )
  }
  return (
    <nav
      className={`relative flex ${NAVBAR_H} w-full shrink-0 items-center border-b border-border bg-card px-3`}
    >
      <div className="contents">
        <Link to="/" className="flex items-center gap-2">
          <Logo />
          <span className="text-sm font-semibold tracking-tight">bulbus</span>
        </Link>
        <div className="hidden gap-4 px-6 md:flex">
          <Link
            to="/explore"
            className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
          >
            Explore
          </Link>
        </div>
        <div className="flex-1" />
        <div className="flex gap-1.5">
          <EmbedPopover project={project} />
          <Button
            size="sm"
            variant="outline"
            disabled={!project}
            className="hidden md:inline-flex"
            onClick={() => void onFork()}
          >
            <GitFork className="size-3.5" />
            Fork
          </Button>
          {simulator ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={onStopSimulation}
              disabled={!project}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : (
            <Button size="sm" disabled={!project} onClick={simulate}>
              <Play className="size-3.5" />
              Simulate
            </Button>
          )}
        </div>
        <div className="absolute left-1/2 -translate-x-1/2">
          {project && (
            <div className="flex items-center gap-1">
              <EditableName project={project} />
              <ProjectMenu project={project} onDelete={onDelete} />
            </div>
          )}
        </div>
      </div>
    </nav>
  )
})
