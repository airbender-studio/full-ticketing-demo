import { describe, expect, it } from "vitest";
import { SAMPLE_CANONICAL, applyRecipe } from "../lib/mappingEngine.js";
import { CLIENTS } from "../config/clients.js";

describe("mapping engine", () => {
  it("maps Bluebox clean recipe to nested invoice shape", () => {
    const bluebox = CLIENTS.find((c) => c.slug === "bluebox")!;
    const out = applyRecipe(SAMPLE_CANONICAL as unknown as Record<string, unknown>, bluebox.mapping);
    expect(out.externalId).toBe(SAMPLE_CANONICAL.orderId);
    expect(out.amountCents).toBe(9000);
    expect((out.customer as { email: string }).email).toBe("patron@example.com");
    expect(out.type).toBe("invoice");
  });

  it("maps Harbor legacy recipe to string money + seat CSV", () => {
    const harbor = CLIENTS.find((c) => c.slug === "harbor")!;
    const out = applyRecipe(SAMPLE_CANONICAL as unknown as Record<string, unknown>, harbor.mapping);
    const txn = (out.Batch as { Txn: Record<string, unknown> }).Txn;
    expect(txn.AMT).toBe("90.00");
    expect(txn.SEAT_CSV).toBe("C4,C5");
    expect(txn.REF_NO).toBe("ORD_DEMO_9K2M");
    expect(txn.POST_TYPE).toBe("SALE");
  });
});
