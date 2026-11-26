import "./setup.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDemoData } from "./setup.js";

const app = createApp();

describe("IDOR protections", () => {
  let eventA: string;
  let eventB: string;
  let seatsA: string[];
  let seatsB: string[];

  beforeAll(async () => {
    const studio = await prisma.venue.findUnique({
      where: { slug: "studio-100" },
      include: { events: { take: 1 } },
    });
    const hall = await prisma.venue.findUnique({
      where: { slug: "hall-500" },
      include: { events: { take: 1 } },
    });
    if (!studio?.events[0] || !hall?.events[0]) throw new Error("seed venues missing");
    eventA = studio.events[0].id;
    eventB = hall.events[0].id;
  });

  beforeEach(async () => {
    await resetDemoData();
    seatsA = (
      await prisma.seat.findMany({
        where: { eventId: eventA, status: "AVAILABLE" },
        take: 2,
        orderBy: [{ row: "asc" }, { col: "asc" }],
      })
    ).map((s) => s.id);
    seatsB = (
      await prisma.seat.findMany({
        where: { eventId: eventB, status: "AVAILABLE" },
        take: 2,
        orderBy: [{ row: "asc" }, { col: "asc" }],
      })
    ).map((s) => s.id);
  });

  it("blocks holding seats from another event (cross-event IDOR)", async () => {
    const res = await request(app)
      .post("/api/orders/hold")
      .send({ eventId: eventA, seatIds: seatsB });
    expect(res.status).toBe(404);
  });

  it("blocks second buyer from locking already-held seats", async () => {
    const first = await request(app)
      .post("/api/orders/hold")
      .send({ eventId: eventA, seatIds: seatsA });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/orders/hold")
      .send({ eventId: eventA, seatIds: seatsA });
    expect(second.status).toBe(409);
  });

  it("blocks checkout using someone else's holdToken on different seats", async () => {
    const holdA = await request(app)
      .post("/api/orders/hold")
      .send({ eventId: eventA, seatIds: seatsA });
    const holdB = await request(app)
      .post("/api/orders/hold")
      .send({ eventId: eventB, seatIds: seatsB });

    const steal = await request(app)
      .post("/api/orders/checkout")
      .send({
        eventId: eventB,
        seatIds: seatsB,
        email: "attacker@test.dev",
        holdToken: holdA.body.holdToken, // token for A, seats for B
      });
    expect(steal.status).toBe(403);
    expect(holdB.status).toBe(200);
  });

  it("GET order requires matching x-customer-email (IDOR)", async () => {
    const hold = await request(app)
      .post("/api/orders/hold")
      .send({ eventId: eventA, seatIds: seatsA });
    const order = await request(app)
      .post("/api/orders/checkout")
      .send({
        eventId: eventA,
        seatIds: seatsA,
        email: "owner@test.dev",
        holdToken: hold.body.holdToken,
      });
    expect(order.status).toBe(201);

    const denied = await request(app)
      .get(`/api/orders/${order.body.id}`)
      .set("x-customer-email", "stranger@test.dev");
    expect(denied.status).toBe(403);

    const missing = await request(app).get(`/api/orders/${order.body.id}`);
    expect(missing.status).toBe(403);

    const ok = await request(app)
      .get(`/api/orders/${order.body.id}`)
      .set("x-customer-email", "owner@test.dev");
    expect(ok.status).toBe(200);
    expect(ok.body.email).toBe("owner@test.dev");
  });
});
