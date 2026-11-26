# Bluebox ticketing demo

Runnable vivenu-style ticketing + webhook→ERP bridge for interview demos.

## Run

```bash
./scripts/seed.sh   # docker → migrate → seed (creates api/.env from example if missing)
./scripts/dev.sh    # API :4000 + web :5173
```

| Service | URL |
| --- | --- |
| Web | http://localhost:5173 |
| API | http://localhost:4000 |
| Swagger | http://localhost:4000/docs |
| Postgres | `localhost:5433` user/pass/db `ticketing` |

## Packages

- `api/` — Express + Prisma + Zod; entry `src/index.ts`, app factory `src/app.ts`
- `web/` — Vite React + MUI + R3F seat maps
- `e2e/` — Playwright paced demo
- `scripts/` — `seed.sh`, `dev.sh`

## Important modules

| Area | Path |
| --- | --- |
| Schema | `api/prisma/schema.prisma` |
| Seed (venues, sold seats, full customer profiles) | `api/prisma/seed.ts` |
| Hold / checkout / holdToken | `api/src/services/orders.ts`, `api/src/lib/holdSessions.ts` |
| Webhook HMAC + inbox | `api/src/services/webhook.ts`, `api/src/lib/hmac.ts` |
| ERP worker + mapping recipes | `api/src/services/erpWorker.ts`, `api/src/lib/mappingEngine.ts` |
| Client profiles (bluebox/harbor) | `api/src/config/clients.ts` |
| Seat map layouts | `web/src/components/SeatMap3D.tsx` |
| Phone ticket | `web/src/components/TicketPhone.tsx` |

## Commands

```bash
./scripts/seed.sh          # reset demo data
npm test                   # vitest (needs DB up + migrated)
cd e2e && DEMO_PACE_MS=1600 npm run demo
```

## Do not break

- Webhook route uses `express.raw` — never `express.json()` before it
- Checkout body must include `holdToken` from hold response
- Order GET needs `x-customer-email`
- Integration config ids: `1` toggles, `2` branding, `3` clients (full profiles), `4` active client
