import { prisma } from "../lib/prisma.js";
import { emit } from "../lib/events.js";
import { getToggles } from "../config/toggles.js";
import { verifyHmac } from "../lib/hmac.js";
import { enqueueErp } from "./erpWorker.js";

type Incoming = {
  id: string;
  type: string;
  data: {
    id: string;
    totalPrice?: number;
    customer?: { email?: string };
    items?: Array<{ id: string; price: number; label?: string }>;
  };
};

export async function handleWebhook(raw: Buffer, signature: string | undefined) {
  const toggles = getToggles();
  const secret = process.env.WEBHOOK_SECRET ?? "";

  if (toggles.requireHmac) {
    const ok = verifyHmac(raw, signature, secret);
    if (!ok) {
      await emit("webhook_reject", "HMAC verification failed", { level: "error" });
      return { status: 401, body: { error: "invalid signature" } };
    }
    await emit("hmac_ok", "HMAC verified", { level: "success" });
  }

  let event: Incoming;
  try {
    event = JSON.parse(raw.toString("utf8")) as Incoming;
  } catch {
    return { status: 400, body: { error: "invalid json" } };
  }

  if (!event?.id || !event?.data?.id) {
    return { status: 400, body: { error: "invalid event shape" } };
  }

  await emit("webhook_in", `Received ${event.type}`, {
    meta: { webhookId: event.id, orderId: event.data.id },
  });

  // Idempotent accept
  try {
    await prisma.webhookInbox.create({
      data: {
        id: event.id,
        type: event.type,
        orderId: event.data.id,
        payload: event as object,
        status: "queued",
      },
    });
  } catch {
    await emit("idempotency", "Duplicate webhook — ack without requeue", {
      meta: { webhookId: event.id },
    });
    return { status: 200, body: { status: "duplicate" } };
  }

  if (toggles.asyncProcessing) {
    setImmediate(() => void processWebhook(event));
    return { status: 200, body: { status: "accepted" } };
  }

  await processWebhook(event);
  return { status: 200, body: { status: "synced" } };
}

async function processWebhook(event: Incoming) {
  const toggles = getToggles();
  const orderId = event.data.id;

  // Truth vs trust-body toggle (Task 2 anti-pattern when true)
  if (!toggles.trustWebhookBody) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { seats: true },
    });
    if (!order) {
      await prisma.webhookInbox.update({
        where: { id: event.id },
        data: { status: "failed" },
      });
      await emit("webhook_error", "Order not found for webhook", {
        level: "error",
        meta: { orderId },
      });
      return;
    }
    await emit("refetch", "Loaded order from source of truth", {
      meta: { orderId, totalCents: order.totalCents, seats: order.seats.length },
    });
  } else {
    await emit("trust_body", "Trusting webhook body for money (demo anti-pattern)", {
      level: "warn",
      meta: { totalPrice: event.data.totalPrice },
    });
  }

  enqueueErp(orderId);

  await prisma.webhookInbox.update({
    where: { id: event.id },
    data: { status: "processed", processedAt: new Date() },
  });
}
