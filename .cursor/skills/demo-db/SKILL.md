---
name: demo-db
description: >-
  Postgres + Prisma schema, migrations, seed, and safe query patterns for the
  ticketing demo. Use when changing models, reseeding, debugging seats/orders,
  or writing DB-backed tests.
---

# Demo database

## Connection

- Docker service `db` in `docker-compose.yml`
- Host port **5433** → container 5432  
- `DATABASE_URL=postgresql://ticketing:ticketing@localhost:5433/ticketing?schema=public`
- File: `api/.env`

## Models (mental map)

- `Venue` → `Event` → `Seat` (AVAILABLE | HELD | SOLD)
- `Order` links sold seats; `WebhookInbox` dedupes by webhook `id`
- `ErpSync` unique on `idempotencyKey` (`order:{id}:invoice`)
- `IntegrationConfig` JSON rows: `1` toggles, `2` branding, `3` clients list, `4` active client slug
- `ApiEventLog` feeds the visualizer SSE stream

## Migrate / seed

```bash
cd api
npx prisma migrate deploy   # CI / fresh machine
npx prisma migrate dev      # local schema change
npm run db:seed             # destructive reset of demo rows
npx prisma studio
```

## Seed behavior

- Three venues: `studio-100`, `hall-500`, `arena-1000`
- Pattern-based **pre-sold** seats for realism
- Default hold window **60s**, warn **30s**
- Clients: Bluebox Arts + Harbor Live

## Agent rules

1. Don’t point Prisma at 5432 — demo uses **5433**  
2. Prefer `db:seed` over hand-deleting rows when resetting demos  
3. After schema edits, add a migration — don’t rely on `db push` alone for shared work  
4. Tests call `resetDemoData()` which frees holds/orders but assumes migrations already applied  
5. Seat uniqueness is `(eventId, label)` — never invent duplicate labels per event
