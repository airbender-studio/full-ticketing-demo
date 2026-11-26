import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const API = process.env.DEMO_API_URL ?? "http://localhost:4000";

/** Showcase pacing. Default ~1s between major beats when headed. */
const pace = Number(
  process.env.DEMO_PACE_MS ?? (process.env.HEADED === "0" ? 0 : 1000)
);

async function beat(page: Page, ms = pace) {
  const wait = pace > 0 ? Math.max(ms, Math.floor(pace * 0.8)) : 0;
  if (wait > 0) await page.waitForTimeout(wait);
}

async function linger(page: Page, ms = pace * 2) {
  await beat(page, ms);
}

/** Wait for Three.js map + demo camera helper, then run orbit→zoom-in→zoom-out→home. */
async function cameraTour(page: Page, durationMs = 3400) {
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => typeof window.__demoCameraTour === "function", null, {
    timeout: 15_000,
  });
  await beat(page, Math.floor(pace * 0.6));
  await page.evaluate(async (ms) => {
    await window.__demoCameraTour?.({ durationMs: ms });
  }, durationMs);
  await beat(page, Math.floor(pace * 0.5));
}

async function openVenue(page: Page, slug: string, heading: RegExp) {
  await page.goto(`${BASE}/venues/${slug}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quick-pick")).toBeVisible({ timeout: 15_000 });
}

async function switchClient(page: Page, label: RegExp) {
  // MUI Select — click the visible combobox (data-testid on Select, not hidden input).
  await page.getByTestId("client-switch").click();
  await page.getByRole("option", { name: label }).click();
}

test.describe.configure({ mode: "serial" });

test("paced visual walkthrough: seats → ticket → ERP → customers → swagger", async ({
  page,
}) => {
  // ── 1. Storefront ──────────────────────────────────────────────
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/localhost:5173/);
  await expect(page.getByTestId("client-switch")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 2 })).toContainText(/Bluebox|Harbor/i);
  await expect(page.getByRole("link", { name: /View seat map/i })).toHaveCount(3);
  await linger(page, pace * 1.5);

  // Ensure Bluebox skin for the purchase beat
  await switchClient(page, /Bluebox Arts/i);
  await expect(page.getByRole("link", { name: /Bluebox Arts/i }).first()).toBeVisible();
  await beat(page);

  // ── 2. Studio venue: camera tour → pick seats → checkout → phone ticket ──
  await openVenue(page, "studio-100", /Bluebox Studio/i);
  await linger(page, pace);
  await cameraTour(page, 3600);

  // Visible seat selection (quick-pick lifts two available seats + chips)
  await page.getByTestId("quick-pick").click();
  await expect(page.getByTestId("hold-timer")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
  await linger(page, pace * 1.4);

  await page.getByTestId("buy").click();
  await expect(page.getByTestId("ticket-phone")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Ticket delivery preview/i)).toBeVisible();
  await linger(page, pace * 2);

  // ── 3. ERP / retry side — visualizer ────────────────────────────
  await page.getByRole("link", { name: "API Visualizer" }).click();
  await expect(page.getByRole("heading", { name: "API Visualizer" })).toBeVisible();
  await expect(page.getByText(/ERP synced|Queue depth|Integration toggles/i).first()).toBeVisible();
  await linger(page, pace);

  // Surface rate-limit / idempotency / chaos story
  await expect(page.getByText("ERP rate limit")).toBeVisible();
  await expect(page.getByText("Idempotency")).toBeVisible();
  await page.getByText("ERP fail chaos", { exact: false }).scrollIntoViewIfNeeded();
  await linger(page, pace);

  // Event stream should show pipeline after the sale
  await expect(
    page.getByText(/erp_sync|order_complete|hold|checkout|webhook/i).first()
  ).toBeVisible({ timeout: 15_000 });
  await page.locator(".log-row").first().scrollIntoViewIfNeeded().catch(() => {});
  await linger(page, pace * 2.2);

  // ── 4. Customer profiles + mapping gloss ────────────────────────
  await page.getByRole("link", { name: "Customers" }).click();
  await expect(page.getByRole("heading", { name: /Customer profiles/i })).toBeVisible();
  await expect(page.getByTestId("customer-bluebox")).toBeVisible();
  await expect(page.getByTestId("customer-harbor")).toBeVisible();
  await linger(page, pace * 1.2);

  // Activate Harbor — branding should flip
  await page.getByTestId("customer-harbor").getByRole("button", { name: /Activate/i }).click();
  await expect(page.getByRole("link", { name: /Harbor Live/i }).first()).toBeVisible();
  await linger(page, pace * 1.2);

  await page.getByTestId("customer-harbor").getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: /Harbor Live/i })).toBeVisible();
  await expect(page.getByText(/Pain points|How their API works/i).first()).toBeVisible();
  await linger(page, pace * 1.5);

  await page.getByRole("link", { name: /Open JSON mapping|JSON mapping/i }).first().click();
  await expect(page.getByRole("heading", { name: /Payload mapping/i })).toBeVisible();
  await expect(page.getByText(/Canonical|Mapped|Recipe/i).first()).toBeVisible();
  await linger(page, pace * 1.5);

  // Bluebox clean recipe for contrast
  await page.getByRole("link", { name: /Bluebox \(clean\)/i }).click();
  await expect(page.getByText(/Clean recipe/i)).toBeVisible();
  await linger(page, pace * 1.2);

  await page.getByRole("link", { name: "Customers" }).click();
  await page.getByTestId("customer-bluebox").getByRole("button", { name: /Activate|Active skin/i }).click();
  await expect(page.getByRole("link", { name: /Bluebox Arts/i }).first()).toBeVisible();
  await page.getByTestId("customer-bluebox").getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: /Bluebox/i })).toBeVisible();
  await linger(page, pace);

  // ── 5. Remaining venues — camera tour on each ───────────────────
  await openVenue(page, "hall-500", /Riverfront Hall/i);
  await linger(page, pace * 0.8);
  await cameraTour(page, 3400);

  await openVenue(page, "arena-1000", /Harbor Arena/i);
  await linger(page, pace * 0.8);
  await cameraTour(page, 3600);

  // ── 6. Swagger / API docs — linger + scroll so endpoints show ───
  await page.goto(`${API}/docs`, { waitUntil: "domcontentloaded" });
  await expect(page).toHaveURL(/localhost:4000\/docs/);
  await expect(page.locator(".swagger-ui, #swagger-ui, .information-container").first()).toBeVisible({
    timeout: 20_000,
  });
  await linger(page, pace * 1.5);

  // Expand a few operations so the API surface is readable
  const op = page.locator(".opblock").first();
  if (await op.count()) {
    await op.click();
    await beat(page, pace);
  }
  await page.evaluate(() => window.scrollBy(0, 480));
  await linger(page, pace * 1.2);
  await page.evaluate(() => window.scrollBy(0, 480));
  await linger(page, pace * 1.5);

  // Optional quick branding + ticket pages
  await page.goto(`${BASE}/branding`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("client-card-bluebox")).toBeVisible();
  await expect(page.getByTestId("client-card-harbor")).toBeVisible();
  await linger(page, pace);

  await page.goto(`${BASE}/ticket`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("ticket-phone")).toBeVisible({ timeout: 10_000 });
  await linger(page, pace * 1.2);

  // Back to storefront — final linger so the browser doesn't slam shut
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /View seat map/i }).first()).toBeVisible();
  await linger(page, Math.max(pace * 3, 2500));
});
