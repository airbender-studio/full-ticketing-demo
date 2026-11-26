// Task 2 — cleaned webhook pattern (whiteboard sketch)
import crypto from "crypto";
import express from "express";

const app = express();

app.post("/webhooks/vivenu", express.raw({ type: "application/json" }), async (req, res) => {
  const raw = req.body;
  const sig = req.header("x-vivenu-signature") || "";
  const expected = crypto.createHmac("sha256", process.env.WEBHOOK_SECRET!).update(raw).digest("hex");

  // bad sig
  if (sig !== expected) return res.status(401).end();

  const event = JSON.parse(raw.toString());

  // already seen
  if (await alreadyClaimed(event.id)) return res.status(200).json({ status: "duplicate" });

  await enqueue({ orderId: event.data.id, type: event.type });
  return res.status(202).json({ status: "accepted" });
});

async function worker(job) {
  const key = "order:" + job.orderId + ":invoice";

  // already synced
  if (await alreadySynced(key)) return;

  await waitForRateLimit();

  // truth from vivenu API — not the webhook body
  const order = await fetchOrder(job.orderId);
  await postErp(order, key);
}

// --- stubs ---
async function alreadyClaimed(id) { return false; }
async function enqueue(job) {}
async function alreadySynced(key) { return false; }
async function waitForRateLimit() {}
async function fetchOrder(id) { return { id }; }
async function postErp(order, key) {}

export { app, worker };
