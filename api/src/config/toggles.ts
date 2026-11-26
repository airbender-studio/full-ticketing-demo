import { prisma } from "../lib/prisma.js";

export type Toggles = {
  requireHmac: boolean;
  asyncProcessing: boolean;
  rateLimitEnabled: boolean;
  rateLimitPerMinute: number;
  idempotencyEnabled: boolean;
  trustWebhookBody: boolean;
  erpFailPercent: number;
  reconcilerEnabled: boolean;
  webhookTimeoutMs: number;
  /** How long selected seats stay locked for this buyer. */
  holdSeconds: number;
  /** Show “hurry up” popup when this many seconds remain. */
  holdWarnSeconds: number;
};

export const DEFAULT_TOGGLES: Toggles = {
  requireHmac: true,
  asyncProcessing: true,
  rateLimitEnabled: true,
  rateLimitPerMinute: 30,
  idempotencyEnabled: true,
  trustWebhookBody: false,
  erpFailPercent: 0,
  reconcilerEnabled: true,
  webhookTimeoutMs: 10000,
  holdSeconds: 60,
  holdWarnSeconds: 30,
};

let cache: Toggles = { ...DEFAULT_TOGGLES };
let loaded = false;

export async function loadToggles(): Promise<Toggles> {
  const row = await prisma.integrationConfig.findUnique({ where: { id: 1 } });
  cache = { ...DEFAULT_TOGGLES, ...((row?.value as Partial<Toggles>) ?? {}) };
  loaded = true;
  return cache;
}

export function getToggles(): Toggles {
  if (!loaded) return { ...DEFAULT_TOGGLES };
  return cache;
}

export async function updateToggles(patch: Partial<Toggles>): Promise<Toggles> {
  const next = { ...getToggles(), ...patch };
  await prisma.integrationConfig.upsert({
    where: { id: 1 },
    create: { id: 1, value: next },
    update: { value: next },
  });
  cache = next;
  loaded = true;
  return cache;
}

/** In-memory override for unit tests (no DB write). */
export function setTogglesForTest(patch: Partial<Toggles> | Toggles) {
  cache = { ...DEFAULT_TOGGLES, ...patch };
  loaded = true;
  return cache;
}
