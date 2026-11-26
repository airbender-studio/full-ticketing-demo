import { beforeEach, describe, expect, it } from "vitest";
import { resetRateLimits, takeToken, rateLimitSnapshot } from "../lib/rateLimit.js";

describe("rate limiting", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows up to limitPerMinute then blocks", () => {
    const limit = 3;
    expect(takeToken("erp", limit).allowed).toBe(true);
    expect(takeToken("erp", limit).allowed).toBe(true);
    expect(takeToken("erp", limit).allowed).toBe(true);
    const blocked = takeToken("erp", limit);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("isolates buckets (no cross-tenant bleed)", () => {
    const limit = 1;
    expect(takeToken("erp:a", limit).allowed).toBe(true);
    expect(takeToken("erp:a", limit).allowed).toBe(false);
    expect(takeToken("erp:b", limit).allowed).toBe(true);
  });

  it("decrements remaining correctly", () => {
    const first = takeToken("shop", 5);
    expect(first.remaining).toBe(4);
    const second = takeToken("shop", 5);
    expect(second.remaining).toBe(3);
  });

  it("exposes snapshot for observability", () => {
    takeToken("erp", 10);
    const snap = rateLimitSnapshot();
    expect(snap.some((s) => s.bucket === "erp" && s.count === 1)).toBe(true);
  });
});
