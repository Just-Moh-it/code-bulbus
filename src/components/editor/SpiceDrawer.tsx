import { observer } from 'mobx-react-lite'
import CodeMirror from '@uiw/react-codemirror'
import { Sheet, SheetContent, SheetTitle } from '#/components/ui/sheet'
import type { EightPinChipPart } from '#/editor/models'

const DRAWER_BG = '#161B26'

/** Drawer for the custom chip's `.subckt` body. */
export const SpiceDrawer = observer(function SpiceDrawer({
  part,
  open,
  onClose,
}: {
  part: EightPinChipPart
  open: boolean
  onClose: () => void
}) {
  const name = part.chipName.replace(/\s+/g, '').toUpperCase()
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="left"
        className="w-[min(56rem,95vw)] gap-0 p-0.5 sm:max-w-none"
        style={{ background: DRAWER_BG }}
      >
        <SheetTitle className="sr-only">Spice Code</SheetTitle>
        <div
          className="flex h-full flex-col text-base"
          style={{ background: DRAWER_BG }}
        >
          <div className="flex border-b-2 border-primary">
            <span className="rounded-t-sm px-2 py-1 text-sm text-blue-300">
              subckt.lib
            </span>
          </div>
          <p className="my-1 mb-3 pl-4 text-sm text-gray-100">
            Customize the netlist for this chip (Code must be compatabile with{' '}
            <a
              href="https://ngspice.sourceforge.io/docs/ngspice-36-manual.pdf"
              target="_blank"
              rel="noreferrer"
              className="font-bold underline"
            >
              ngspice-36
            </a>
            ).
          </p>
          <p className="pl-3 font-mono text-sm text-gray-500">
            .subckt {name} 1 2 3 4 5 6 7 8
          </p>
          <CodeMirror
            value={part.subcktCode}
            onChange={(v) => part.setSubcktCode(v)}
            height="100%"
            width="100%"
            theme="dark"
            style={{
              maxHeight: '50%',
              overflow: 'auto',
              paddingLeft: 0,
              margin: 0,
            }}
            basicSetup={{ lineNumbers: false }}
          />
          <p className="pl-3 font-mono text-sm text-gray-500">.ends</p>
        </div>
      </SheetContent>
    </Sheet>
  )
})
