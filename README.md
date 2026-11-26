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
./scripts/setup.sh   # once: Postgres + migrate + seed + install deps/Chromium
./scripts/dev.sh     # start API :4000 + web :5173
npm run e2e          # headed Playwright walkthrough
```

Same via npm: `npm run setup` · `npm run dev` · `npm run e2e`

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

## Playwright automation

Headed walkthrough that demos the product end-to-end (not a minimal smoke test).

**What it does**

1. Activates Bluebox, opens **Harbor Arena** first  
2. Camera tour: orbit far right + strong tilt + **3× zoom** (same timing) → 1s pause → reverse home (no jump)  
3. Selects seats → hold → checkout → **phone ticket modal** (lingers, then closes) — **only checkout in the run**  
4. API Visualizer: choreographs all sliders together, then restores start values  
5. Customer profiles + mapping pages (before/after JSON), Harbor + Bluebox  
6. Studio + Hall: brief left→right camera peek only (no checkout)  
7. Swagger docs, branding, ticket sample — smooth scroll to the lower third on info pages  

Stays on **localhost** only (bundled Chromium; does not use system Chrome / Google).

**Run**

```bash
# terminals: API + web already up (./scripts/dev.sh)
cd demo   # or repo root of full-ticketing-demo
npm run e2e
# same as:
# DEMO_PACE_MS=1000 npm --prefix e2e run demo
```

First time:

```bash
cd e2e && npm install && npx playwright install chromium
```

| Env | Meaning |
| --- | --- |
| `DEMO_PACE_MS` | Base linger between beats (default in scripts ~1000). Higher = slower showcase. |
| Headed | `npm run e2e` → `--headed --workers=1` |
| Headless | `npm run e2e:headless` |

Spec: `e2e/demo.spec.ts`. Camera helpers live on `window.__demoCameraTour` / `__demoCameraPeek` in the seat map.

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
