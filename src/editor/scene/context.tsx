import { createContext, useContext } from 'react'
import type { EditorProject } from '#/editor/models'

export const ProjectContext = createContext<EditorProject | null>(null)

export function useProject() {
  const p = useContext(ProjectContext)
  if (!p)
    throw new Error('useProject must be used inside the Project component')
  return p
}
