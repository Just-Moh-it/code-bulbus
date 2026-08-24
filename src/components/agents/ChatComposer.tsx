import {
  ArrowUpIcon,
  CircleStopIcon,
  FileIcon,
  PaperclipIcon,
  XIcon,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '#/components/ui/attachment'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '#/components/ui/input-group'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { cn } from '#/lib/utils.ts'

export interface ComposerAttachment {
  id: string
  file: File
  preview: string
  mediaType: string
}

export interface ComposerSubmit {
  text: string
  attachments: ComposerAttachment[]
}

const ACCEPT =
  'image/*,application/pdf,text/plain,text/csv,text/markdown,.ino,.cpp,.h'

function createAttachment(file: File): ComposerAttachment {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file,
    preview: URL.createObjectURL(file),
    mediaType: file.type || 'application/octet-stream',
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileMeta(file: File) {
  const ext =
    file.name.split('.').pop()?.toUpperCase() ||
    file.type.split('/')[1]?.toUpperCase() ||
    'FILE'
  return `${ext} · ${formatBytes(file.size)}`
}

function resizeTextarea(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

/** ChatGPT-style composer: growing textarea, paste/drop/pick attachments, Enter sends. */
export function ChatComposer({
  placeholder = 'Ask bulbus…',
  disabled = false,
  isBusy = false,
  onSubmit,
  onStop,
  className,
  autoFocus = false,
}: {
  placeholder?: string
  disabled?: boolean
  isBusy?: boolean
  onSubmit: (payload: ComposerSubmit) => void | Promise<void>
  /** Interrupt the run in progress; shown in place of Send while busy. */
  onStop?: () => void
  className?: string
  autoFocus?: boolean
}) {
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  useEffect(() => {
    return () =>
      attachmentsRef.current.forEach((a) => URL.revokeObjectURL(a.preview))
  }, [])

  const addFiles = useCallback((files: FileList | File[]) => {
    const next = Array.from(files)
    if (next.length === 0) return
    setAttachments((prev) => [...prev, ...next.map(createAttachment)])
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target) URL.revokeObjectURL(target.preview)
      return prev.filter((a) => a.id !== id)
    })
  }, [])

  const send = async () => {
    const text = input.trim()
    if ((!text && attachments.length === 0) || disabled || isBusy) return
    const payload = { text, attachments }
    setInput('')
    setAttachments([])
    await onSubmit(payload)
    resizeTextarea(textareaRef.current)
  }

  const canSend =
    (input.trim().length > 0 || attachments.length > 0) && !disabled && !isBusy

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void send()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled && e.dataTransfer.types.includes('Files'))
          setIsDragging(true)
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        if (!disabled && e.dataTransfer.files.length > 0)
          addFiles(e.dataTransfer.files)
      }}
      className={cn('relative w-full', className)}
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT}
        aria-label="Upload attachments"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-primary bg-background/80 text-sm text-primary backdrop-blur-sm">
          Drop files to attach
        </div>
      )}

      {attachments.length > 0 && (
        <AttachmentGroup className="mb-2 w-full px-0.5">
          {attachments.map((att) => {
            const isImage = att.mediaType.startsWith('image/')
            return (
              <Attachment
                key={att.id}
                size="sm"
                orientation={isImage ? 'vertical' : 'horizontal'}
                state="done"
              >
                {isImage ? (
                  <AttachmentMedia variant="image">
                    <img src={att.preview} alt={att.file.name} />
                  </AttachmentMedia>
                ) : (
                  <AttachmentMedia>
                    <FileIcon />
                  </AttachmentMedia>
                )}
                <AttachmentContent>
                  <AttachmentTitle>{att.file.name}</AttachmentTitle>
                  <AttachmentDescription>
                    {fileMeta(att.file)}
                  </AttachmentDescription>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    type="button"
                    aria-label={`Remove ${att.file.name}`}
                    onClick={() => removeAttachment(att.id)}
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            )
          })}
        </AttachmentGroup>
      )}

      <InputGroup className="rounded-md bg-card/60">
        <InputGroupTextarea
          ref={textareaRef}
          aria-label="Message bulbus"
          value={input}
          autoFocus={autoFocus}
          onChange={(e) => setInput(e.target.value)}
          onPaste={(e) => {
            if (disabled) return
            const files = Array.from(e.clipboardData.items)
              .filter((item) => item.kind === 'file')
              .map((item) => item.getAsFile())
              .filter((f): f is File => Boolean(f))
            if (files.length > 0) {
              e.preventDefault()
              addFiles(files)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          onInput={(e) => resizeTextarea(e.currentTarget)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="max-h-40 min-h-10 px-3"
        />
        <InputGroupAddon align="block-end" className="pt-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <InputGroupButton
                type="button"
                className="text-muted-foreground"
                aria-label="Attach files"
                disabled={disabled}
                onClick={() => fileInputRef.current?.click()}
              >
                <PaperclipIcon />
              </InputGroupButton>
            </TooltipTrigger>
            <TooltipContent>Attach</TooltipContent>
          </Tooltip>
          {isBusy && onStop ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton
                  type="button"
                  variant="outline"
                  className="ml-auto"
                  aria-label="Stop"
                  onClick={onStop}
                >
                  <CircleStopIcon />
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>Stop</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <InputGroupButton
                  type="submit"
                  variant="default"
                  aria-disabled={!canSend}
                  tabIndex={canSend ? 0 : -1}
                  className={cn(
                    'ml-auto',
                    !canSend && 'pointer-events-none opacity-50',
                  )}
                  aria-label="Send"
                >
                  <ArrowUpIcon />
                </InputGroupButton>
              </TooltipTrigger>
              <TooltipContent>Send</TooltipContent>
            </Tooltip>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
