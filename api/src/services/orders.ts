import { prisma } from "../lib/prisma.js";
import { emit } from "../lib/events.js";
import { getToggles } from "../config/toggles.js";
import { signBody } from "../lib/hmac.js";
import {
  assertHoldOwnsSeats,
  consumeHoldSession,
  createHoldSession,
  getHoldSession,
} from "../lib/holdSessions.js";

export async function holdSeats(eventId: string, seatIds: string[]) {
  const toggles = getToggles();
  const holdMs = Math.max(15, toggles.holdSeconds) * 1000;
  const now = new Date();
  const holdUntil = new Date(now.getTime() + holdMs);

  return prisma.$transaction(async (tx) => {
    const seats = await tx.seat.findMany({ where: { id: { in: seatIds }, eventId } });
    if (seats.length !== seatIds.length) {
      throw Object.assign(new Error("Seat not found"), { status: 404 });
    }

    for (const s of seats) {
      const heldExpired = s.status === "HELD" && s.holdUntil && s.holdUntil < now;
      if (s.status === "SOLD" || (s.status === "HELD" && !heldExpired)) {
        throw Object.assign(new Error(`Seat ${s.label} unavailable`), { status: 409 });
      }
    }

    await tx.seat.updateMany({
      where: { id: { in: seatIds } },
      data: { status: "HELD", holdUntil },
    });

    const session = createHoldSession({
      eventId,
      seatIds,
      ttlMs: holdMs,
    });

    await emit("hold", `Locked ${seatIds.length} seat(s) for ${toggles.holdSeconds}s`, {
      meta: {
        eventId,
        seatIds,
        holdUntil: holdUntil.toISOString(),
        holdSeconds: toggles.holdSeconds,
      },
    });

    return {
      holdUntil,
      seatIds,
      holdToken: session.token,
      holdSeconds: toggles.holdSeconds,
      holdWarnSeconds: toggles.holdWarnSeconds,
    };
  });
}

/** Extend or refresh an existing hold on already-held seats. */
export async function refreshHold(eventId: string, seatIds: string[], holdToken?: string) {
  const toggles = getToggles();
  const holdMs = Math.max(15, toggles.holdSeconds) * 1000;
  const now = new Date();
  const holdUntil = new Date(now.getTime() + holdMs);

  // Refresh must present the session that owns these seats (anti-IDOR)
  if (holdToken) {
    const session = getHoldSession(holdToken);
    if (!session || !assertHoldOwnsSeats(session, eventId, seatIds)) {
      throw Object.assign(new Error("Invalid hold token"), { status: 403 });
    }
  }

  return prisma.$transaction(async (tx) => {
    const seats = await tx.seat.findMany({ where: { id: { in: seatIds }, eventId } });
    if (seats.length !== seatIds.length) {
      throw Object.assign(new Error("Seat not found"), { status: 404 });
    }

    for (const s of seats) {
      if (s.status === "SOLD") {
        throw Object.assign(new Error(`Seat ${s.label} unavailable`), { status: 409 });
      }
      const heldOk = s.status === "HELD" && s.holdUntil && s.holdUntil >= now;
      const available = s.status === "AVAILABLE";
      if (!heldOk && !available) {
        throw Object.assign(new Error(`Seat ${s.label} unavailable`), { status: 409 });
      }
    }

    await tx.seat.updateMany({
      where: { id: { in: seatIds } },
      data: { status: "HELD", holdUntil },
    });

    const session = createHoldSession({
      eventId,
      seatIds,
      ttlMs: holdMs,
    });
    if (holdToken) consumeHoldSession(holdToken);

    return {
      holdUntil,
      seatIds,
      holdToken: session.token,
      holdSeconds: toggles.holdSeconds,
      holdWarnSeconds: toggles.holdWarnSeconds,
    };
  });
}

export async function releaseSeats(eventId: string, seatIds: string[]) {
  const result = await prisma.seat.updateMany({
    where: { id: { in: seatIds }, eventId, status: "HELD" },
    data: { status: "AVAILABLE", holdUntil: null },
  });
  if (result.count > 0) {
    await emit("hold_release", `Released ${result.count} held seat(s)`, {
      level: "warn",
      meta: { eventId, seatIds },
    });
  }
  return { released: result.count };
}

export async function checkout(opts: {
  eventId: string;
  seatIds: string[];
  email: string;
  holdToken: string;
}) {
  const session = getHoldSession(opts.holdToken);
  if (!session || !assertHoldOwnsSeats(session, opts.eventId, opts.seatIds)) {
    throw Object.assign(new Error("Invalid or expired hold token"), { status: 403 });
  }

  const event = await prisma.event.findUnique({
    where: { id: opts.eventId },
    include: { venue: true },
  });
  if (!event) throw Object.assign(new Error("Event not found"), { status: 404 });

  const order = await prisma.$transaction(async (tx) => {
    const seats = await tx.seat.findMany({
      where: { id: { in: opts.seatIds }, eventId: opts.eventId },
    });
    if (seats.length !== opts.seatIds.length) {
      throw Object.assign(new Error("Seat not found"), { status: 404 });
    }

    const now = new Date();
    for (const s of seats) {
      const okHeld = s.status === "HELD" && s.holdUntil && s.holdUntil >= now;
      if (!okHeld) {
        throw Object.assign(
          new Error(`Seat ${s.label} lock expired — pick again`),
          { status: 409 }
        );
      }
    }

    const totalCents = seats.length * event.priceCents;
    const created = await tx.order.create({
      data: {
        eventId: opts.eventId,
        email: opts.email,
        totalCents,
        status: "COMPLETE",
        paymentStatus: "RECEIVED",
        seats: { connect: opts.seatIds.map((id) => ({ id })) },
      },
      include: { seats: true },
    });

    await tx.seat.updateMany({
      where: { id: { in: opts.seatIds } },
      data: { status: "SOLD", holdUntil: null, orderId: created.id },
    });

    return created;
  });

  consumeHoldSession(opts.holdToken);

  await emit("order_complete", `Order ${order.id} completed`, {
    level: "success",
    meta: { orderId: order.id, totalCents: order.totalCents, email: opts.email },
  });

  await deliverTransactionComplete(order.id);

  return {
    ...order,
    ticket: {
      orderId: order.id,
      email: order.email,
      totalCents: order.totalCents,
      currency: order.currency,
      eventTitle: event.title,
      venueName: event.venue.name,
      venueCity: event.venue.city,
      startsAt: event.startsAt,
      seats: order.seats.map((s) => ({
        label: s.label,
        section: s.section,
      })),
      code: order.id.slice(-8).toUpperCase(),
    },
  };
}

async function deliverTransactionComplete(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { seats: true },
  });
  if (!order) return;

  const payload = {
    id: `wh_${order.id}`,
    type: "transaction.complete",
    data: {
      id: order.id,
      totalPrice: order.totalCents / 100,
      customer: { email: order.email },
      items: order.seats.map((s) => ({
        id: s.id,
        price: order.totalCents / order.seats.length / 100,
        label: s.label,
      })),
    },
  };

  const raw = JSON.stringify(payload);
  const secret = process.env.WEBHOOK_SECRET ?? "demo-hmac-secret";
  const signature = signBody(raw, secret);

  const { handleWebhook } = await import("./webhook.js");
  await handleWebhook(Buffer.from(raw), signature);
}

export async function releaseExpiredHolds() {
  const now = new Date();
  const result = await prisma.seat.updateMany({
    where: { status: "HELD", holdUntil: { lt: now } },
    data: { status: "AVAILABLE", holdUntil: null },
  });
  if (result.count > 0) {
    await emit("hold_expire", `Released ${result.count} expired hold(s)`, {
      level: "warn",
      meta: { count: result.count },
    });
  }
}
