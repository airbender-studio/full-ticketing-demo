import "./setup.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { resetDemoData } from "./setup.js";
const app = createApp();

describe("order hold → checkout flow", () => {
  let eventId: string;
  let seatIds: string[];

  beforeAll(async () => {
    const venue = await prisma.venue.findUnique({
      where: { slug: "studio-100" },
      include: { events: { take: 1 } },
    });
    if (!venue?.events[0]) throw new Error("seed missing");
    eventId = venue.events[0].id;
  });

  beforeEach(async () => {
    await resetDemoData();
    seatIds = (
      await prisma.seat.findMany({
        where: { eventId, status: "AVAILABLE" },
        take: 2,
        orderBy: [{ row: "asc" }, { col: "asc" }],
      })
    ).map((s) => s.id);
  });

  it("locks seats and completes checkout with holdToken", async () => {
    const hold = await request(app)
      .post("/api/orders/hold")
      .send({ eventId, seatIds });
    expect(hold.status).toBe(200);
    expect(hold.body.holdToken).toBeTruthy();

    const seats = await prisma.seat.findMany({ where: { id: { in: seatIds } } });
    expect(seats.every((s) => s.status === "HELD")).toBe(true);

    const order = await request(app)
      .post("/api/orders/checkout")
      .send({
        eventId,
        seatIds,
        email: "flow@test.dev",
        holdToken: hold.body.holdToken,
      });
    expect(order.status).toBe(201);
    expect(order.body.ticket.code).toBeTruthy();

    const sold = await prisma.seat.findMany({ where: { id: { in: seatIds } } });
    expect(sold.every((s) => s.status === "SOLD")).toBe(true);
  });
});
