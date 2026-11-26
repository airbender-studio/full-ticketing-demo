/**
 * Tiny outbound payload builder (SOS-style gloss).
 * recipe.fields:  source path on canonical → target path on destination
 * recipe.static:  fixed values written into destination
 */

export type FieldMap = { source: string; target: string; transform?: "centsToDollars" | "dollarsString" | "joinLabels" | "upper" };
export type StaticMap = { target: string; value: unknown };
export type MappingRecipe = {
  style: "clean" | "legacy";
  label: string;
  fields: FieldMap[];
  static: StaticMap[];
};

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== "object") return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (typeof cur[p] !== "object" || cur[p] == null) cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function applyTransform(value: unknown, transform?: FieldMap["transform"], canonical?: Record<string, unknown>) {
  switch (transform) {
    case "centsToDollars":
      return typeof value === "number" ? Math.round(value) / 100 : value;
    case "dollarsString":
      return typeof value === "number" ? (value / 100).toFixed(2) : String(value ?? "");
    case "joinLabels": {
      const seats = (canonical?.seats as Array<{ label: string }> | undefined) ?? [];
      return seats.map((s) => s.label).join(",");
    }
    case "upper":
      return String(value ?? "").toUpperCase();
    default:
      return value;
  }
}

export function applyRecipe(
  canonical: Record<string, unknown>,
  recipe: MappingRecipe
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of recipe.fields) {
    const raw = f.source === "_seats" ? canonical.seats : getPath(canonical, f.source);
    setPath(out, f.target, applyTransform(raw, f.transform, canonical));
  }
  for (const s of recipe.static) {
    setPath(out, s.target, s.value);
  }
  return out;
}

/** Demo sample canonical sale — used on the mapping gloss page. */
export const SAMPLE_CANONICAL = {
  orderId: "ord_demo_9k2m",
  email: "patron@example.com",
  totalCents: 9000,
  currency: "USD",
  eventTitle: "Night Songs",
  venueName: "Bluebox Studio",
  venueCity: "Brooklyn",
  paymentStatus: "RECEIVED",
  seats: [
    { label: "C4", section: "Orchestra" },
    { label: "C5", section: "Orchestra" },
  ],
};
