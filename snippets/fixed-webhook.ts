// Task 2 — cleaned webhook pattern (whiteboard sketch)
import crypto from "crypto";
import express from "express";

interface Incoming {
  id: string;
  type: string;
  data: { id: string };
}

interface Outgoing {
  externalId: string;
  amountCents: number;
  currency: string;
  email: string;
}

const app = express();

// raw body — HMAC needs the exact bytes vivenu signed
app.post("/webhooks/vivenu", express.raw({ type: "application/json" }), async (req, res) => {
  const raw = req.body;
  const sig = req.header("x-vivenu-signature") || "";
  const secret = process.env.WEBHOOK_SECRET || "";
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");

  // reject forgeries
  if (!sig || sig !== expected) return res.status(401).end();

  const body = JSON.parse(raw.toString()) as Incoming;
  const { id: webhookId, type, data } = body;
  const orderId = data?.id || "";

  // base checks only
  if (!webhookId || !orderId) return res.status(400).end();

  // claim once — duplicates just ack
  if (await alreadyClaimed(webhookId)) return res.status(200).json({ status: "duplicate" });

  // enqueue then 202 — don't ERP in the request (vivenu times out)
  await enqueue({ orderId, type: type || "transaction.complete" });
  return res.status(202).json({ status: "accepted" });
});

async function worker(job: { orderId: string; type: string }) {
  const key = "order:" + job.orderId + ":invoice";

  // idempotency — same key → skip
  if (await alreadySynced(key)) return;

  // rate limit — protect the ERP
  await waitForRateLimit();

  // truth from vivenu — don't trust webhook money fields
  const order = await fetchOrder(job.orderId);
  const { id, realPrice, currency, customer } = order || {};

  const payload: Outgoing = {
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
async function postErp(payload: Outgoing, key: string) {}

export { app, worker };
