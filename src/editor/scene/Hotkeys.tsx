import { useHotkeys } from 'react-hotkeys-hook'
import { observer } from 'mobx-react-lite'
import { useProject } from './context'

export const HOTKEYS = {
  UNDO: 'meta+z, ctrl+z',
  REDO: 'meta+shift+z, ctrl+y',
  DELETE: 'backspace, delete',
  ESCAPE: 'escape',
  ROTATE_CLOCKWISE: 'shift+right',
  ROTATE_ANTICLOCKWISE: 'shift+left',
  FIT_CAMERA: 'shift+1',
  LOOK_AT_ON_X_AXIS: 'shift+2',
  LOOK_AT_ON_Y_AXIS: 'shift+3',
  LOOK_AT_ON_Z_AXIS: 'shift+4',
} as const

/** Editor keyboard shortcuts (ignored while typing in inputs / the code editor). */
export const Hotkeys = observer(function Hotkeys() {
  const project = useProject()
  const push = () => project.pushSnapshotToHistory()
  const target = () => project.selection ?? project

  useHotkeys(HOTKEYS.UNDO, (e) => (e.preventDefault(), project.undo()), [
    project,
  ])
  useHotkeys(HOTKEYS.REDO, (e) => (e.preventDefault(), project.redo()), [
    project,
  ])
  useHotkeys(
    HOTKEYS.DELETE,
    () => {
      const s = project.selection
      if (!s) return
      s.delete()
      project.setSelection(null)
      push()
    },
    [project],
  )
  useHotkeys(
    HOTKEYS.ESCAPE,
    () => {
      project.setSelection(null)
      project.setStampType(null)
    },
    [project],
  )
  useHotkeys(
    HOTKEYS.ROTATE_CLOCKWISE,
    () => project.selection && (project.selection.rotate(-Math.PI / 2), push()),
    [project],
  )
  useHotkeys(
    HOTKEYS.ROTATE_ANTICLOCKWISE,
    () => project.selection && (project.selection.rotate(Math.PI / 2), push()),
    [project],
  )
  useHotkeys(HOTKEYS.FIT_CAMERA, () => target().fitCamera(), [project])
  useHotkeys(HOTKEYS.LOOK_AT_ON_X_AXIS, () => target().lookAtOnAxis('x'), [
    project,
  ])
  useHotkeys(HOTKEYS.LOOK_AT_ON_Y_AXIS, () => target().lookAtOnAxis('y'), [
    project,
  ])
  useHotkeys(HOTKEYS.LOOK_AT_ON_Z_AXIS, () => target().lookAtOnAxis('z'), [
    project,
  ])
  return null
})
