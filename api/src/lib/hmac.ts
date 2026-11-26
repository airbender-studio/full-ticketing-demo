import crypto from "crypto";

export function verifyHmac(raw: Buffer, signature: string | undefined, secret: string) {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signBody(raw: string | Buffer, secret: string) {
  return crypto.createHmac("sha256", secret).update(raw).digest("hex");
}
