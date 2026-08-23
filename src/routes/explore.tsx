import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { ProjectGrid, SectionLabel, SiteHeader } from './index'

export const Route = createFileRoute('/explore')({ component: Explore })

function Explore() {
  const projects = useQuery(api.projects.list, { isPublic: true })
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-2.75rem)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10">
          <div className="flex flex-col gap-1">
            <SectionLabel>Community</SectionLabel>
            <h1 className="text-2xl font-semibold tracking-tight">
              Browse projects
            </h1>
          </div>
          <ProjectGrid projects={projects} />
        </div>
      </main>
    </>
  )
}
