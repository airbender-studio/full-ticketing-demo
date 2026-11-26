import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:5173";
const API = process.env.DEMO_API_URL ?? "http://localhost:4000";

/** Showcase pacing. Default ~1s between major beats when headed. */
const pace = Number(
  process.env.DEMO_PACE_MS ?? (process.env.HEADED === "0" ? 0 : 1000)
);

function isAllowedUrl(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol === "about:" || u.protocol === "data:" || u.protocol === "blob:") return true;
    if (u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return false;
    return u.port === "5173" || u.port === "4000" || u.port === "";
  } catch {
    return false;
  }
}

async function gotoLocal(page: Page, url: string) {
  if (!isAllowedUrl(url)) {
    throw new Error(`Refusing navigation outside localhost demo hosts: ${url}`);
  }
  const res = await page.goto(url, { waitUntil: "domcontentloaded" });
  const finalUrl = page.url();
  if (!isAllowedUrl(finalUrl)) {
    throw new Error(`Landed off-localhost after goto(${url}): ${finalUrl}`);
  }
  if (res && res.status() >= 400) {
    throw new Error(`Bad status ${res.status()} for ${url}`);
  }
  return res;
}

async function beat(page: Page, ms = pace) {
  const wait = pace > 0 ? Math.max(ms, Math.floor(pace * 0.8)) : 0;
  if (wait > 0) await page.waitForTimeout(wait);
}

async function linger(page: Page, ms = pace * 2) {
  await beat(page, ms);
}

/** ONE smooth scroll to the lower third — no step loops, no double nudges. */
async function scrollToLower(page: Page, opts?: { lingerMs?: number }) {
  const lingerMs = opts?.lingerMs ?? Math.max(2500, pace * 2.5);
  await page.evaluate(() => {
    const max = Math.max(
      0,
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
        window.innerHeight
    );
    window.scrollTo({ top: max * 0.72, behavior: "smooth" });
  });
  // Wait for smooth scroll to settle
  await page.waitForFunction(() => {
    const max = Math.max(
      0,
      Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) -
        window.innerHeight
    );
    if (max < 40) return true;
    const target = max * 0.72;
    return Math.abs(window.scrollY - target) < max * 0.08;
  }, null, { timeout: 4_000 }).catch(() => null);
  await beat(page, Math.max(600, Math.floor(pace * 0.6)));
  await linger(page, lingerMs);
}

/** Activate client via API — never hang on MUI Select. Soft brand check only. */
async function activateClientApi(page: Page, slug: "bluebox" | "harbor") {
  const res = await page.request.post(`${API}/api/admin/clients/${slug}/activate`);
  if (!res.ok()) {
    throw new Error(`activate ${slug} → ${res.status()} ${await res.text()}`);
  }
  console.log(`[demo-e2e] activated ${slug} via API`);
}

/**
 * Choreographed slider tour: ALL sliders move together to different peaks,
 * then all return to their starting values (seamless — not one-at-a-time).
 */
async function playVisualizerSliders(page: Page) {
  console.log("[demo-e2e] visualizer slider choreography (all together → home)");
  await page.getByRole("heading", { name: "Integration toggles" }).scrollIntoViewIfNeeded();
  await expect(page.getByTestId("slider-rate-limit")).toBeVisible({ timeout: 8_000 });
  await linger(page, Math.max(600, pace * 0.6));

  await page.waitForFunction(() => typeof window.__demoSliderTour === "function", null, {
    timeout: 10_000,
  });
  // ~2.4s out + hold + ~2.4s back
  await page.evaluate(async () => {
    await window.__demoSliderTour?.({ durationMs: 2400 });
  });
  await linger(page, Math.max(1200, pace * 1.2));
}

/**
 * Arena: far-right + strong tilt + zoom 3x → pause → reverse (no zoom).
 */
async function cameraTour(page: Page, durationMs = 8000) {
  console.log("[demo-e2e] camera TOUR (arena): far-right + strong tilt + zoom 3x");
  const canvasWrap = page.getByTestId("seat-canvas");
  await expect(canvasWrap).toBeVisible({ timeout: 12_000 });
  await canvasWrap.scrollIntoViewIfNeeded();
  await beat(page, Math.max(500, Math.floor(pace * 0.5)));
  await page.waitForFunction(() => typeof window.__demoCameraTour === "function", null, {
    timeout: 8_000,
  });
  await page.evaluate(async (ms) => {
    await window.__demoCameraTour?.({ durationMs: ms });
  }, durationMs);
  console.log("[demo-e2e] camera tour done");
}

/** Other venues: brief left → right peek once, light tilt. */
async function cameraPeek(page: Page, durationMs = 3200) {
  console.log("[demo-e2e] camera PEEK: left then right once");
  const canvasWrap = page.getByTestId("seat-canvas");
  await expect(canvasWrap).toBeVisible({ timeout: 12_000 });
  await canvasWrap.scrollIntoViewIfNeeded();
  await beat(page, Math.max(400, Math.floor(pace * 0.4)));
  await page.waitForFunction(() => typeof window.__demoCameraPeek === "function", null, {
    timeout: 8_000,
  });
  await page.evaluate(async (ms) => {
    await window.__demoCameraPeek?.({ durationMs: ms });
  }, durationMs);
  console.log("[demo-e2e] camera peek done");
}

async function openVenue(page: Page, slug: string, heading: RegExp) {
  await gotoLocal(page, `${BASE}/venues/${slug}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("quick-pick")).toBeVisible({ timeout: 10_000 });
}

/**
 * Full purchase beat — must visibly succeed and LINGER on success + phone ticket
 * before any later navigation (visualizer, etc.).
 */
async function purchaseWithPhoneTicket(page: Page) {
  console.log("[demo-e2e] === PURCHASE: select seats ===");
  await page.getByTestId("email").fill("patron@example.com");

  const holdWait = page.waitForResponse(
    (r) => r.url().includes("/api/orders/hold") && r.request().method() === "POST",
    { timeout: 20_000 }
  );
  const checkoutWait = page.waitForResponse(
    (r) => r.url().includes("/api/orders/checkout") && r.request().method() === "POST",
    { timeout: 30_000 }
  );

  await page.getByTestId("quick-pick").click();
  // Seat chips should appear (visible selection)
  await expect(page.getByTestId("hold-timer")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
  const holdRes = await holdWait.catch(() => null);
  console.log(
    `[demo-e2e] hold → ${holdRes?.status() ?? "ok"} — seats locked, linger so selection reads`
  );
  await expect(page.getByTestId("buy")).toBeEnabled({ timeout: 12_000 });
  await linger(page, Math.max(2500, pace * 2.5));

  console.log("[demo-e2e] === PURCHASE: Buy / checkout ===");
  await page.getByTestId("buy").click();
  const checkoutRes = await checkoutWait;
  const status = checkoutRes.status();
  const bodyText = await checkoutRes.text().catch(() => "");
  console.log(`[demo-e2e] checkout → ${status} ${bodyText.slice(0, 120)}`);
  if (status !== 201) {
    throw new Error(`Checkout expected 201, got ${status}: ${bodyText}`);
  }

  // Success banner + phone ticket MODAL — hard linger
  const success = page.getByTestId("checkout-success");
  await expect(success).toBeVisible({ timeout: 20_000 });
  console.log("[demo-e2e] checkout success banner visible");

  const modal = page.getByTestId("ticket-preview");
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("ticket-phone")).toBeVisible({ timeout: 10_000 });
  console.log("[demo-e2e] phone ticket MODAL visible — lingering");
  await linger(page, Math.max(6000, pace * 6));
  await page.getByTestId("ticket-dismiss").click();
  await expect(modal).toBeHidden({ timeout: 5_000 });
  console.log("[demo-e2e] === PURCHASE COMPLETE ===");
}

/** Mapping beat — short glance, one smooth lower-third scroll (no mid jumps). */
async function showMapping(page: Page, which: "harbor" | "bluebox") {
  console.log(`[demo-e2e] mapping → ${which}`);
  await gotoLocal(page, `${BASE}/customers/${which}/mapping`);
  await expect(page.getByTestId("mapping-page")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByRole("heading", { name: /Payload mapping/i })).toBeVisible();
  await linger(page, Math.max(1200, pace * 1.2));

  // Expand JSON panels if collapsed — do not scrollIntoView (that jumps mid-page)
  for (const id of ["mapping-json-before", "mapping-json-after"] as const) {
    const body = page.getByTestId(`${id}-body`);
    if (!(await body.isVisible().catch(() => false))) {
      await page.getByTestId(`${id}-toggle`).click();
      await beat(page, Math.max(250, Math.floor(pace * 0.25)));
    }
  }

  // One smooth scroll to lower third, brief linger — then leave
  await scrollToLower(page, { lingerMs: Math.max(1400, pace * 1.4) });
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page, context }) => {
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (req.resourceType() === "document") {
      const url = req.url();
      if (!isAllowedUrl(url)) {
        console.error(`[demo-e2e] blocked off-localhost: ${url}`);
        await route.abort("blockedbyclient");
        return;
      }
    }
    await route.continue();
  });

  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    const url = frame.url();
    if (url && url !== "about:blank" && !isAllowedUrl(url)) {
      throw new Error(`[demo-e2e] left localhost: ${url}`);
    }
  });
});

test("paced visual walkthrough: seats → ticket → ERP → customers → swagger", async ({
  page,
}) => {
  // ── 0. Activate Bluebox via API BEFORE home — never hang on Select ──
  await activateClientApi(page, "bluebox");

  // ── 1. Storefront — brief glance, then straight to purchase ──────
  await gotoLocal(page, `${BASE}/`);
  await expect(page.getByRole("link", { name: /View seat map/i }).first()).toBeVisible({
    timeout: 12_000,
  });
  await linger(page, Math.max(1500, pace * 1.5));

  // ── 2. Arena FIRST: full strong tilt tour → checkout ONCE → phone modal ──
  await openVenue(page, "arena-1000", /Harbor Arena/i);
  await linger(page, pace);
  await cameraTour(page);
  await purchaseWithPhoneTicket(page);
  await linger(page, pace * 0.8);

  // ── 3. Visualizer — drag sliders, then scroll to bottom ─────────
  await gotoLocal(page, `${BASE}/visualizer`);
  await expect(page.getByRole("heading", { name: "API Visualizer" })).toBeVisible({
    timeout: 10_000,
  });
  await linger(page, pace * 1.2);
  await expect(page.getByText("ERP rate limit")).toBeVisible();
  await expect(page.getByText("Idempotency")).toBeVisible();
  await page
    .getByText(/erp_sync|order_complete|hold|webhook|hmac/i)
    .first()
    .waitFor({ state: "visible", timeout: 10_000 })
    .catch(() => null);

  await playVisualizerSliders(page);

  await scrollToLower(page, { lingerMs: Math.max(3000, pace * 2.5) });

  // ── 4. Customers — activate Harbor via API, profiles, mapping ───
  await gotoLocal(page, `${BASE}/customers`);
  await expect(page.getByTestId("customer-bluebox")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("customer-harbor")).toBeVisible();
  await linger(page, pace);
  await scrollToLower(page, { lingerMs: Math.max(2200, pace * 2) });

  await activateClientApi(page, "harbor");
  await gotoLocal(page, `${BASE}/customers/harbor`);
  await expect(page.getByRole("heading", { name: /Harbor Live/i })).toBeVisible({
    timeout: 10_000,
  });
  await linger(page, pace * 1.2);
  await scrollToLower(page, { lingerMs: Math.max(2200, pace * 2) });

  await showMapping(page, "harbor");
  await showMapping(page, "bluebox");

  await activateClientApi(page, "bluebox");
  await gotoLocal(page, `${BASE}/customers/bluebox`);
  await expect(page.getByRole("heading", { name: /Bluebox Arts/i })).toBeVisible({
    timeout: 10_000,
  });
  await linger(page, pace);
  await scrollToLower(page, { lingerMs: Math.max(1800, pace * 1.5) });

  // ── 5. Other venues — brief left/right peek only (no checkout) ──
  await openVenue(page, "studio-100", /Bluebox Studio/i);
  await linger(page, Math.max(800, pace * 0.8));
  await cameraPeek(page);

  await openVenue(page, "hall-500", /Riverfront Hall/i);
  await linger(page, Math.max(800, pace * 0.8));
  await cameraPeek(page);

  // ── 6. Swagger — scroll fully to bottom ─────────────────────────
  await gotoLocal(page, `${API}/docs`);
  await expect(
    page.locator(".swagger-ui, #swagger-ui, .information-container").first()
  ).toBeVisible({ timeout: 12_000 });
  await linger(page, pace * 1.5);
  const op = page.locator(".opblock").first();
  if (await op.count()) {
    await op.click();
    await beat(page, pace * 0.6);
  }
  await scrollToLower(page, { lingerMs: Math.max(4000, pace * 3.5) });

  // ── 7. Branding + ticket — scroll bottoms ───────────────────────
  await gotoLocal(page, `${BASE}/branding`);
  await expect(page.getByTestId("client-card-bluebox")).toBeVisible({ timeout: 8_000 });
  await linger(page, pace);
  await scrollToLower(page, { lingerMs: Math.max(2000, pace * 2) });

  await gotoLocal(page, `${BASE}/ticket`);
  await expect(page.getByTestId("ticket-phone")).toBeVisible({ timeout: 8_000 });
  await linger(page, pace);
  await scrollToLower(page, { lingerMs: Math.max(1500, pace) });

  // Final storefront linger
  await gotoLocal(page, `${BASE}/`);
  await expect(page.getByRole("link", { name: /View seat map/i }).first()).toBeVisible({
    timeout: 8_000,
  });
  await linger(page, Math.max(pace * 2.5, 2000));
});
