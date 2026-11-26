import { describe, expect, it } from "vitest";
import { signBody, verifyHmac } from "../lib/hmac.js";

const SECRET = "test-hmac-secret";

describe("HMAC security", () => {
  it("accepts a valid signature over raw bytes", () => {
    const raw = Buffer.from(JSON.stringify({ id: "wh_1", type: "transaction.complete" }));
    const sig = signBody(raw, SECRET);
    expect(verifyHmac(raw, sig, SECRET)).toBe(true);
  });

  it("rejects missing signature", () => {
    const raw = Buffer.from("{}");
    expect(verifyHmac(raw, undefined, SECRET)).toBe(false);
  });

  it("rejects wrong secret", () => {
    const raw = Buffer.from('{"a":1}');
    const sig = signBody(raw, SECRET);
    expect(verifyHmac(raw, sig, "other-secret")).toBe(false);
  });

  it("rejects tampered body (canonicalization / forge attempt)", () => {
    const raw = Buffer.from('{"id":"1","total":10}');
    const sig = signBody(raw, SECRET);
    const tampered = Buffer.from('{"id":"1","total":999}');
    expect(verifyHmac(tampered, sig, SECRET)).toBe(false);
  });

  it("rejects re-serialized JSON that changes bytes", () => {
    const raw = Buffer.from('{"b":1,"a":2}');
    const sig = signBody(raw, SECRET);
    const reserialized = Buffer.from(JSON.stringify({ a: 2, b: 1 }));
    expect(verifyHmac(reserialized, sig, SECRET)).toBe(false);
  });

  it("rejects truncated / length-mismatched signatures without throwing", () => {
    const raw = Buffer.from("hello");
    expect(verifyHmac(raw, "ab", SECRET)).toBe(false);
  });
});
