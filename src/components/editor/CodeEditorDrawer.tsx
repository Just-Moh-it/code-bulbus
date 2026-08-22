import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import CodeMirror from '@uiw/react-codemirror'
import { cpp } from '@codemirror/lang-cpp'
import { StreamLanguage } from '@codemirror/language'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { FilePlus, Hammer, X } from 'lucide-react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetTitle } from '#/components/ui/sheet'
import { Button } from '#/components/ui/button'
import { CompileStatusIcon } from './Properties'
import {
  VALID_EXTENSIONS,
  compileArduino,
  isValidExtension,
} from '#/lib/compile-client'
import type { ArduinoUnoPart, SketchFiles } from '#/editor/models'

const DRAWER_BG = '#292C34'
const shellLang = StreamLanguage.define(shell)
const clone = (f: SketchFiles) => JSON.parse(JSON.stringify(f)) as SketchFiles

/** Tabbed CodeMirror editor for the Arduino sketch files + compile output pane. */
const CodeEditor = observer(function CodeEditor({
  part,
  onClose,
}: {
  part: ArduinoUnoPart
  onClose: () => void
}) {
  const [tabIndex, setTabIndex] = useState(0)
  const [renaming, setRenaming] = useState<string | null>(null)
  const files = Object.entries(part.files).sort(
    (a, b) => a[1].order - b[1].order,
  )
  const active = files[Math.min(tabIndex, files.length - 1)]

  const addFile = () => {
    const f = clone(part.files)
    let n = 1
    while (`untitled-${n}.ino` in f) n++
    f[`untitled-${n}.ino`] = {
      fileExtension: '.ino',
      content: '',
      order: Object.keys(f).length,
    }
    part.setFiles(f)
    part.setCompilationStatus('not-compiled')
  }
  const deleteFile = (name: string) => {
    const f = clone(part.files)
    const i = f[name].order
    setTabIndex(i > 0 ? i - 1 : 1)
    for (const k in f) if (f[k].order > i) f[k].order -= 1
    delete f[name]
    part.setFiles(f)
    part.setCompilationStatus('not-compiled')
  }
  const rename = (oldName: string, newName: string) => {
    setRenaming(null)
    const f = clone(part.files)
    if (newName === '' || newName === oldName || newName in f) {
      part.setFiles(f)
      return
    }
    const ext = newName.substring(newName.lastIndexOf('.'))
    if (!isValidExtension(ext)) {
      toast.error(
        `Invalid file extension. Valid extensions are: ${Object.values(VALID_EXTENSIONS).join(' ')}`,
        { duration: 3000 },
      )
      part.setFiles(f)
      return
    }
    f[oldName].fileExtension = ext
    f[newName] = f[oldName]
    delete f[oldName]
    part.setFiles(f)
    part.setCompilationStatus('not-compiled')
  }
  const edit = (name: string, content: string) => {
    part.setCompilationStatus('not-compiled')
    const f = clone(part.files)
    f[name].content = content
    part.setFiles(f)
  }

  return (
    <div
      className="flex h-full flex-col text-base"
      style={{ background: DRAWER_BG }}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <div className="flex overflow-x-auto overflow-y-hidden">
          {files.map(([name], idx) => {
            const isActive = idx === tabIndex
            return (
              <div
                key={name}
                className={`flex items-center rounded-t-lg px-2 py-1.5 text-sm ${isActive ? 'text-teal-300' : 'text-gray-500'} hover:text-teal-200`}
                style={{ background: DRAWER_BG }}
                onClick={() => setTabIndex(idx)}
              >
                {renaming === name ? (
                  <input
                    autoFocus
                    className="min-w-[10rem] bg-transparent px-2 text-white outline-none"
                    defaultValue={name}
                    maxLength={40}
                    onBlur={(e) => rename(name, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter')
                        (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setRenaming(null)
                    }}
                  />
                ) : (
                  <span
                    className={`min-w-[3rem] whitespace-nowrap px-2 ${isActive && idx !== 0 ? 'cursor-text' : 'cursor-pointer'}`}
                    onDoubleClick={() => idx !== 0 && setRenaming(name)}
                  >
                    {name}
                  </span>
                )}
                <button
                  className={`ml-1 px-1 ${isActive && idx !== 0 ? 'visible' : 'invisible'} hover:text-red-300`}
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteFile(name)
                  }}
                >
                  x
                </button>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-300 hover:bg-[#2C313D] hover:text-teal-200"
            onClick={addFile}
            aria-label="Add file"
          >
            <FilePlus className="size-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-gray-300 hover:bg-[#2C313D] hover:text-teal-200"
            disabled={part.compilationStatus === 'compiling'}
            onClick={() => void compileArduino(part)}
          >
            <Hammer className="size-4" />
            <span className="mx-2">
              {part.compilationStatus === 'compiling'
                ? 'Compiling…'
                : 'Compile'}
            </span>
            <CompileStatusIcon part={part} variant="editor" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="mr-2 px-2 text-gray-300 hover:bg-[#2C313D] hover:text-teal-200"
            onClick={() => void compileArduino(part).then(onClose)}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
      {active && (
        <div className="flex min-h-0 flex-1 flex-col">
          <CodeMirror
            value={active[1].content}
            height="100%"
            width="100%"
            theme="dark"
            style={{ height: '70%', border: 'none' }}
            extensions={[cpp()]}
            onChange={(v) => edit(active[0], v)}
          />
          {part.compilationStatus !== 'compiling' && (
            <CodeMirror
              value={part.compilationOutput}
              height="100%"
              width="100%"
              theme="dark"
              style={{ height: '30%' }}
              basicSetup={{ lineNumbers: false }}
              extensions={[shellLang]}
              editable={false}
            />
          )}
        </div>
      )}
    </div>
  )
})

export function CodeEditorDrawer({
  part,
  open,
  onClose,
}: {
  part: ArduinoUnoPart
  open: boolean
  onClose: () => void
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="left"
        className="w-[min(56rem,95vw)] gap-0 p-0.5 sm:max-w-none"
        style={{ background: DRAWER_BG }}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <SheetTitle className="sr-only">Code Editor</SheetTitle>
        {open && <CodeEditor part={part} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  )
}
