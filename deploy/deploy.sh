#!/usr/bin/env bash
# Deploy the working tree to the EC2 box: rsync source, install, build, (re)start services.
#   deploy/deploy.sh <host>     e.g. deploy/deploy.sh 44.234.232.233
set -euo pipefail
HOST=${1:?host}
KEY=${KEY:-$HOME/.ssh/bulbus-aws.pem}
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new ubuntu@$HOST"
cd "$(dirname "$0")/.."

# Preflight: fail here, with a name, rather than half-way through a remote build.
# `.env.production` is the box's whole configuration — it is gitignored, so a
# fresh clone will not have it (see .env.example).
[ -f .env.production ] || { echo "deploy: .env.production is missing (see .env.example)" >&2; exit 1; }
missing=()
for var in POSTGRES_PASSWORD DATABASE_URL VITE_ELECTRIC_URL BETTER_AUTH_SECRET BETTER_AUTH_URL; do
  grep -qE "^${var}=." .env.production || missing+=("$var")
done
[ ${#missing[@]} -eq 0 ] || { echo "deploy: .env.production is missing: ${missing[*]}" >&2; exit 1; }
$SSH 'command -v docker >/dev/null' || { echo "deploy: docker is not installed on $HOST" >&2; exit 1; }
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  --exclude node_modules --exclude .output --exclude .vercel --exclude '.env*' --exclude .git --exclude 'scripts/*.tmp.ts' \
  ./ ubuntu@$HOST:/home/ubuntu/bulbus/
scp -i "$KEY" .env.production ubuntu@$HOST:/home/ubuntu/bulbus/.env.production
# Data plane first: the build inlines VITE_ELECTRIC_URL, and drizzle-kit needs a live Postgres.
$SSH 'sudo cp bulbus/deploy/bulbus-db.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now bulbus-db && sudo systemctl restart bulbus-db'
# `.output` is rsync-excluded, so a build interrupted half-way leaves artifacts
# behind that the next build merges with — nitro then boots into a
# "Export 'ssr_exports' is not defined" 500. Always build from clean.
$SSH 'set -e; cd bulbus; export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile; set -a; . ./.env.production; set +a; bunx drizzle-kit push --force; rm -rf .output; bun run build'
$SSH 'sudo cp bulbus/deploy/Caddyfile /etc/caddy/Caddyfile && sudo cp bulbus/deploy/bulbus-app.service bulbus/deploy/bulbus-agents.service bulbus/deploy/bulbus-previews.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now bulbus-app bulbus-agents bulbus-previews && sudo systemctl restart bulbus-app bulbus-agents bulbus-previews caddy'
echo "deployed to https://bulbus.mohitya.dev"
