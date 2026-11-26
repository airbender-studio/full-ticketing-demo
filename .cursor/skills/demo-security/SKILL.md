---
name: demo-security
description: >-
  Security contracts for the ticketing demo: HMAC webhooks, holdToken anti-IDOR,
  order email gate, ERP rate limits and idempotency. Use when changing checkout,
  webhooks, authz, or writing security tests.
---

# Demo security contracts

## Webhooks

- Route: `POST /v1/webhooks/vivenu` with **raw** body parser
- Header: `x-vivenu-signature` = hex HMAC-SHA256(rawBody, `WEBHOOK_SECRET`)
- Verify **before** `JSON.parse`; never sign `JSON.stringify(parsed)`
- Toggle `requireHmac` can disable for chaos demos — default **on**
- Inbox insert unique on webhook `id` → duplicate returns 200 `duplicate`

## Holds / checkout (IDOR)

- `POST /api/orders/hold` returns `holdToken` (opaque, TTL = hold window)
- `POST /api/orders/checkout` **requires** `holdToken` matching eventId + seatIds
- Stolen token + other seats → **403**
- Missing token → **400**; expired lock on seats → **409**
- Active HELD seat cannot be held by a second buyer → **409**
- Cross-event seat ids → **404**

## Order read (IDOR)

- `GET /api/orders/:id` requires header `x-customer-email` equal to order email (case-insensitive)
- Wrong/missing email → **403**

## ERP worker

- `takeToken("erp", rateLimitPerMinute)` when `rateLimitEnabled`
- Idempotency key `order:{id}:invoice` when `idempotencyEnabled`
- Do not await ERP inside the webhook handler when `asyncProcessing` is true

## Tests to run after security changes

```bash
cd api && npm test
```

Files: `hmac.test.ts`, `rateLimit.test.ts`, `holdSessions.test.ts`, `security.http.test.ts`, `idor.http.test.ts`.
