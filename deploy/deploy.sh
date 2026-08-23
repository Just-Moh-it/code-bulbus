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
$SSH 'set -e; cd bulbus; export PATH=$HOME/.bun/bin:$PATH; bun install --frozen-lockfile; set -a; . ./.env.production; set +a; bun run build'
$SSH 'sudo cp bulbus/deploy/Caddyfile /etc/caddy/Caddyfile && sudo cp bulbus/deploy/bulbus-app.service bulbus/deploy/bulbus-agents.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now bulbus-app bulbus-agents && sudo systemctl restart bulbus-app bulbus-agents caddy'
echo "deployed to https://bulbus.mohitya.dev"
