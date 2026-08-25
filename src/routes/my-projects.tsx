import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { ProjectGrid, SectionLabel, SiteHeader } from './index'
import { useProjectList } from '#/lib/collections'
import { useSession } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'

// The grid reads Electric-backed collections, which need `window`.
export const Route = createFileRoute('/my-projects')({
  component: MyProjects,
  ssr: false,
  head: () => ({ meta: [{ title: 'My projects · bulbus' }] }),
})

/** Only what this session owns; community work lives on Explore. */
function MyProjects() {
  const { data: session } = useSession()
  const projects = useProjectList({ userId: session?.user.id ?? null })
  const navigate = useNavigate()
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-2.75rem)]">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-10">
          <div className="flex items-end justify-between gap-4">
            <div className="flex flex-col gap-1">
              <SectionLabel>Workspace</SectionLabel>
              <h1 className="text-2xl font-semibold tracking-tight">
                My projects
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
