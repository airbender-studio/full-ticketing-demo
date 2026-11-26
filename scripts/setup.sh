#!/usr/bin/env bash
# One-shot: Postgres + migrate + seed + install API/web/e2e (+ Chromium for Playwright).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "==> Full demo setup"
"$ROOT/scripts/seed.sh"

echo "==> Installing web + e2e dependencies"
npm --prefix web install
npm --prefix e2e install
npx --prefix e2e playwright install chromium

echo "==> Setup complete."
echo "    Start:  ./scripts/dev.sh"
echo "    Demo:   npm run e2e"
