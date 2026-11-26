#!/usr/bin/env bash
# Bring up Postgres (if needed), install API deps, migrate, and seed demo data.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Demo root: $ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "error: docker is required" >&2
  exit 1
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx db; then
  echo "==> Starting Postgres (docker compose up -d)"
  docker compose up -d
else
  echo "==> Postgres already running"
fi

echo "==> Waiting for Postgres health..."
ready=0
for _ in $(seq 1 60); do
  if docker compose exec -T db pg_isready -U ticketing -d ticketing >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "error: Postgres did not become ready on localhost:5433" >&2
  exit 1
fi

if [[ ! -f api/.env ]]; then
  if [[ -f api/.env.example ]]; then
    echo "==> Creating api/.env from .env.example"
    cp api/.env.example api/.env
  else
    echo "error: api/.env missing and no api/.env.example to copy" >&2
    exit 1
  fi
fi

echo "==> Installing API dependencies"
npm --prefix api install

echo "==> Migrating + seeding"
npm --prefix api run db:migrate
npm --prefix api run db:seed

echo "==> Seed complete. Clients: bluebox (clean) · harbor (legacy)"
echo "    Next: ./scripts/dev.sh"
