# Full Ticketing Demo

Full-stack ticketing storefront with seat maps, checkout holds, HMAC webhooks, and async ERP sync — plus dual white-label customers (Bluebox clean / Harbor legacy) and a live API visualizer.

## Stack

| Layer | Tech |
| --- | --- |
| API | Express + Prisma + Postgres |
| Web | Vite + React + MUI + Three.js + Framer Motion |
| DB | Docker Postgres on **localhost:5433** |
| E2E | Playwright paced walkthrough |

## Quick start

```bash
./scripts/seed.sh   # docker up → migrate → seed
./scripts/dev.sh    # API :4000 + web :5173
```

Or via npm from this directory:

```bash
npm run seed
npm run demo
```

| Service | URL |
| --- | --- |
| Storefront | http://localhost:5173 |
| API + Swagger | http://localhost:4000/docs |
| Health | http://localhost:4000/health |
| Postgres | `localhost:5433` · user/pass/db `ticketing` |

Copy `api/.env.example` → `api/.env` if needed (seed does this automatically).

## Customers

| Slug | Style | ERP vibe |
| --- | --- | --- |
| `bluebox` | Clean REST mapping | NetSuite-style invoice (cents, nested lines) |
| `harbor` | Legacy / messy | Ledger2009 flat envelope (dollar strings, seat CSV) |

- Profiles: http://localhost:5173/customers  
- Mapping gloss: `/customers/:slug/mapping`  
- Activate: `POST /api/admin/clients/:slug/activate`  
- List: `GET /api/admin/clients` (full profiles after seed)

## Venues

| Slug | Layout | Seats |
| --- | --- | --- |
| `studio-100` | Black-box grid | 100 |
| `hall-500` | Theater rake (auto-spin) | 500 |
| `arena-1000` | Oval bowl (auto-spin) | 1000 |

## Flow

1. Pick seats → `POST /api/orders/hold` → **holdToken** + countdown  
2. `POST /api/orders/checkout` with **holdToken** → order COMPLETE  
3. Signed webhook → inbox dedupe → ERP worker (rate limit + idempotency + mapping recipe)  
4. Phone wallet ticket preview (no email provider)

## Tests

```bash
# needs Postgres on :5433 (./scripts/seed.sh)
npm test
# or
cd api && npm test
```

Covers HMAC, rate limits, hold sessions, HTTP IDOR/security, hold→checkout, mapping engine.

## Playwright demo

```bash
# api + web already running
cd e2e && npm install && npx playwright install chromium
DEMO_PACE_MS=1600 npm run demo
```

## Admin surfaces

| Path | Purpose |
| --- | --- |
| `/visualizer` | Live hold → webhook → ERP stream |
| `/branding` | Live white-label skin |
| `/customers` | Customer profiles + activate |
| `/api/admin/toggles` | HMAC, async, chaos fail %, hold window |

## Security contracts

- HMAC on **raw** webhook body (`x-vivenu-signature`)
- Checkout requires **holdToken** (anti-IDOR)
- `GET /api/orders/:id` requires `x-customer-email` matching buyer
- ERP writes gated by rate limit + idempotency key

## License

MIT — demo / interview / learning use.
