/** Visualizer-style CLI logging for the demo terminal — readable, not spammy. */

const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
};

const levelColor: Record<string, string> = {
  info: c.cyan,
  success: c.green,
  warn: c.yellow,
  error: c.red,
};

const kindTint: Record<string, string> = {
  hold: c.blue,
  hold_release: c.yellow,
  hold_expire: c.yellow,
  order_complete: c.green,
  checkout_error: c.red,
  webhook_in: c.magenta,
  webhook_reject: c.red,
  webhook_error: c.red,
  refetch: c.cyan,
  idempotency: c.yellow,
  rate_limit: c.yellow,
  erp_sync: c.green,
  erp_error: c.red,
  reconciler: c.blue,
  boot: c.green,
};

function compactMeta(meta?: Record<string, unknown>) {
  if (!meta) return "";
  const skip = new Set(["mappedPayload"]);
  const bits: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (skip.has(k) || v == null) continue;
    if (typeof v === "object") continue;
    bits.push(`${k}=${String(v)}`);
    if (bits.length >= 4) break;
  }
  return bits.length ? ` ${c.dim}(${bits.join(" · ")})${c.reset}` : "";
}

/** Pretty one-liner for the API process stdout. */
export function pipelineLog(
  kind: string,
  message: string,
  level: "info" | "warn" | "error" | "success" = "info",
  meta?: Record<string, unknown>
) {
  if (process.env.VITEST || process.env.DEMO_QUIET === "1") return;
  const tint = kindTint[kind] ?? levelColor[level] ?? c.white;
  const badge = `${tint}${c.bold}◆ ${kind.padEnd(14)}${c.reset}`;
  console.log(`${badge} ${message}${compactMeta(meta)}`);
}
