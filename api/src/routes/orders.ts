import { Router } from "express";
import { z } from "zod";
import { checkout, holdSeats, refreshHold, releaseSeats } from "../services/orders.js";
import { prisma } from "../lib/prisma.js";
import { emit } from "../lib/events.js";
import { getToggles } from "../config/toggles.js";

export const ordersRouter = Router();

ordersRouter.get("/hold-config", (_req, res) => {
  const t = getToggles();
  res.json({
    holdSeconds: t.holdSeconds,
    holdWarnSeconds: t.holdWarnSeconds,
  });
});

ordersRouter.post("/hold", async (req, res) => {
  const body = z
    .object({
      eventId: z.string(),
      seatIds: z.array(z.string()).min(1).max(8),
      refresh: z.boolean().optional(),
      holdToken: z.string().optional(),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());

  try {
    const result = body.data.refresh
      ? await refreshHold(body.data.eventId, body.data.seatIds, body.data.holdToken)
      : await holdSeats(body.data.eventId, body.data.seatIds);
    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

ordersRouter.post("/release", async (req, res) => {
  const body = z
    .object({ eventId: z.string(), seatIds: z.array(z.string()).min(1).max(8) })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());

  try {
    const result = await releaseSeats(body.data.eventId, body.data.seatIds);
    res.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

ordersRouter.post("/checkout", async (req, res) => {
  const body = z
    .object({
      eventId: z.string(),
      seatIds: z.array(z.string()).min(1).max(8),
      email: z.string().email(),
      holdToken: z.string().min(16),
    })
    .safeParse(req.body);
  if (!body.success) return res.status(400).json(body.error.flatten());

  try {
    const order = await checkout(body.data);
    res.status(201).json(order);
  } catch (e) {
    const err = e as Error & { status?: number };
    await emit("checkout_error", err.message, { level: "error" });
    res.status(err.status ?? 500).json({ error: err.message });
  }
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      seats: true,
      erpSyncs: true,
    },
  });
  if (!order) return res.status(404).json({ error: "not found" });

  // IDOR guard — must prove buyer email (demo stand-in for auth)
  const email = req.header("x-customer-email");
  if (!email || email.toLowerCase() !== order.email.toLowerCase()) {
    return res.status(403).json({ error: "forbidden" });
  }

  const event = await prisma.event.findUnique({
    where: { id: order.eventId },
    include: { venue: true },
  });

  res.json({
    ...order,
    ticket: event
      ? {
          orderId: order.id,
          email: order.email,
          totalCents: order.totalCents,
          currency: order.currency,
          eventTitle: event.title,
          venueName: event.venue.name,
          venueCity: event.venue.city,
          startsAt: event.startsAt,
          seats: order.seats.map((s) => ({ label: s.label, section: s.section })),
          code: order.id.slice(-8).toUpperCase(),
        }
      : null,
  });
});
