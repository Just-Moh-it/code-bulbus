/** Seed the public showcase projects and delete every other project.  `bun scripts/seed-public.ts` */
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { showcaseProjects } from '../src/lib/showcase'

const c = new ConvexHttpClient(process.env.VITE_CONVEX_URL!)
const all = showcaseProjects()
const keep = new Set(all.map((s) => s.project.id))
for (const p of await c.query(api.projects.list, {})) {
  if (!keep.has(p.id)) {
    await c.mutation(api.projects.remove, { id: p.id })
    console.log('removed', p.name)
  }
}
for (const { project: j } of all) {
  await c.mutation(api.projects.remove, { id: j.id })
  await c.mutation(api.projects.create, {
    id: j.id,
    name: j.name,
    camera: j.camera,
    parts: j.circuit.parts,
    wires: j.circuit.wires,
  })
  await c.mutation(api.projects.setPublic, { id: j.id, isPublic: true })
  console.log('seeded', j.name, j.circuit.parts.length, 'parts')
}
