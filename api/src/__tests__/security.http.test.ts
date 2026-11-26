import "./setup.js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../app.js";
import { prisma } from "../lib/prisma.js";
import { signBody } from "../lib/hmac.js";
import { setTogglesForTest } from "../config/toggles.js";
import { resetDemoData } from "./setup.js";

const app = createApp();
const SECRET = "demo-hmac-secret";

describe("HTTP security — webhooks + checkout binding", () => {
  let eventId: string;
  let seatIds: string[];

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET = SECRET;
    const venue = await prisma.venue.findUnique({
      where: { slug: "studio-100" },
      include: { events: { take: 1 } },
    });
    if (!venue?.events[0]) throw new Error("seed missing studio-100");
    eventId = venue.events[0].id;
  });

  beforeEach(async () => {
    await resetDemoData();
    // re-mark a few sold so inventory isn't empty of sold edge cases
    const seats = await prisma.seat.findMany({
      where: { eventId, status: "AVAILABLE" },
      take: 4,
      orderBy: [{ row: "asc" }, { col: "asc" }],
    });
    seatIds = seats.slice(0, 2).map((s) => s.id);
  });

  it("rejects webhook without HMAC when requireHmac=true", async () => {
    setTogglesForTest({ requireHmac: true, asyncProcessing: false });
    const body = {
      id: `wh_${Date.now()}`,
      type: "transaction.complete",
      data: { id: "order_missing" },
    };
    const res = await request(app)
      .post("/v1/webhooks/vivenu")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(body));
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/signature/i);
  });

  it("accepts webhook with valid raw-body HMAC", async () => {
    setTogglesForTest({ requireHmac: true, asyncProcessing: false });
    // create a real order path via hold+checkout first
    const hold = await request(app)
      .post("/api/orders/hold")
      .send({ eventId, seatIds });
    expect(hold.status).toBe(200);
    const checkout = await request(app)
      .post("/api/orders/checkout")
      .send({
        eventId,
        seatIds,
        email: "hmac@test.dev",
        holdToken: hold.body.holdToken,
      });
    expect(checkout.status).toBe(201);

    // forged duplicate webhook for same order should still verify HMAC then dedupe/process
    const payload = {
      id: `wh_extra_${checkout.body.id}`,
      type: "transaction.complete",
      data: { id: checkout.body.id },
    };
    const raw = JSON.stringify(payload);
    const sig = signBody(raw, SECRET);
    const res = await request(app)
      .post("/v1/webhooks/vivenu")
      .set("Content-Type", "application/json")
      .set("x-vivenu-signature", sig)
      .send(raw);
    expect(res.status).toBe(200);
  });

  it("rejects checkout without holdToken (IDOR / session steal)", async () => {
    await request(app).post("/api/orders/hold").send({ eventId, seatIds });
    const res = await request(app)
      .post("/api/orders/checkout")
      .send({ eventId, seatIds, email: "thief@test.dev" });
    expect(res.status).toBe(400);
  });

  it("rejects checkout with forged holdToken", async () => {
    await request(app).post("/api/orders/hold").send({ eventId, seatIds });
    const res = await request(app)
      .post("/api/orders/checkout")
      .send({
        eventId,
        seatIds,
        email: "thief@test.dev",
        holdToken: "a".repeat(32),
      });
    expect(res.status).toBe(403);
  });
});
