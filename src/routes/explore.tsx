import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { ProjectGrid, SiteHeader } from './index'

export const Route = createFileRoute('/explore')({ component: Explore })

function Explore() {
  const projects = useQuery(api.projects.list, {})
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)]">
        <div className="mx-auto max-w-7xl p-8 md:p-12 lg:p-24">
          <div className="flex flex-col gap-6">
            <h2 className="text-lg font-semibold">Browse Community Projects</h2>
            <ProjectGrid projects={projects} />
          </div>
        </div>
      </main>
    </>
  )
}
