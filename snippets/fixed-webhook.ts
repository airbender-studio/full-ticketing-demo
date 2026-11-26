// Task 2 — cleaned webhook pattern (whiteboard sketch)
import crypto from "crypto";
import express from "express";

const app = express();

// raw body — HMAC must hash the exact bytes vivenu signed, not re-JSON.stringify
app.post("/webhooks/vivenu", express.raw({ type: "application/json" }), async (req, res) => {
  const raw = req.body;
  const sig = req.header("x-vivenu-signature") || "";
  const expected = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET!).update(raw).digest("hex");

  // reject forgeries before you touch the DB
  if (sig !== expected) return res.status(401).end();

  const event = JSON.parse(raw.toString());

  // claim once — retries / duplicates just get 200
  if (await alreadyClaimed(event.id)) return res.status(200).json({ status: "duplicate" });

  // enqueue then ack fast — vivenu times out if you ERP inline
  await enqueue({ orderId: event.data.id, type: event.type });
  return res.status(202).json({ status: "accepted" });
});

async function worker(job) {
  const key = "order:" + job.orderId + ":invoice";

  // idempotency — same key → skip, no double invoice
  if (await alreadySynced(key)) return;

  // rate limit — don't melt the ERP under a burst of webhooks
  await waitForRateLimit();

  // fetch truth from vivenu — never trust money fields on the webhook body
  const order = await fetchOrder(job.orderId);
  await postErp(order, key);
}

async function alreadyClaimed(id) { return false; }
async function enqueue(job) {}
async function alreadySynced(key) { return false; }
async function waitForRateLimit() {}
async function fetchOrder(id) { return { id }; }
async function postErp(order, key) {}

export { app, worker };
