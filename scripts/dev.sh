#!/usr/bin/env bash
# Start API (:4000) and web (:5173) together. Run ./scripts/seed.sh first.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f api/.env ]]; then
  echo "error: api/.env missing — run ./scripts/seed.sh first" >&2
  exit 1
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "==> Postgres not running — starting docker compose"
  docker compose up -d
  for _ in $(seq 1 60); do
    if docker compose exec -T db pg_isready -U ticketing -d ticketing >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

echo "==> Ensuring dependencies"
npm --prefix api install --silent
npm --prefix web install --silent

# Prefer root concurrently if present; otherwise npm run demo from package.json
if [[ -f node_modules/.bin/concurrently ]]; then
  exec ./node_modules/.bin/concurrently -k -n api,web -c blue,magenta \
    "npm --prefix api run dev" \
    "npm --prefix web run dev"
fi

echo "==> Installing root tools (concurrently)"
npm install --silent
exec ./node_modules/.bin/concurrently -k -n api,web -c blue,magenta \
  "npm --prefix api run dev" \
  "npm --prefix web run dev"
