// Task 2 reference: HMAC verification, async enqueue, idempotent ERP writes.
import crypto from "crypto";
import express from "express";

interface VivenuWebhookEvent {
  id: string;
  type: string;
  data: { id: string };
}

interface ErpInvoice {
  externalId: string;
  amountCents: number;
  currency: string;
  email: string;
}

const app = express();

// Verify HMAC against the raw request body (not a re-serialized object).
app.post("/webhooks/vivenu", express.raw({ type: "application/json" }), async (req, res) => {
  const raw = req.body;
  const sig = req.header("x-vivenu-signature") || "";
  const secret = process.env.WEBHOOK_SECRET || "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");

  // Reject requests with a missing or invalid signature.
  if (!sig || sig !== expected) return res.status(401).end();

  const body = JSON.parse(raw.toString()) as VivenuWebhookEvent;
  const { id: webhookId, type, data } = body;
  const orderId = data?.id || "";

  // Require webhook id and order id before processing.
  if (!webhookId || !orderId) return res.status(400).end();

  // Deduplicate delivery: prior claims return 200 without re-enqueue.
  if (await alreadyClaimed(webhookId)) return res.status(200).json({ status: "duplicate" });

  // Return 202 after enqueue so the HTTP path stays non-blocking.
  await enqueue({ orderId, type: type || "transaction.complete" });
  return res.status(202).json({ status: "accepted" });
});

async function syncOrder(job: { orderId: string; type: string }) {
  const key = "order:" + job.orderId + ":invoice";

  // Idempotency key prevents duplicate ERP writes.
  if (await alreadySynced(key)) return;

  // Rate-limit outbound ERP calls under webhook bursts.
  await waitForRateLimit();

  // Load authoritative order state from the vivenu API; ignore monetary fields from the webhook body.
  const order = await fetchOrder(job.orderId);
  const { id, realPrice, currency, customer } = order || {};

  const payload: ErpInvoice = {
    externalId: id || job.orderId,
    amountCents: Math.round((realPrice || 0) * 100),
    currency: currency || "USD",
    email: customer?.email || "",
  };

  await postErp(payload, key);
}

async function alreadyClaimed(id: string) {
  return false;
}
async function enqueue(job: { orderId: string; type: string }) {}
async function alreadySynced(key: string) {
  return false;
}
async function waitForRateLimit() {}
async function fetchOrder(id: string) {
  return { id, realPrice: 0, currency: "USD", customer: { email: "" } };
}
async function postErp(payload: ErpInvoice, key: string) {}

export { app, syncOrder };
