import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Plus, Thermometer } from 'lucide-react'
import { useProjectList } from '#/lib/collections'
import { Logo } from '#/components/editor/Navbar'
import { UserMenu } from '#/components/auth/UserMenu'
import { Button } from '#/components/ui/button'

// The grids read Electric-backed collections, which need `window`.
export const Route = createFileRoute('/')({ component: Home, ssr: false })

export function SiteHeader() {
  return (
    <nav className="sticky top-0 z-10 flex h-11 w-full shrink-0 items-center border-b border-border bg-card/90 px-3 backdrop-blur md:px-6">
      <Link to="/" className="flex items-center gap-2">
        <Logo />
        <span className="text-sm font-semibold tracking-tight">bulbus</span>
      </Link>
      <div className="flex px-6">
        <Link
          to="/projects"
          className="text-[13px] font-medium text-muted-foreground hover:text-foreground"
        >
          Projects
        </Link>
      </div>
      <UserMenu className="ml-auto" />
    </nav>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h2>
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
    <Link
      to="/projects/$id"
      params={{ id }}
      className="group flex flex-col overflow-hidden rounded-sm border border-border bg-card transition-colors hover:border-primary/60"
    >
      <div className="aspect-[16/10] overflow-hidden border-b border-border bg-muted">
        {preview && (
          <img
            src={preview}
            alt={name}
            loading="lazy"
            className="size-full object-cover"
          />
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <span className="truncate text-[13px] font-medium">{name}</span>
        <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </Link>
  )
}

export function ProjectGrid({
  projects,
}: {
  projects:
    { id: string; name: string; previewUrl?: string | null }[] | undefined
}) {
  if (!projects)
    return (
      <div className="min-h-40 text-[13px] text-muted-foreground">Loading…</div>
    )
  if (projects.length === 0)
    return (
      <p className="rounded-sm border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted-foreground">
        No projects yet.
      </p>
    )
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {projects.map((p) => (
        <ProjectCard
          key={p.id}
          id={p.id}
          name={p.name}
          preview={p.previewUrl}
        />
      ))}
    </div>
  )
}

/** Landing: the hero plus the curated (public showcase) projects, so visitors land on good circuits. */
function Home() {
  const projects = useProjectList({ isPublic: true })
  const navigate = useNavigate()
  const open = (template: 'blank' | 'thermostat') =>
    void navigate({
      to: '/projects/$id',
      params: { id: crypto.randomUUID() },
      search: { template },
    })
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-2.75rem)]">
        <section className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-16 md:py-24">
            <p className="text-[11px] font-semibold tracking-[0.2em] text-primary uppercase">
              Breadboard · Arduino · SPICE
            </p>
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
              Build and simulate real circuits in the browser.
            </h1>
            <p className="max-w-xl text-base text-muted-foreground">
              Drop parts on a 3D breadboard, wire them up, write the sketch and
              run it — ngspice and an AVR emulator, live. Or just ask the agent
              to build it for you.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => open('blank')}>
                <Plus className="size-4" />
                New project
              </Button>
              <Button variant="outline" onClick={() => open('thermostat')}>
                <Thermometer className="size-4" />
                Thermostat demo
              </Button>
            </div>
          </div>
        </section>
        <section className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Curated projects</SectionLabel>
            <Link
              to="/projects"
              className="text-[13px] font-medium text-primary hover:underline"
            >
              All projects
            </Link>
          </div>
          <ProjectGrid projects={projects} />
        </section>
      </main>
    </>
  )
}
