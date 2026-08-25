import {
  Link,
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
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

/** Top-bar tab: underlined while its route is the active one. */
function NavTab({ to, label }: { to: string; label: string }) {
  const active = useRouterState({
    select: (st) => st.location.pathname === to,
  })
  return (
    <Link
      to={to}
      className={`relative py-1 text-sm font-medium transition-colors ${
        active
          ? 'text-foreground after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-foreground'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      {label}
    </Link>
  )
}

export function SiteHeader() {
  return (
    <div className="sticky top-0 z-10 px-4 pt-4 pb-2">
      <nav className="glass mx-auto flex h-14 w-full max-w-5xl items-center gap-1 rounded-full border pr-2 pl-5">
        <Link to="/" className="flex items-center gap-2">
          <Logo className="size-6" />
          <span className="text-base font-semibold tracking-tight">bulbus</span>
        </Link>
        <div className="ml-8 flex items-center gap-6">
          <NavTab to="/" label="Explore" />
          <NavTab to="/my-projects" label="My projects" />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" asChild>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="text-muted-foreground"
            >
              <GitHubMark className="size-4" />
              GitHub
            </a>
          </Button>
          <span aria-hidden className="text-muted-foreground/60">
            ·
          </span>
          <UserMenu withName />
        </div>
      </nav>
    </div>
  )
}

const GITHUB_URL = 'https://github.com/just-moh-it/code-bulbus'

function GitHubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      fill="currentColor"
      aria-hidden
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
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
  clone = false,
}: {
  id: string
  name: string
  preview?: string | null
  /** Open a personal copy instead of the original (curated projects). */
  clone?: boolean
}) {
  return (
    <Link
      to="/projects/$id"
      params={{ id }}
      search={clone ? { clone: true } : {}}
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
  clone = false,
}: {
  projects:
    { id: string; name: string; previewUrl?: string | null }[] | undefined
  /** Cards open a personal copy (see ProjectCard). */
  clone?: boolean
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
          clone={clone}
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
            Breadboard · Arduino · Simulation
          </p>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-balance md:text-6xl">
            Build and simulate real circuits in the browser.
          </h1>
          <p className="max-w-xl text-lg text-pretty text-muted-foreground">
            Drop parts on a 3D breadboard, wire them up, write the sketch and
            watch it run — for real. Or just ask the agent to build it for you.
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
              to="/my-projects"
              className="text-[14px] font-medium text-primary hover:underline"
            >
              My projects
            </Link>
          </div>
          <ProjectGrid projects={projects} clone />
        </section>
      </main>
    </>
  )
}
