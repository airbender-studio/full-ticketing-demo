export const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Bluebox Ticketing API",
    version: "1.0.0",
    description:
      "Demo ticketing + vivenu-style webhook → ERP bridge. Configurable HMAC, async processing, rate limits, and idempotency.",
  },
  servers: [{ url: "http://localhost:4000" }],
  paths: {
    "/api/venues": {
      get: {
        summary: "List venues",
        responses: { "200": { description: "Venue list with availability" } },
      },
    },
    "/api/venues/{slug}": {
      get: {
        summary: "Get venue",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Venue" } },
      },
    },
    "/api/venues/{slug}/seats": {
      get: {
        summary: "Seat map for venue event",
        parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Seats + event" } },
      },
    },
    "/api/orders/hold": {
      post: {
        summary: "Hold seats (5 min)",
        responses: { "200": { description: "Hold created" }, "409": { description: "Conflict" } },
      },
    },
    "/api/orders/checkout": {
      post: {
        summary: "Complete purchase + fire webhook → ERP",
        responses: { "201": { description: "Order complete" } },
      },
    },
    "/v1/webhooks/vivenu": {
      post: {
        summary: "Webhook ingress (HMAC on raw body)",
        parameters: [
          {
            name: "x-vivenu-signature",
            in: "header",
            schema: { type: "string" },
            description: "hex HMAC-SHA256 of raw body",
          },
        ],
        responses: {
          "200": { description: "accepted / duplicate" },
          "401": { description: "bad signature" },
        },
      },
    },
    "/api/admin/toggles": {
      get: { summary: "Read integration toggles", responses: { "200": { description: "Toggles" } } },
      patch: { summary: "Update toggles", responses: { "200": { description: "Updated" } } },
    },
    "/api/admin/branding": {
      get: { summary: "White-label branding", responses: { "200": { description: "Branding" } } },
      patch: { summary: "Update branding", responses: { "200": { description: "Updated" } } },
    },
    "/api/admin/stats": {
      get: { summary: "Live pipeline stats", responses: { "200": { description: "Stats" } } },
    },
    "/api/admin/events/stream": {
      get: { summary: "SSE live API visualizer feed", responses: { "200": { description: "text/event-stream" } } },
    },
    "/api/admin/reconcile": {
      post: { summary: "Run reconciler for unsynced orders", responses: { "200": { description: "ok" } } },
    },
  },
} as const;
