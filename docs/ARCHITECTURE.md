# bulbus architecture

bulbus is a 1:1 rebuild of withdiode.com — a browser-based 3D breadboard/Arduino
simulator. The reference bundle is in `../ref-pretty/` (prettified, minified
Next.js chunks) and is the source of truth for behaviour and numbers. When in
doubt, match the reference; deviations are listed at the bottom.

```
src/
  sim/          Simulation engine (framework-free). ngspice WASM + avr8js co-sim.
  editor/
    models/     Editor-side MobX models: project / circuit / part / wire / terminal.
    scene/      R3F editor scene: GLB models, drag, stamp, wires, hotkeys.
  simulator/    Read-only viewer used while a simulation runs.
  components/   UI (shadcn + tailwind): navbar, panels, property editors, drawers.
  routes/       TanStack Start routes. /projects/$id is the editor page.
  lib/          Small shared helpers (palette, default project, compile client).
  server/       Node-only code (arduino-cli compile).
convex/         projects table + functions (getById / list / upsert / remove).
scripts/        smoke.ts + parity.ts — headless checks of the engine.
public/         GLB models + palette thumbnails (recovered from the Wayback Machine).
```

## Two model trees, one JSON

There are deliberately two object trees that both serialise to the same
`ProjectJSON` (`src/sim/types.ts`):

| Layer | Classes | Concern |
|---|---|---|
| Editor (`src/editor/models`) | `EditorProject/Circuit/Part/Wire/Terminal` | placement, parenting, snapping, undo/redo, properties |
| Engine (`src/sim`) | `Circuit/Part/Wire/Terminal` | netlists, ngspice, avr8js, playback clock |

`Simulate` does `new Simulator(project.toJSON())` — the engine is rebuilt from
JSON every run and never shares objects with the editor. Keep it that way.

## Units and constants

- `mg = 0.254` (`src/sim/types.ts`) is the 0.1" breadboard pitch in scene units.
  Terminal positions, snap radius (`0.68·mg`), connection radius (`0.33·mg`),
  wire tube radius (`mg/5`) and lift (`2·mg`) are all multiples of it.
- Part `dimensions` (`src/sim/defs.ts`) are canonical world sizes; every GLB is
  scale-fitted to them by `ScaledGroup`. Terminal positions are authored in the
  same canonical units, so they line up with the fitted model.
- Netlist device ids: `v_` sources, `r_` resistors/wires, `d_` LEDs, `q_` BJTs,
  `C_` caps, `x_` subcircuits. `DataBus` looks currents up as `i(@id[i])`.

## Foundation rules (derive, don't sync)

- **The model is the single source of truth for transforms.** `EditorPart.worldTransform`
  composes position/rotation through the parent chain; wires, snapping and anything
  else that must agree with the model read *that*, never a three.js object. The scene
  graph only mirrors the model (immediately while dragging, spring-animated for
  programmatic moves), so it can never be "between" states that other views depend on.
- **three.js objects never live in models.** The engine (`src/sim`) has no scene
  fields. Views register objects in an observable registry (`Simulator.objects`,
  keyed by `objectKey(part)`), and visibility/camera logic derives from that map,
  so a late-mounting ref can never leave something permanently hidden.
- **Visibility comes from observable state only.** If a component decides
  `visible` at render time from a plain field that is set later, it will be
  wrong forever (that was the "wires vanish in simulation" bug).

## Invariants that have bitten us

1. **GLB node names.** three's GLTFLoader names a single-primitive mesh after its
   *node* (`pinheaderMetal_C_003_DMSH.001` → `pinheaderMetal_C_003_DMSH001`) but a
   multi-primitive mesh after its *mesh* (`Object_2.010` → `Object_2010`,
   `Object_2010_1`, …; `Mesh`, `Mesh_1`; `Circle003`, `Circle003_1`). Dots and
   spaces are stripped. Dump names with the python snippet in git history before
   guessing.
2. **Ref callbacks that write MobX observables must be stable** (`useCallback`
   keyed on the model). An inline `ref={(o) => part.setContainer(o)}` gets a new
   identity each render → React calls it with `null` then the node → the
   observable flips → the `observer` re-renders → infinite loop. Setters also
   no-op when the value is unchanged.
3. **Fit after load.** `ScaledGroup` measures its children; a model that hasn't
   resolved yet measures 0. Keep `<Suspense>` *outside* `ScaledGroup`, never
   inside it. `ScaledGroup` retries each frame until it sees geometry.
4. **Never pass a pass-less `EffectComposer`** — it requires children. The editor
   has no post-processing; only the simulator adds `Bloom`.
5. **The TanStack devtools Vite plugin is banned.** It injects
   `data-tsd-source` into every JSX element and R3F throws on unknown props,
   which the error boundary retries forever.
6. **The editor model is built once per id and then synced, never rebuilt**
   (`routes/projects/$id.tsx` + `editor/sync/useProjectSync.ts`). Convex holds
   one row per part / wire; every snapshot after the first is reconciled into
   the live MobX model, and every model change is diffed and flushed back
   (≈150 ms). Rebuilding on each snapshot would remount the scene on every
   keystroke — and on every agent edit.
7. **The editor route is `ssr: false`.** The scene needs WebGL and the models
   need `window`; SSR produced an empty `EditorProject(null)`.
8. **drei `Text` defaults `fontSize` to 1**; the reference ran on troika's 0.1.
   All 3D labels pass `fontSize={0.1}`.
9. **Bun drops the event loop while ngspice's promise is pending.** Headless
   scripts keep a `setInterval` alive (`scripts/*.ts`). Browsers are unaffected.

## Simulation loop (per 50 ms window)

```
beforeSimulate → toNetlist → onSimulate → ngspice(.tran 16.67ms 50ms … uic)
   → DataBus.append → clock.setRate → afterSimulate (avr8js runs 3×16.667 ms)
```

Arduino pins become `PWL` voltage sources from samples recorded during the
previous window; the MCU reads node voltages back via `syncSimulatorInputs`.
Pipeline latency from a button press to a pin reacting is ~4 windows by design.
`scripts/parity.ts` pins this behaviour; run subsets (`bun run parity 555 pwm`)
to stay under 30 s.

## Sync (Figma-style, `editor/sync/`)

The 3D layer is derived from `EditorProject` (MobX); the server is kept in
step by a small two-way sync rather than by save events:

```
Convex rows (parts, wires) ──useQuery──▶ circuit.loadJSON(snapshot, skip)      inbound
EditorProject ──reaction──▶ diff(lastSent, now) ──▶ circuit.apply (≈150 ms)   outbound
```

- **Granularity is the entity.** `circuit.apply` upserts/removes whole parts
  and wires; the last writer wins *per entity*, so a human and N agents editing
  different parts never conflict. Same-entity races are resolved LWW — good
  enough for always-online collaborators; the row-per-entity shape is what a
  CRDT would need later anyway.
- **`skip` protects local intent.** Inbound snapshots leave alone ids that are
  `project.held` (being dragged) or dirty (local change not yet confirmed).
  `lastSent` advances to the server's values for everything else, so our own
  echo and other writers' changes are never sent back.
- **Undo/redo is local.** It restores a snapshot into the model, which the
  outbound diff turns into ops like any other edit. It will undo remote edits
  too (snapshot history); per-author undo is a later change.
- **Camera is per viewer** — persisted as project metadata (`projects.update`,
  debounced) but never pushed into other clients' models.
- `diffCircuit`/`stable` (`sync/diff.ts`) are pure and shared with the agent
  tools; `reconcile.test.ts` pins the echo / held / add-remove / cascade cases.
- Projects created before rows existed carry a `projects.circuit` blob;
  `circuit.get` serves it with `legacy: true` and the first client to open it
  writes the rows. The blob is never written again.

## Agents (Electric Agents)

Each chat in the right-hand panel is one durable **Electric Agents** entity of
type `bulbus` (`agents/server.ts`), spawned with `{ projectId }` and tagged
`project=<id>`, so any number of agents can work on one project concurrently.

```
browser ──observe (read-only)──▶ coordinator :4437 ◀──webhook wake── agents/server.ts :4440
   │                                  ▲                                   │
   └──POST /api/agents/{spawn,send}───┘ (server routes; browsers cannot write)   └── tools → Convex
```

- `bun run agents:runtime` starts Postgres + Electric + the coordinator in Docker;
  `bun run agents:server` runs our entity server (needs `ANTHROPIC_API_KEY`).
- **The agent speaks parts and nets, never holes or coordinates**
  (`agents/tools.ts` + `agents/layout.ts`). `add_part(type)` is placed by a
  packer that mirrors the editor's snapping (every leg in a free hole, one part
  per strip, no footprint overlap, four rotations tried); `connect(a, b)` picks
  free holes on the two nets (computed with the simulator's own
  `Circuit.assignNodes()`, wires unioned) and routes the wire around part
  bodies; `get_project`/`simulate` report nets, floating pins and `problems`.
  Nothing the model says can disagree with the validation because there is no
  geometry for it to get wrong. Tests: `agents/layout.test.ts`.
- The reference grammar the tools *print* is the grammar they *accept*:
  `type:id.pin`, `type.id.pin`, `id.pin`, `type.pin`, plus per-type aliases
  (555 datasheet numbers, `+`/`-` on capacitors, `anode`/`cathode` on LEDs,
  switch sides `a`/`b`). Tools are bound to their project — no `projectId`
  parameter for the model to retype.
- After the model stops, a deterministic critic (`agents/server.ts`) checks the
  wake's activity: edited but never simulated, simulated before the last edit,
  or `problems` still non-empty → it is sent back to work (max 2 rounds).
- Tool calls are serialised per project (`withProjectLock`): the model emits
  several calls per step and the runtime runs them concurrently; each tool is
  load → edit → save, so unserialised calls would place parts on top of each
  other.
- Removing a part also removes jumpers that only served it
  (`danglingWires`), so its strips come back clean.
- Tools save `diff(baseline, edited)` through `circuit.apply`, the same
  entity-level ops the browser sends, so open editors update live.
- The membership stream's collections are runtime proxies (`toArray`), not
  TanStack `Collection`s — read them directly; `useChat(db)` handles the chat.

## Known deviations from the reference

- Placement snaps to terminals immediately (`Stamp.tsx`); the reference only
  snapped on the next drag.
- `DataBus.append` front-pads series that first appear mid-run so they stay
  index-aligned with `times` (the reference only padded disappearing series and
  read stale samples).
- No auth yet: every project is editable by everyone; `user_id` is `null`.
- Rating errors render as a grey marker sphere instead of drifting clouds.
- Compile goes to our own `/api/compile` (local `arduino-cli`), same contract as
  `compile-node.fly.dev`.

## Working on this repo

- `bun run dev` (port 3000) — or use the workspace `.claude/launch.json` (3005).
- `bunx tsc --noEmit && bun run lint` must be clean before committing.
- `bun run smoke` / `bun run parity <cases>` exercise the engine headlessly.
- Always `cd` with an absolute path in shell commands; the harness cwd resets.
