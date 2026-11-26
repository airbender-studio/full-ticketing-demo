import { beforeAll, beforeEach } from "vitest";
import { prisma } from "../lib/prisma.js";
import { setTogglesForTest } from "../config/toggles.js";
import { resetRateLimits } from "../lib/rateLimit.js";
import { resetHoldSessions } from "../lib/holdSessions.js";
import { loadBranding } from "../config/branding.js";
import { clearErpQueue } from "../services/erpWorker.js";

export async function resetDemoData() {
  clearErpQueue();
  await prisma.apiEventLog.deleteMany();
  await prisma.erpSync.deleteMany();
  await prisma.webhookInbox.deleteMany();
  // Detach seats from orders before deleting orders (FK)
  await prisma.seat.updateMany({
    data: { status: "AVAILABLE", holdUntil: null, orderId: null },
  });
  // Worker may have written ErpSync between deletes — wipe again
  await prisma.erpSync.deleteMany();
  await prisma.order.deleteMany();
}

beforeAll(async () => {
  process.env.WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "demo-hmac-secret";
  setTogglesForTest({
    requireHmac: true,
    asyncProcessing: false,
    rateLimitEnabled: true,
    rateLimitPerMinute: 30,
    idempotencyEnabled: true,
    trustWebhookBody: false,
    erpFailPercent: 0,
    reconcilerEnabled: false,
    holdSeconds: 60,
    holdWarnSeconds: 30,
  });
  await loadBranding().catch(() => undefined);
});

beforeEach(() => {
  resetRateLimits();
  resetHoldSessions();
  setTogglesForTest({
    requireHmac: true,
    asyncProcessing: false,
    rateLimitEnabled: true,
    rateLimitPerMinute: 30,
    idempotencyEnabled: true,
    trustWebhookBody: false,
    erpFailPercent: 0,
    reconcilerEnabled: false,
    holdSeconds: 60,
    holdWarnSeconds: 30,
  });
});
