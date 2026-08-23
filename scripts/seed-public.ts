/** (Re)create the public showcase projects; other projects are left alone.  `bun scripts/seed-public.ts` */
import { ConvexHttpClient } from 'convex/browser'
import { api } from '../convex/_generated/api'
import { showcaseProjects } from '../src/lib/showcase'

const c = new ConvexHttpClient(process.env.VITE_CONVEX_URL!)
const all = showcaseProjects()
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
