import { beforeEach, describe, expect, it } from "vitest";
import {
  assertHoldOwnsSeats,
  consumeHoldSession,
  createHoldSession,
  getHoldSession,
  resetHoldSessions,
} from "../lib/holdSessions.js";

describe("hold sessions (anti-IDOR)", () => {
  beforeEach(() => resetHoldSessions());

  it("creates an opaque token bound to event + seats", () => {
    const s = createHoldSession({
      eventId: "evt_1",
      seatIds: ["b", "a"],
      ttlMs: 60_000,
    });
    expect(s.token.length).toBeGreaterThan(16);
    expect(assertHoldOwnsSeats(s, "evt_1", ["a", "b"])).toBe(true);
  });

  it("rejects seat set mismatch (IDOR attempt)", () => {
    const s = createHoldSession({
      eventId: "evt_1",
      seatIds: ["seat_1"],
      ttlMs: 60_000,
    });
    expect(assertHoldOwnsSeats(s, "evt_1", ["seat_OTHER"])).toBe(false);
  });

  it("rejects cross-event reuse (IDOR attempt)", () => {
    const s = createHoldSession({
      eventId: "evt_1",
      seatIds: ["seat_1"],
      ttlMs: 60_000,
    });
    expect(assertHoldOwnsSeats(s, "evt_2", ["seat_1"])).toBe(false);
  });

  it("expires and consumes sessions", () => {
    const s = createHoldSession({
      eventId: "evt_1",
      seatIds: ["seat_1"],
      ttlMs: -1,
    });
    expect(getHoldSession(s.token)).toBeNull();

    const live = createHoldSession({
      eventId: "evt_1",
      seatIds: ["seat_1"],
      ttlMs: 60_000,
    });
    consumeHoldSession(live.token);
    expect(getHoldSession(live.token)).toBeNull();
  });
});
