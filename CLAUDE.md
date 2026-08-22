# bulbus — working notes for agents

Read `docs/ARCHITECTURE.md` before touching `src/editor`, `src/simulator` or `src/sim`.
It lists the invariants that have already caused bugs (GLB naming, ref-callback
stability, fit-after-load, single-take project JSON, no devtools Vite plugin).

Reference implementation: `../ref-pretty/` (withdiode.com bundle). Match it unless
`docs/ARCHITECTURE.md` lists a deliberate deviation. Never read `../../2025-rebuild`.

Checks before committing:

```bash
bunx tsc --noEmit && bun run lint
```

Engine changes: `bun run smoke` and `bun run parity <case…>` (keep each run < 30 s).

Conventions:
- MobX models use `makeObservable` with explicit annotations; mutate only in actions.
- Components that read MobX state are wrapped in `observer`.
- Scene refs that write to models are `useCallback`-stable; setters no-op on same value.
- Numbers that come from the reference are named constants or cite the reference in a comment.
- No `as unknown as` casts without a comment explaining why the type is wrong.
