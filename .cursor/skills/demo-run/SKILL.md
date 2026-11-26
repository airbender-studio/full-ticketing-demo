---
name: demo-run
description: >-
  How to start, seed, and smoke-test the Bluebox ticketing demo (Docker
  Postgres, API :4000, web :5173). Use when running the demo, fixing boot
  issues, or explaining how the app starts.
---

# Demo runbook

## Cold start

```bash
./scripts/setup.sh   # once
./scripts/dev.sh     # API :4000 + web :5173
# or manually:
docker compose up -d
cd api && npm i && npx prisma migrate deploy && npm run db:seed && npm run dev
# new terminal
cd web && npm i && npm run dev
```

Expect:

- API log: `API http://localhost:4000`
- Vite: `http://localhost:5173/`
- `curl -s localhost:4000/health` → `{"ok":true}`

## Reset data without rebuild

```bash
cd api && npm run db:seed
```

Resets venues (100/500/1000), pre-sold seats, toggles, dual clients (`bluebox`, `harbor`).

## Smoke path

1. Open `/` → three venues  
2. `studio-100` → Quick pick 2 → timer locks → Buy  
3. Phone ticket preview appears  
4. `/visualizer` shows hold → webhook → erp_sync  

## Common failures

| Symptom | Fix |
| --- | --- |
| Prisma can’t connect | `docker compose up -d`; URL port **5433** |
| Checkout 403 | Frontend must send `holdToken` from hold |
| Webhook 401 | `WEBHOOK_SECRET` mismatch or missing signature |
| Empty venue cards | API down or CORS; check proxy to :4000 |

## Playwright

```bash
cd demo/e2e && npm i && npx playwright install chromium
DEMO_PACE_MS=1600 npm run demo
```
