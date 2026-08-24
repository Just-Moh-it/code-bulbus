/** (Re)create the public showcase projects; other projects are left alone.  `bun scripts/seed-public.ts` */
import { createProject, removeProject, setProjectPublic } from '../server/db'
import { showcaseProjects } from '../src/lib/showcase'

const all = showcaseProjects()
for (const { project: j } of all) {
  await removeProject(j.id)
  await createProject({
    id: j.id,
    name: j.name,
    camera: j.camera ?? null,
    parts: j.circuit.parts,
    wires: j.circuit.wires,
  })
  await setProjectPublic(j.id, true)
  console.log('seeded', j.name, j.circuit.parts.length, 'parts')
}
process.exit(0)
