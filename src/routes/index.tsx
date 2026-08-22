import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { Plus } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { Logo } from '#/components/editor/Navbar'

export const Route = createFileRoute('/')({ component: Home })

export function SiteHeader() {
  return (
    <nav className="flex h-16 w-full shrink-0 items-center border-b border-border bg-white/70 px-3 backdrop-blur-md md:px-6">
      <div className="contents">
        <Link to="/" className="flex items-center gap-3">
          <Logo />
          <span className="font-mono text-lg font-bold">bulbus</span>
        </Link>
        <div className="mt-[2.5px] flex px-8">
          <Link to="/explore" className="text-base font-bold hover:underline">
            Explore
          </Link>
        </div>
      </div>
    </nav>
  )
}

export function ProjectCard({
  id,
  name,
  preview,
}: {
  id: string
  name: string
  preview?: string | null
}) {
  return (
    <Link to="/projects/$id" params={{ id }} className="flex flex-col gap-2">
      <div className="aspect-[16/12] overflow-hidden rounded-xl border border-border bg-white">
        {preview && (
          <img src={preview} alt={name} className="size-full object-cover" />
        )}
      </div>
      <span>{name}</span>
    </Link>
  )
}

export function ProjectGrid({
  projects,
}: {
  projects: { id: string; name: string }[] | undefined
}) {
  if (!projects)
    return (
      <div className="min-h-40 text-sm text-muted-foreground">Loading…</div>
    )
  if (projects.length === 0)
    return <p className="text-sm">No projects to show.</p>
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((p) => (
        <ProjectCard key={p.id} id={p.id} name={p.name} />
      ))}
    </div>
  )
}

function Home() {
  const projects = useQuery(api.projects.list, {})
  const navigate = useNavigate()
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)]">
        <div className="mx-auto max-w-7xl p-8 md:p-12 lg:p-24">
          <div className="flex flex-col gap-12">
            <section className="hidden flex-col gap-6 md:flex">
              <h2 className="text-lg font-semibold">Create a Project</h2>
              <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
                <button
                  type="button"
                  className="aspect-[16/12] text-left"
                  onClick={() =>
                    void navigate({
                      to: '/projects/$id',
                      params: { id: crypto.randomUUID() },
                      search: { template: 'blank' },
                    })
                  }
                >
                  <div className="flex size-full items-center justify-center rounded-xl border border-border bg-white">
                    <div className="flex flex-col items-center gap-2">
                      <span>New Project</span>
                      <Plus className="size-4" />
                    </div>
                  </div>
                </button>
              </div>
            </section>
            <section className="flex flex-col gap-6">
              <h2 className="text-lg font-semibold">My Projects</h2>
              <ProjectGrid projects={projects} />
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
