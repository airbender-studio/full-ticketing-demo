import { Router } from "express";
import { z } from "zod";
import { getToggles, updateToggles, type Toggles } from "../config/toggles.js";
import { getBranding, updateBranding, type Branding } from "../config/branding.js";
import {
  activateClient,
  getActiveClientSlug,
  getClient,
  listClients,
} from "../config/clients.js";
import { prisma } from "../lib/prisma.js";
import { rateLimitSnapshot } from "../lib/rateLimit.js";
import { queueDepth, reconcile } from "../services/erpWorker.js";
import { emit, subscribe, type LiveEvent } from "../lib/events.js";
import { SAMPLE_CANONICAL, applyRecipe } from "../lib/mappingEngine.js";

export const adminRouter = Router();

adminRouter.get("/toggles", (_req, res) => {
  res.json(getToggles());
});

adminRouter.patch("/toggles", async (req, res) => {
  const parsed = z
    .object({
      requireHmac: z.boolean().optional(),
      asyncProcessing: z.boolean().optional(),
      rateLimitEnabled: z.boolean().optional(),
      rateLimitPerMinute: z.number().int().min(1).max(1000).optional(),
      idempotencyEnabled: z.boolean().optional(),
      trustWebhookBody: z.boolean().optional(),
      erpFailPercent: z.number().min(0).max(100).optional(),
      reconcilerEnabled: z.boolean().optional(),
      webhookTimeoutMs: z.number().int().min(1000).max(30000).optional(),
      holdSeconds: z.number().int().min(15).max(600).optional(),
      holdWarnSeconds: z.number().int().min(5).max(300).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const next = await updateToggles(parsed.data as Partial<Toggles>);
  await emit("config", "Integration toggles updated", { meta: next as unknown as Record<string, unknown> });
  res.json(next);
});

adminRouter.get("/branding", (_req, res) => {
  res.json(getBranding());
});

adminRouter.patch("/branding", async (req, res) => {
  const parsed = z
    .object({
      brandName: z.string().min(1).max(60).optional(),
      primary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      secondary: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      mode: z.enum(["light", "dark"]).optional(),
      font: z.enum(["dm-sans", "space-grotesk", "source-serif"]).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) return res.status(400).json(parsed.error.flatten());
  const next = await updateBranding(parsed.data as Partial<Branding>);
  await emit("branding", "Branding updated", { meta: next as unknown as Record<string, unknown> });
  res.json(next);
});

adminRouter.get("/clients", async (_req, res) => {
  const clients = await listClients();
  const activeSlug = await getActiveClientSlug();
  res.json({ activeSlug, clients });
});

adminRouter.get("/clients/:slug", async (req, res) => {
  const client = await getClient(req.params.slug);
  if (!client) return res.status(404).json({ error: "not found" });
  res.json(client);
});

adminRouter.get("/clients/:slug/mapping-preview", async (req, res) => {
  const client = await getClient(req.params.slug);
  if (!client) return res.status(404).json({ error: "not found" });
  const canonical = SAMPLE_CANONICAL;
  const mapped = applyRecipe(canonical as unknown as Record<string, unknown>, client.mapping);
  res.json({
    client: { slug: client.slug, name: client.name, style: client.mapping.style, label: client.mapping.label },
    recipe: client.mapping,
    canonical,
    mapped,
  });
});

adminRouter.post("/clients/:slug/activate", async (req, res) => {
  try {
    const result = await activateClient(req.params.slug);
    await emit("client_switch", `Activated ${result.client.name}`, {
      meta: { slug: result.client.slug, style: result.client.mapping.style },
    });
    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

adminRouter.get("/stats", async (_req, res) => {
  const [orders, synced, failed, queued] = await Promise.all([
    prisma.order.count({ where: { status: "COMPLETE" } }),
    prisma.erpSync.count({ where: { status: "synced" } }),
    prisma.erpSync.count({ where: { status: "failed" } }),
    prisma.webhookInbox.count({ where: { status: "queued" } }),
  ]);

  res.json({
    orders,
    synced,
    failed,
    queued,
    erpQueueDepth: queueDepth(),
    rateLimits: rateLimitSnapshot(),
    toggles: getToggles(),
    branding: getBranding(),
  });
});

adminRouter.post("/reconcile", async (_req, res) => {
  await reconcile();
  res.json({ ok: true });
});

adminRouter.get("/events", async (req, res) => {
  const take = Math.min(Number(req.query.limit ?? 80), 200);
  const rows = await prisma.apiEventLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });
  res.json(rows.reverse());
});

adminRouter.get("/events/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`event: hello\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const unsub = subscribe((event: LiveEvent) => {
    res.write(`event: log\ndata: ${JSON.stringify(event)}\n\n`);
  });

  const ping = setInterval(() => {
    res.write(`event: ping\ndata: {}\n\n`);
  }, 15000);

  req.on("close", () => {
    clearInterval(ping);
    unsub();
  });
});
