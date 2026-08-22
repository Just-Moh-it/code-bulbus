import { observer } from 'mobx-react-lite'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Kbd } from '#/components/ui/kbd'
import type { EditorProject } from '#/editor/models'

/** Right-click menu for a part, anchored at the pointer position. */
export const PartContextMenu = observer(function PartContextMenu({
  project,
}: {
  project: EditorProject
}) {
  const cm = project.circuit.contextMenu
  if (!cm) return null
  const { x, y, part } = cm
  const close = () => project.circuit.setContextMenu(null)
  const push = () => project.pushSnapshotToHistory()
  const item = (label: string, keys: string[], onSelect: () => void) => (
    <DropdownMenuItem
      onSelect={() => {
        onSelect()
        close()
      }}
      className="flex w-full justify-between gap-6"
    >
      <span>{label}</span>
      <span className="flex gap-1 text-sm">
        {keys.map((k) => (
          <Kbd key={k}>{k}</Kbd>
        ))}
      </span>
    </DropdownMenuItem>
  )
  return (
    <DropdownMenu open onOpenChange={(o) => !o && close()}>
      <DropdownMenuTrigger asChild>
        <span
          style={{
            position: 'fixed',
            top: y,
            left: x,
            width: 0,
            height: 0,
            visibility: 'hidden',
            pointerEvents: 'none',
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {item('Fit Camera', ['shift', '1'], () => part.fitCamera())}
        {item('Rotate Clockwise', ['shift', '→'], () => {
          part.rotate(-Math.PI / 2)
          push()
        })}
        {item('Rotate Anticlockwise', ['shift', '←'], () => {
          part.rotate(Math.PI / 2)
          push()
        })}
        {item('Delete', ['Del'], () => {
          part.delete()
          if (project.selection === part) project.setSelection(null)
          push()
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})
