import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { ProjectGrid, SectionLabel, SiteHeader } from '../index'
import { useProjectList } from '#/lib/collections'
import { Button } from '#/components/ui/button'

// The grid reads Electric-backed collections, which need `window`.
export const Route = createFileRoute('/projects/')({
  component: Projects,
  ssr: false,
  head: () => ({ meta: [{ title: 'Projects · bulbus' }] }),
})

/** Every project (the curated ones live on the landing page). */
function Projects() {
  const projects = useProjectList()
  const navigate = useNavigate()
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-2.75rem)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <SectionLabel>Workspace</SectionLabel>
              <h1 className="text-2xl font-semibold tracking-tight">
                All projects
              </h1>
            </div>
            <Button
              onClick={() =>
                void navigate({
                  to: '/projects/$id',
                  params: { id: crypto.randomUUID() },
                  search: { template: 'blank' },
                })
              }
            >
              <Plus className="size-4" />
              New project
            </Button>
          </div>
          <ProjectGrid projects={projects} />
        </div>
      </main>
    </>
  )
}
