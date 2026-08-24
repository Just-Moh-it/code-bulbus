# Deploying bulbus to Cloudflare

## Workers, not Pages

The intent was "Cloudflare Pages for the app, Workers for the server actions".
That split no longer exists. Since 2025 Cloudflare's own guidance is that
**Workers with static assets is the successor to Pages for full-stack apps**, and
TanStack Start's only supported Cloudflare target is Workers. There is no Pages
project here: **one Worker** serves the static client build from Cloudflare's
asset storage _and_ runs SSR, server functions and every `/api/**` route in the
same deployment. Static hits never bill Worker time.

That is what this repo is configured for:

| File             | Role                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| `wrangler.jsonc` | Worker name, compat flags, assets routing, bindings, vars               |
| `vite.config.ts` | `CF_BUILD=1` swaps the nitro server build for `@cloudflare/vite-plugin` |
| `package.json`   | `build:cf`, `preview:cf`, `deploy`, `cf:typegen`                        |

The default path is untouched: `bun run dev`, `bun run build` and
`deploy/deploy.sh` still use nitro and still produce `.output/server/index.mjs`
for the EC2 box. The two server builds are mutually exclusive — both plugins own
the `ssr` Vite environment — so the Cloudflare plugin is only constructed when
`CF_BUILD` is set.

## The split: Worker vs VM

Not all of bulbus can run on Workers. Two pieces need a real machine, so the
EC2 box stays, shrunk to just those:

```
bulbus.mohitya.dev            -> Cloudflare Worker  (SSR, /api/agents/*, auth, static assets)
vm.bulbus.mohitya.dev         -> EC2 box behind Caddy
    /agents/*                 -> Electric Agents coordinator :4437 (docker: postgres + electric + coordinator)
    /api/compile              -> arduino-cli
    (agents/server.ts :4440)  -> webhook the coordinator wakes
Postgres (Neon/RDS/…)         -> reached from the Worker through Hyperdrive
Electric (read sync)          -> Electric Cloud, or the VM; NOT hostable on Workers
```

### What cannot run on Workers

| Code                                                  | Why                                                                                                                                                                                                                                                              | What to do                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `src/server/compile.ts` (`src/routes/api/compile.ts`) | `node:child_process` `execFile` of `arduino-cli`, plus `mkdtemp`/`writeFile` in `node:os` `tmpdir()`. On Workers `node:child_process` is a **non-functional stub** — it imports and bundles fine, then throws at runtime. `node:os` is only partially supported. | Keep `arduino-cli` on the VM; proxy or exclude the route (below).                                         |
| `agents/server.ts`                                    | `node:http` server, long-lived process, `@mariozechner/pi-ai` model loop                                                                                                                                                                                         | Stays on the VM as the `bulbus-agents` systemd unit. Not part of the Worker build (it is outside `src/`). |
| Electric sync service                                 | Postgres logical replication + a long-lived connection                                                                                                                                                                                                           | Electric Cloud, or the docker stack on the VM. Cloudflare cannot host it.                                 |
| `electric-ax agents start` (docker)                   | docker                                                                                                                                                                                                                                                           | VM.                                                                                                       |
| `scripts/previews.ts` (playwright)                    | headless Chromium                                                                                                                                                                                                                                                | VM (`bulbus-previews`).                                                                                   |

Routes that **do** work on the Worker: `src/routes/api/agents/{spawn,send,stop,delete,attachment}.ts`.
They are thin HTTP clients over `ELECTRIC_AGENTS_URL`. `@electric-ax/agents-runtime`
pulls in `node:crypto`, `node:fs`, `node:fs/promises` and `node:path`, all of which
are supported under `nodejs_compat`, so they bundle and run. Verify them right
after the first deploy — if the bundle pulls in the docker sandbox path, move
these behind the same VM proxy as `/api/compile`.

### Recommended pattern for `/api/compile`

**Preferred — proxy from the Worker.** One origin, no CORS, no DNS gymnastics.
Replace the body of the `POST` handler in `src/routes/api/compile.ts` with a
pass-through to the VM, keeping the same request/response contract:

```ts
const vm = process.env.VM_ORIGIN // set in wrangler.jsonc "vars"
return fetch(`${vm}/api/compile`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: await request.text(),
})
```

`VM_ORIGIN` is already declared in `wrangler.jsonc`. Locally (no `VM_ORIGIN`)
fall back to the existing `compileSketch` import so `bun run dev` keeps compiling
against your own `arduino-cli`. Guard the `#/server/compile` import behind that
fallback, or it gets bundled into the Worker for nothing.

**Alternative — exclude the path at the edge.** Deploy the Worker on a _Workers
route_ (`bulbus.mohitya.dev/*`) rather than a Custom Domain, add a proxied DNS
record for the zone, and add an Origin Rule that sends `/api/compile` to the EC2
IP. This needs no code change but splits the routing story across the dashboard;
prefer the proxy unless you want the compile request to never touch a Worker.

**Not recommended:** pointing the browser straight at `vm.bulbus.mohitya.dev/api/compile`.
It works but adds a CORS preflight to every compile and a second TLS origin for
the client to know about.

## One-time setup

### 0. Prerequisites

```bash
bun install
bunx wrangler login          # opens a browser; or set CLOUDFLARE_API_TOKEN
bunx wrangler whoami
```

### 1. Hyperdrive for Postgres

Hyperdrive pools connections at the edge; without it every Worker isolate opens
its own Postgres connection and a busy deploy exhausts the server.

```bash
# The Postgres instance itself is NOT on Cloudflare — Neon, RDS, Supabase, or the VM.
bunx wrangler hyperdrive create bulbus-pg \
  --connection-string="postgres://USER:PASSWORD@HOST:5432/bulbus?sslmode=require"
```

It prints an id. Uncomment the `hyperdrive` block in `wrangler.jsonc` and paste
it in:

```jsonc
"hyperdrive": [
  {
    "binding": "HYPERDRIVE",
    "id": "a1b2c3d4e5f6...",
    "localConnectionString": "postgres://postgres:postgres@localhost:5432/bulbus"
  }
]
```

Then regenerate the binding types:

```bash
bun run cf:typegen        # writes worker-configuration.d.ts
```

In the drizzle/postgres setup, read the pooled URL from the binding and fall back
to `DATABASE_URL` so the VM and local dev still work:

```ts
import { env } from 'cloudflare:workers'
import postgres from 'postgres'

const url = env.HYPERDRIVE?.connectionString ?? process.env.DATABASE_URL!
// porsager over Hyperdrive: no prepared statements, small pool per isolate
const sql = postgres(url, { prepare: false, max: 5 })
```

Useful commands:

```bash
bunx wrangler hyperdrive list
bunx wrangler hyperdrive update <id> --connection-string="postgres://…"   # after a password rotation
```

### 2. Electric (read sync)

Electric is a stateful service that holds a logical-replication slot on Postgres.
**It cannot run on Workers.** Two options:

- **Electric Cloud** — create a source against the same Postgres, take the URL it
  gives you. Recommended: it is the only option that stays up without the VM.
- **The VM** — keep the existing docker stack and expose it at
  `https://vm.bulbus.mohitya.dev/electric` through Caddy.

Either way the browser talks to Electric directly over HTTP, so the URL is a
**build-time** client variable, not a Worker secret:

```bash
# .env used by `bun run build:cf`, or the Workers Builds env vars in CI
VITE_ELECTRIC_URL=https://api.electric-sql.cloud/v1/shape
VITE_AGENTS_URL=https://vm.bulbus.mohitya.dev/agents
VITE_GOOGLE_CLIENT_ID=…apps.googleusercontent.com
```

Anything named `VITE_*` is inlined into the client bundle by Vite at build time.
Putting it in `wrangler.jsonc` `vars` or `wrangler secret put` does nothing.

### 3. Secrets

Server-only values go in the Worker secret store, never in `wrangler.jsonc`:

```bash
bunx wrangler secret put BETTER_AUTH_SECRET
bunx wrangler secret put GOOGLE_CLIENT_SECRET
bunx wrangler secret put OPENAI_API_KEY          # only if a server route calls the model directly
bunx wrangler secret put DATABASE_URL            # only if you skip Hyperdrive

bunx wrangler secret list
```

`nodejs_compat` with a compat date of 2025-04-01 or later auto-populates
`process.env` from `vars` + secrets, so existing `process.env.X` reads in
`src/routes/api/**` keep working unchanged. New code can also use
`import { env } from 'cloudflare:workers'`.

Non-secret runtime values (`ELECTRIC_AGENTS_URL`, `BETTER_AUTH_URL`,
`VM_ORIGIN`) live in the `vars` block of `wrangler.jsonc` and are committed.

### 4. First deploy

```bash
bun run build:cf     # CF_BUILD=1 vite build  -> dist/client + dist/server
bun run deploy       # the same build, then wrangler deploy
```

`wrangler deploy` picks up `dist/server/wrangler.json`, generated by the Vite
plugin from `wrangler.jsonc` — that is where `assets.directory` gets filled in
(`"../client"`) — so run it from the repo root and never set `assets.directory`
in `wrangler.jsonc` by hand.

The first deploy prints a `https://bulbus.<account>.workers.dev` URL. Verify SSR,
then attach the real hostname.

### 5. Custom domain

`bulbus.mohitya.dev` currently has an A record (Vercel DNS) pointing at the EC2
Elastic IP. To move it:

1. Add the `mohitya.dev` zone to Cloudflare and move the nameservers, **or** keep
   DNS where it is and use a `*.workers.dev` URL plus a CNAME — a Custom Domain
   requires the zone to be on Cloudflare.
2. Dashboard → Workers & Pages → `bulbus` → Settings → Domains & Routes → Add
   Custom Domain → `bulbus.mohitya.dev`. Cloudflare creates the record and the
   certificate.
3. Point a second record at the EC2 box for the VM half:
   `vm.bulbus.mohitya.dev` → A → the Elastic IP (proxy off, or on if you want
   Cloudflare in front of the coordinator too — check that Electric's long-poll
   streams survive the proxy before enabling it).
4. Update `deploy/Caddyfile` on the box to answer for `vm.bulbus.mohitya.dev`
   instead of `bulbus.mohitya.dev`, and drop the `handle { reverse_proxy :3000 }`
   block — the app is no longer served there.
5. Update `BETTER_AUTH_URL` in `wrangler.jsonc` and the Google OAuth redirect URI
   (`https://bulbus.mohitya.dev/api/auth/callback/google`) to match.

Equivalent, if you prefer config over the dashboard: add
`"routes": [{ "pattern": "bulbus.mohitya.dev", "custom_domain": true }]` to
`wrangler.jsonc` and redeploy.

## Local development

Nothing about the normal loop changes:

```bash
bun run dev          # vite dev on :3000, nitro, node runtime — as before
```

To exercise the app the way Workers will run it (workerd, not node):

```bash
bun run preview:cf   # CF_BUILD=1 vite build && vite preview
```

`vite preview` with the Cloudflare plugin runs the built Worker in the real
workerd runtime, so a Node API that only exists under nitro fails here the same
way it will in production. This is the check to run before every deploy.

For Hyperdrive in local mode, point the binding at a database without going
through Cloudflare:

```bash
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://postgres:postgres@localhost:5432/bulbus"
bun run preview:cf
```

(The env var wins over `localConnectionString` in `wrangler.jsonc`. Query caching
and pooling are inactive in local mode.)

`bunx wrangler dev` also works on the built output, but on a Vite project
`preview:cf` is the supported path — use `wrangler dev --remote` only when you
need the deployed Hyperdrive config and real bindings:

```bash
bunx wrangler dev --remote
```

Logs from a deployed Worker:

```bash
bunx wrangler tail
```

## What still runs `deploy/deploy.sh`

The EC2 box keeps `bulbus-agents` (the agent server), `bulbus-previews`, docker
(Electric Agents coordinator), and `arduino-cli`. `bulbus-app` — the nitro build
on :3000 — can be stopped once the Worker serves the site:

```bash
ssh ubuntu@<host> 'sudo systemctl disable --now bulbus-app'
```

`deploy/deploy.sh` still rsyncs and builds the tree, which is harmless (it just
also produces an `.output` nobody serves). Trim it when the split is settled.

## Open questions to check on the first deploy

- Does the `@electric-ax/agents-runtime` server client bundle cleanly for
  workerd, or does it drag in the docker sandbox module? `bun run preview:cf`
  answers this.
- Worker CPU time on the SSR path for `/projects/$id` — the editor route is
  heavy. The default limit is 30s wall / 30s CPU on paid plans; watch
  `wrangler tail`.
- Whether Electric's long-poll streams behave through a proxied Cloudflare
  record; if not, keep `vm.bulbus.mohitya.dev` grey-clouded (DNS only).
