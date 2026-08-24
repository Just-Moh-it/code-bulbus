import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Plus, Thermometer } from 'lucide-react'
import { useProjectList } from '#/lib/collections'
import { Logo } from '#/components/editor/Navbar'
import { UserMenu } from '#/components/auth/UserMenu'
import { Button } from '#/components/ui/button'

// The grids read Electric-backed collections, which need `window`.
export const Route = createFileRoute('/')({
  component: Home,
  ssr: false,
  head: () => ({
    meta: [{ title: 'bulbus — Build and simulate real circuits' }],
  }),
})

export function SiteHeader() {
  return (
    <div className="sticky top-0 z-10 px-4 pt-4 pb-2">
      <nav className="glass mx-auto flex h-14 w-full max-w-5xl items-center gap-1 rounded-full border pr-2 pl-5">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="size-6" />
          <span className="text-[16px] font-semibold tracking-tight">
            bulbus
          </span>
        </Link>
        <div className="ml-8 hidden items-center gap-6 sm:flex">
          <Link
            to="/projects"
            className="text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Projects
          </Link>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <UserMenu />
        </div>
      </nav>
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[12px] font-semibold tracking-wider text-muted-foreground uppercase">
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
        <span className="truncate text-[14px] font-medium">{name}</span>
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
      <div className="min-h-40 text-[14px] text-muted-foreground">Loading…</div>
    )
  if (projects.length === 0)
    return (
      <p className="rounded-sm border border-dashed border-border px-4 py-8 text-center text-[14px] text-muted-foreground">
        No projects yet.
      </p>
    )
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
      <main className="mx-auto w-full max-w-5xl px-4">
        <section className="flex flex-col items-center gap-7 py-24 text-center md:py-32">
          <p className="text-[12px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Breadboard · Arduino · SPICE
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-balance md:text-6xl">
            Build and simulate real circuits in the browser.
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Drop parts on a 3D breadboard, wire them up, write the sketch and
            run it — ngspice and an AVR emulator, live. Or just ask the agent to
            build it for you.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <Button size="lg" onClick={() => open('blank')}>
              <Plus className="size-4" />
              New project
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => open('thermostat')}
            >
              <Thermometer className="size-4" />
              Thermostat demo
            </Button>
          </div>
        </section>
        <section className="flex flex-col gap-5 pb-20">
          <div className="flex items-baseline justify-between">
            <SectionLabel>Curated projects</SectionLabel>
            <Link
              to="/projects"
              className="text-[14px] font-medium text-primary hover:underline"
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
