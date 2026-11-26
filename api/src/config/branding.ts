import { prisma } from "../lib/prisma.js";

export type Branding = {
  brandName: string;
  primary: string;
  secondary: string;
  mode: "light" | "dark";
  font: "dm-sans" | "space-grotesk" | "source-serif";
};

export const DEFAULT_BRANDING: Branding = {
  brandName: "Bluebox Tickets",
  primary: "#1565C0",
  secondary: "#0EA5E9",
  mode: "light",
  font: "dm-sans",
};

let cache: Branding = { ...DEFAULT_BRANDING };
let loaded = false;

export async function loadBranding(): Promise<Branding> {
  const row = await prisma.integrationConfig.findUnique({ where: { id: 2 } });
  cache = { ...DEFAULT_BRANDING, ...((row?.value as Partial<Branding>) ?? {}) };
  loaded = true;
  return cache;
}

export function getBranding(): Branding {
  return loaded ? cache : { ...DEFAULT_BRANDING };
}

export async function updateBranding(patch: Partial<Branding>): Promise<Branding> {
  const next = { ...getBranding(), ...patch };
  await prisma.integrationConfig.upsert({
    where: { id: 2 },
    create: { id: 2, value: next },
    update: { value: next },
  });
  cache = next;
  loaded = true;
  return cache;
}
