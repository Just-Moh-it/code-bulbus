#!/usr/bin/env bash
# Deploy the working tree to the EC2 box: rsync source, install, build, (re)start services.
#   deploy/deploy.sh <host>     e.g. deploy/deploy.sh 44.234.232.233
set -euo pipefail
HOST=${1:?host}
KEY=${KEY:-$HOME/.ssh/bulbus-aws.pem}
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new ubuntu@$HOST"
cd "$(dirname "$0")/.."
rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  --exclude node_modules --exclude .output --exclude .vercel --exclude '.env*' --exclude .git --exclude 'scripts/*.tmp.ts' \
  ./ ubuntu@$HOST:/home/ubuntu/bulbus/
[ -f .env.production ] && scp -i "$KEY" .env.production ubuntu@$HOST:/home/ubuntu/bulbus/.env.production
# Data plane first: the build inlines VITE_ELECTRIC_URL, and drizzle-kit needs a live Postgres.
$SSH 'sudo cp bulbus/deploy/bulbus-db.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now bulbus-db && sudo systemctl restart bulbus-db'
$SSH 'set -e; cd bulbus; export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile; set -a; . ./.env.production; set +a; bunx drizzle-kit push --force; bun run build'
$SSH 'sudo cp bulbus/deploy/Caddyfile /etc/caddy/Caddyfile && sudo cp bulbus/deploy/bulbus-app.service bulbus/deploy/bulbus-agents.service bulbus/deploy/bulbus-previews.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now bulbus-app bulbus-agents bulbus-previews && sudo systemctl restart bulbus-app bulbus-agents bulbus-previews caddy'
echo "deployed to https://bulbus.mohitya.dev"
