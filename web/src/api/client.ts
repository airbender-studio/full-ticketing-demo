export type Branding = {
  brandName: string;
  primary: string;
  secondary: string;
  mode: "light" | "dark";
  font: "dm-sans" | "space-grotesk" | "source-serif";
};

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
  holdSeconds: number;
  holdWarnSeconds: number;
};

export type MappingRecipe = {
  style: "clean" | "legacy";
  label: string;
  fields: Array<{ source: string; target: string; transform?: string }>;
  static: Array<{ target: string; value: unknown }>;
};

export type CustomerProfile = {
  slug: string;
  name: string;
  tagline: string;
  branding: Branding;
  story: {
    industry: string;
    hq: string;
    size: string;
    erpName: string;
    apiStyle: string;
    summary: string;
    howTheyWork: string[];
    painPoints: string[];
  };
  mapping: MappingRecipe;
};

/** @deprecated alias */
export type ClientBrand = CustomerProfile;

export type Venue = {
  id: string;
  slug: string;
  name: string;
  city: string;
  capacity: number;
  description: string;
  accent: string;
  rows: number;
  cols: number;
  availableSeats?: number;
  events: Array<{
    id: string;
    title: string;
    startsAt: string;
    priceCents: number;
  }>;
};

export type Seat = {
  id: string;
  label: string;
  row: number;
  col: number;
  section: string;
  status: "AVAILABLE" | "HELD" | "SOLD";
};

export type TicketPreview = {
  orderId: string;
  email: string;
  totalCents: number;
  currency: string;
  eventTitle: string;
  venueName: string;
  venueCity: string;
  startsAt: string;
  seats: Array<{ label: string; section: string }>;
  code: string;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  venues: () => req<Venue[]>("/api/venues"),
  venueSeats: (slug: string) =>
    req<{ venue: Venue; event: Venue["events"][0]; seats: Seat[] }>(`/api/venues/${slug}/seats`),
  holdConfig: () =>
    req<{ holdSeconds: number; holdWarnSeconds: number }>("/api/orders/hold-config"),
  hold: (eventId: string, seatIds: string[], refresh = false, holdToken?: string) =>
    req<{
      holdUntil: string;
      holdSeconds: number;
      holdWarnSeconds: number;
      seatIds: string[];
      holdToken: string;
    }>("/api/orders/hold", {
      method: "POST",
      body: JSON.stringify({ eventId, seatIds, refresh, holdToken }),
    }),
  release: (eventId: string, seatIds: string[]) =>
    req<{ released: number }>("/api/orders/release", {
      method: "POST",
      body: JSON.stringify({ eventId, seatIds }),
    }),
  checkout: (eventId: string, seatIds: string[], email: string, holdToken: string) =>
    req<{ id: string; totalCents: number; ticket: TicketPreview }>("/api/orders/checkout", {
      method: "POST",
      body: JSON.stringify({ eventId, seatIds, email, holdToken }),
    }),
  branding: () => req<Branding>("/api/admin/branding"),
  patchBranding: (patch: Partial<Branding>) =>
    req<Branding>("/api/admin/branding", { method: "PATCH", body: JSON.stringify(patch) }),
  clients: () => req<{ activeSlug: string; clients: CustomerProfile[] }>("/api/admin/clients"),
  client: (slug: string) => req<CustomerProfile>(`/api/admin/clients/${slug}`),
  mappingPreview: (slug: string) =>
    req<{
      client: { slug: string; name: string; style: string; label: string };
      recipe: MappingRecipe;
      canonical: unknown;
      mapped: unknown;
    }>(`/api/admin/clients/${slug}/mapping-preview`),
  activateClient: (slug: string) =>
    req<{ client: CustomerProfile; branding: Branding }>(`/api/admin/clients/${slug}/activate`, {
      method: "POST",
    }),
  toggles: () => req<Toggles>("/api/admin/toggles"),
  patchToggles: (patch: Partial<Toggles>) =>
    req<Toggles>("/api/admin/toggles", { method: "PATCH", body: JSON.stringify(patch) }),
  stats: () =>
    req<{
      orders: number;
      synced: number;
      failed: number;
      queued: number;
      erpQueueDepth: number;
      rateLimits: Array<{ bucket: string; count: number; remaining?: number }>;
    }>("/api/admin/stats"),
  events: () =>
    req<
      Array<{
        id: string;
        kind: string;
        level: string;
        message: string;
        meta?: unknown;
        createdAt: string;
      }>
    >("/api/admin/events"),
  reconcile: () => req<{ ok: boolean }>("/api/admin/reconcile", { method: "POST" }),
};
