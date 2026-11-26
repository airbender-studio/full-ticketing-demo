/**
 * Task 2 cleaned pattern — HMAC → claim → 202 enqueue; worker: idempotency + rate limit.
 * Sketch only (stubs at bottom). Live demo: api/src/services/webhook.ts + erpWorker.ts
 */
import crypto from "crypto";
import express from "express";

type Event = { id: string; type: string; data: { id: string } };

function verifyHmac(raw: Buffer, sig: string | undefined, secret: string) {
  if (!sig) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const app = express();

app.post("/webhooks/vivenu", express.raw({ type: "application/json" }), async (req, res) => {
  const raw = req.body as Buffer;
  if (!verifyHmac(raw, req.header("x-vivenu-signature"), process.env.WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: "invalid signature" });
  }

  const event = JSON.parse(raw.toString()) as Event;
  if (!event.id || !event.data?.id) return res.status(400).end();

  const claimed = await inbox.insertIgnore(event.id);
  if (!claimed) return res.status(200).json({ status: "duplicate" });

  await queue.enqueue({ webhookId: event.id, orderId: event.data.id, type: event.type });
  return res.status(202).json({ status: "accepted" });
});

async function processJob(job: { orderId: string; type: string }) {
  const key = `order:${job.orderId}:invoice`;
  if (await erp.alreadySynced(key)) return;

  await rateLimit.take("erp");
  const order = await vivenu.getOrder(job.orderId); // truth from API, not webhook body
  await erp.upsertInvoice(order, { "Idempotency-Key": key });
  await erp.markSynced(key);
}

declare const inbox: { insertIgnore(id: string): Promise<boolean> };
declare const queue: { enqueue(job: { webhookId: string; orderId: string; type: string }): Promise<void> };
declare const rateLimit: { take(bucket: string): Promise<void> };
declare const vivenu: { getOrder(id: string): Promise<unknown> };
declare const erp: {
  alreadySynced(key: string): Promise<boolean>;
  upsertInvoice(order: unknown, headers: Record<string, string>): Promise<void>;
  markSynced(key: string): Promise<void>;
};

void processJob;
void app;
