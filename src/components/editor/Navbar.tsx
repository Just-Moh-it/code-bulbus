import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { Link } from '@tanstack/react-router'
import { MoreHorizontal, Play, Square } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '#/components/ui/button'
import { Kbd } from '#/components/ui/kbd'
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
import { UserMenu } from '#/components/auth/UserMenu'
import { allArduinosCompiled } from '#/lib/projects'
import type { EditorProject } from '#/editor/models'
import type { Simulator } from '#/simulator/model'

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

const ProjectMenu = observer(function ProjectMenu({
  project,
  onDelete,
  onDuplicate,
}: {
  project: EditorProject
  onDelete: () => Promise<void>
  onDuplicate: () => Promise<void>
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
          <DropdownMenuItem onSelect={() => void onDuplicate()}>
            Duplicate Project
          </DropdownMenuItem>
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

/** Floating top-left island: logo, project name, project menu. */
export const EditorTopBar = observer(function EditorTopBar({
  project,
  onDelete,
  onDuplicate,
}: {
  project: EditorProject | null
  onDelete: () => Promise<void>
  onDuplicate: () => Promise<void>
}) {
  return (
    <div className="pointer-events-auto flex h-10 items-center gap-2 rounded-md border border-border bg-card px-2 shadow-sm">
      <Link to="/" className="flex items-center px-1" aria-label="Home">
        <Logo />
      </Link>
      {project && (
        <>
          <span className="h-5 w-px bg-border" />
          <div className="flex items-center gap-1 pl-1">
            <EditableName project={project} />
            <ProjectMenu
              project={project}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
            />
          </div>
        </>
      )}
      <span className="h-5 w-px bg-border" />
      <UserMenu />
    </div>
  )
})

/** Simulate / Stop control, hosted by the right-hand panel header. */
export const SimulateButton = observer(function SimulateButton({
  project,
  simulator,
  onStartSimulation,
  onStopSimulation,
}: {
  project: EditorProject | null
  simulator: Simulator | null
  onStartSimulation: () => void
  onStopSimulation: () => void
}) {
  const simulate = () => {
    if (!project) return
    if (allArduinosCompiled(project.toJSON().circuit.parts)) onStartSimulation()
    else
      toast.error(
        'Unable to run simulation: Code compilation errors detected',
        { duration: 3000 },
      )
  }
  return simulator ? (
    <Button size="sm" variant="destructive" onClick={onStopSimulation}>
      <Square className="size-3.5" />
      Stop
    </Button>
  ) : (
    <Button size="sm" disabled={!project} onClick={simulate}>
      <Play className="size-3.5" />
      Simulate
    </Button>
  )
})
