import { prisma } from "../lib/prisma.js";
import { emit } from "../lib/events.js";
import { getToggles } from "../config/toggles.js";
import { takeToken } from "../lib/rateLimit.js";
import { getActiveClient } from "../config/clients.js";
import { applyRecipe } from "../lib/mappingEngine.js";

const queue: string[] = [];
let pumping = false;

export function enqueueErp(orderId: string) {
  // Vitest sets VITEST=true — skip async ERP side effects that race DB teardown
  if (process.env.VITEST) return;
  queue.push(orderId);
  void emit("erp_queue", `Enqueued ERP sync · depth ${queue.length}`, {
    meta: { orderId, depth: queue.length },
  });
  void pump();
}

export function queueDepth() {
  return queue.length;
}

/** Test helper — drop pending ERP jobs so teardown isn’t raced. */
export function clearErpQueue() {
  queue.length = 0;
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length) {
      const orderId = queue.shift()!;
      await syncOrder(orderId);
    }
  } finally {
    pumping = false;
  }
}

export async function syncOrder(orderId: string) {
  const toggles = getToggles();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { seats: true },
  });
  if (!order || order.status !== "COMPLETE") return;

  const action = "invoice";
  const idempotencyKey = `order:${order.id}:${action}`;

  await emit("erp_attempt", `ERP worker attempt · ${orderId.slice(-8)}`, {
    meta: { orderId, idempotencyKey },
  });

  if (toggles.rateLimitEnabled) {
    const token = takeToken("erp", toggles.rateLimitPerMinute);
    if (!token.allowed) {
      await emit("rate_limit", "ERP rate limit hit — requeue", {
        level: "warn",
        meta: { orderId, resetAt: token.resetAt, remaining: token.remaining },
      });
      setTimeout(() => enqueueErp(orderId), Math.max(250, token.resetAt - Date.now()));
      return;
    }
  }

  if (toggles.idempotencyEnabled) {
    const existing = await prisma.erpSync.findUnique({ where: { idempotencyKey } });
    if (existing?.status === "synced") {
      await emit("idempotency", "Skip duplicate ERP write", {
        level: "info",
        meta: { orderId, idempotencyKey },
      });
      return;
    }
  }

  const sync = await prisma.erpSync.upsert({
    where: { idempotencyKey },
    create: {
      orderId: order.id,
      action,
      idempotencyKey,
      status: "pending",
      attempts: 1,
    },
    update: { attempts: { increment: 1 }, status: "pending", lastError: null },
  });

  // Chaos toggle for visualizer demos
  if (Math.random() * 100 < toggles.erpFailPercent) {
    await prisma.erpSync.update({
      where: { id: sync.id },
      data: { status: "failed", lastError: "Simulated ERP 503" },
    });
    await emit("erp_error", "ERP write failed (chaos toggle)", {
      level: "error",
      meta: { orderId, idempotencyKey },
    });
    setTimeout(() => enqueueErp(orderId), 1500);
    return;
  }

  const client = await getActiveClient();
  const event = await prisma.event.findUnique({
    where: { id: order.eventId },
    include: { venue: true },
  });

  const canonical = {
    orderId: order.id,
    email: order.email,
    totalCents: order.totalCents,
    currency: order.currency,
    eventTitle: event?.title ?? "Event",
    venueName: event?.venue.name ?? "Venue",
    venueCity: event?.venue.city ?? "",
    paymentStatus: order.paymentStatus,
    seats: order.seats.map((s) => ({ label: s.label, section: s.section })),
  };

  const mappedPayload = applyRecipe(
    canonical as unknown as Record<string, unknown>,
    client.mapping
  );

  const erpExternalId =
    client.mapping.style === "legacy"
      ? String((mappedPayload as { Batch?: { Txn?: { REF_NO?: string } } }).Batch?.Txn?.REF_NO ?? order.id)
      : `ERP-${order.id.slice(-8).toUpperCase()}`;

  await prisma.erpSync.update({
    where: { id: sync.id },
    data: { status: "synced", erpExternalId, lastError: null },
  });

  await emit("erp_sync", `Mapped → ${client.name} (${client.mapping.style}) as ${erpExternalId}`, {
    level: "success",
    meta: {
      orderId,
      client: client.slug,
      mappingStyle: client.mapping.style,
      erpExternalId,
      totalCents: order.totalCents,
      seats: order.seats.map((s) => s.label),
      idempotencyKey,
      mappedPayload,
    },
  });
}

export async function reconcile() {
  if (!getToggles().reconcilerEnabled) return;

  const orphans = await prisma.order.findMany({
    where: {
      status: "COMPLETE",
      erpSyncs: { none: { status: "synced", action: "invoice" } },
    },
    take: 50,
  });

  for (const o of orphans) {
    await emit("reconciler", `Requeue unsynced order ${o.id}`, {
      level: "warn",
      meta: { orderId: o.id },
    });
    enqueueErp(o.id);
  }
}
