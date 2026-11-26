#!/usr/bin/env bash
# Start Postgres + API + web, wait until healthy, then run the headed Playwright demo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_LOG="${TMPDIR:-/tmp}/ticketing-api.log"
WEB_LOG="${TMPDIR:-/tmp}/ticketing-web.log"
API_PID_FILE="${TMPDIR:-/tmp}/ticketing-api.pid"
WEB_PID_FILE="${TMPDIR:-/tmp}/ticketing-web.pid"

cleanup_on_fail() {
  echo "error: start-demo failed — API log: $API_LOG · web log: $WEB_LOG" >&2
}
trap cleanup_on_fail ERR

echo "==> Ensuring DB + seed"
"$ROOT/scripts/seed.sh"

echo "==> Ensuring dependencies"
npm install --silent
npm --prefix api install --silent
npm --prefix web install --silent
npm --prefix e2e install --silent
npx --prefix e2e playwright install chromium >/dev/null

start_bg() {
  local name="$1" cmd="$2" pid_file="$3" log_file="$4" health_url="$5"
  if curl -sf -o /dev/null "$health_url" 2>/dev/null; then
    echo "==> $name already up"
    return 0
  fi
  # Kill stale pid from a prior start-demo if port is free but pid file exists
  if [[ -f "$pid_file" ]] && ! kill -0 "$(cat "$pid_file")" 2>/dev/null; then
    rm -f "$pid_file"
  fi
  echo "==> Starting $name"
  # shellcheck disable=SC2086
  nohup bash -lc "$cmd" >"$log_file" 2>&1 &
  echo $! >"$pid_file"
}

start_bg "API" "npm --prefix api run dev" "$API_PID_FILE" "$API_LOG" "http://localhost:4000/health"
start_bg "web" "npm --prefix web run dev" "$WEB_PID_FILE" "$WEB_LOG" "http://localhost:5173/"

echo "==> Waiting for API :4000 and web :5173"
ready=0
for _ in $(seq 1 90); do
  if curl -sf http://localhost:4000/health >/dev/null \
    && curl -sf -o /dev/null http://localhost:5173/; then
    ready=1
    break
  fi
  sleep 1
done
if [[ "$ready" -ne 1 ]]; then
  echo "error: stack did not become ready in time" >&2
  exit 1
fi
echo "==> Stack ready"

echo "==> Running headed Playwright demo"
DEMO_PACE_MS="${DEMO_PACE_MS:-1000}" npm --prefix e2e run demo

echo "==> Demo finished. Stack still running (API :4000 · web :5173)."
echo "    Stop later with: kill \$(cat $API_PID_FILE $WEB_PID_FILE) 2>/dev/null; docker compose stop"
