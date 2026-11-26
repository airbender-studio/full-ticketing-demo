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

/**
 * Slow step-scroll to the absolute bottom, then linger.
 * Used on every information-heavy page — never flash.
 */
async function scrollToBottom(page: Page, opts?: { steps?: number; bottomLingerMs?: number }) {
  const steps = opts?.steps ?? 8;
  const bottomLinger = opts?.bottomLingerMs ?? Math.max(2500, pace * 2.5);
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(
      ({ i, steps }) => {
        const max = Math.max(
          0,
          Math.max(
            document.body.scrollHeight,
            document.documentElement.scrollHeight
          ) - window.innerHeight
        );
        window.scrollTo({ top: (max * i) / steps, behavior: "smooth" });
      },
      { i, steps }
    );
    await beat(page, Math.max(450, Math.floor(pace * 0.55)));
  }
  await page.evaluate(() => {
    const max = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    window.scrollTo({ top: max, behavior: "smooth" });
  });
  await linger(page, bottomLinger);
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
 * Grab-drag orbit on canvas (yaw+pitch), zoom in/out, reverse home.
 * Falls back to __demoCameraTour if canvas missing.
 */
async function cameraTour(page: Page, durationMs = 4200) {
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 12_000 });
  await beat(page, Math.floor(pace * 0.4));
  const canvas = page.locator("[data-testid=seat-canvas] canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.45;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + box.width * 0.28, cy + box.height * 0.16, { steps: 24 });
    await beat(page, Math.max(300, Math.floor(pace * 0.35)));
    await page.mouse.up();
    await beat(page, Math.max(250, Math.floor(pace * 0.3)));
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -420);
    await beat(page, Math.max(350, Math.floor(pace * 0.4)));
    await page.mouse.wheel(0, 420);
    await beat(page, Math.max(300, Math.floor(pace * 0.35)));
    await page.mouse.move(cx + box.width * 0.28, cy + box.height * 0.16);
    await page.mouse.down();
    await page.mouse.move(cx, cy, { steps: 24 });
    await page.mouse.up();
  } else {
    await page
      .waitForFunction(() => typeof window.__demoCameraTour === "function", null, { timeout: 5_000 })
      .catch(() => null);
    await page.evaluate(async (ms) => {
      await window.__demoCameraTour?.({ durationMs: ms });
    }, durationMs);
  }
  await beat(page, Math.floor(pace * 0.35));
}

async function openVenue(page: Page, slug: string, heading: RegExp) {
  await gotoLocal(page, `${BASE}/venues/${slug}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("quick-pick")).toBeVisible({ timeout: 10_000 });
}

/** Select seats → hold → checkout → phone ticket. */
async function purchaseWithPhoneTicket(page: Page) {
  console.log("[demo-e2e] quick-pick seats…");
  await page.getByTestId("email").fill("patron@example.com");

  const checkoutWait = page.waitForResponse(
    (r) => r.url().includes("/api/orders/checkout") && r.request().method() === "POST",
    { timeout: 30_000 }
  );

  await page.getByTestId("quick-pick").click();
  await expect(page.getByTestId("hold-timer")).toBeVisible({ timeout: 12_000 });
  await expect(page.getByTestId("buy")).toBeEnabled({ timeout: 12_000 });
  console.log("[demo-e2e] hold locked — Buy");
  await linger(page, pace);

  await page.getByTestId("buy").click();
  const checkoutRes = await checkoutWait;
  const status = checkoutRes.status();
  const bodyText = await checkoutRes.text().catch(() => "");
  console.log(`[demo-e2e] checkout → ${status}`);
  if (status >= 400) throw new Error(`Checkout failed (${status}): ${bodyText}`);

  const phone = page.getByTestId("ticket-phone");
  await phone.scrollIntoViewIfNeeded();
  await expect(phone).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Ticket delivery preview/i)).toBeVisible();
  console.log("[demo-e2e] phone ticket preview ✓");
  await linger(page, pace * 2);
  await scrollToBottom(page, { steps: 4, bottomLingerMs: Math.max(1800, pace * 1.5) });
}

function mappingLingerMs(mult = 5) {
  return Math.max(5500, Math.floor(pace * mult));
}

async function showMapping(page: Page, which: "harbor" | "bluebox") {
  console.log(`[demo-e2e] mapping → ${which}`);
  await gotoLocal(page, `${BASE}/customers/${which}/mapping`);
  await expect(page.getByTestId("mapping-page")).toBeVisible({ timeout: 12_000 });
  await linger(page, mappingLingerMs(4));

  await page.getByTestId("mapping-flow").scrollIntoViewIfNeeded();
  await linger(page, mappingLingerMs(3.5));

  await page.getByTestId("mapping-recipe").scrollIntoViewIfNeeded();
  await linger(page, mappingLingerMs(4));

  for (const id of ["mapping-json-before", "mapping-json-after"] as const) {
    const body = page.getByTestId(`${id}-body`);
    if (!(await body.isVisible().catch(() => false))) {
      await page.getByTestId(`${id}-toggle`).click();
      await beat(page, Math.max(400, pace * 0.5));
    }
    await expect(page.getByTestId(`${id}-body`)).toBeVisible();
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    await linger(page, mappingLingerMs(4.5));
  }

  await scrollToBottom(page, { steps: 8, bottomLingerMs: mappingLingerMs(5) });
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

  // ── 1. Storefront — fast ready check, then move on ──────────────
  await gotoLocal(page, `${BASE}/`);
  await expect(page.getByRole("link", { name: /View seat map/i }).first()).toBeVisible({
    timeout: 8_000,
  });
  // Soft brand glance (2s max) — do NOT block the demo
  await page
    .getByTestId("brand-name")
    .waitFor({ state: "visible", timeout: 2_000 })
    .catch(() => null);
  await linger(page, pace);
  await scrollToBottom(page, { steps: 5, bottomLingerMs: Math.max(1500, pace) });

  // ── 2. Studio: seats → hold → checkout → phone ticket → orbit ───
  await openVenue(page, "studio-100", /Bluebox Studio/i);
  await linger(page, pace * 0.8);
  await purchaseWithPhoneTicket(page);
  await cameraTour(page, 4000);
  await linger(page, pace * 0.8);

  // ── 3. Visualizer — scroll to bottom ────────────────────────────
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
  await scrollToBottom(page, { steps: 8, bottomLingerMs: Math.max(3000, pace * 2.5) });

  // ── 4. Customers — activate Harbor via API, profiles, mapping ───
  await gotoLocal(page, `${BASE}/customers`);
  await expect(page.getByTestId("customer-bluebox")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("customer-harbor")).toBeVisible();
  await linger(page, pace);
  await scrollToBottom(page, { steps: 6, bottomLingerMs: Math.max(2200, pace * 2) });

  await activateClientApi(page, "harbor");
  await gotoLocal(page, `${BASE}/customers/harbor`);
  await expect(page.getByRole("heading", { name: /Harbor Live/i })).toBeVisible({
    timeout: 10_000,
  });
  await linger(page, pace * 1.2);
  await scrollToBottom(page, { steps: 6, bottomLingerMs: Math.max(2200, pace * 2) });

  await showMapping(page, "harbor");
  await showMapping(page, "bluebox");

  await activateClientApi(page, "bluebox");
  await gotoLocal(page, `${BASE}/customers/bluebox`);
  await expect(page.getByRole("heading", { name: /Bluebox Arts/i })).toBeVisible({
    timeout: 10_000,
  });
  await linger(page, pace);
  await scrollToBottom(page, { steps: 5, bottomLingerMs: Math.max(1800, pace * 1.5) });

  // ── 5. Other venues — natural orbit ─────────────────────────────
  await openVenue(page, "hall-500", /Riverfront Hall/i);
  await linger(page, pace * 0.6);
  await cameraTour(page, 3800);

  await openVenue(page, "arena-1000", /Harbor Arena/i);
  await linger(page, pace * 0.6);
  await cameraTour(page, 4000);

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
  await scrollToBottom(page, { steps: 10, bottomLingerMs: Math.max(4000, pace * 3.5) });

  // ── 7. Branding + ticket — scroll bottoms ───────────────────────
  await gotoLocal(page, `${BASE}/branding`);
  await expect(page.getByTestId("client-card-bluebox")).toBeVisible({ timeout: 8_000 });
  await linger(page, pace);
  await scrollToBottom(page, { steps: 6, bottomLingerMs: Math.max(2000, pace * 2) });

  await gotoLocal(page, `${BASE}/ticket`);
  await expect(page.getByTestId("ticket-phone")).toBeVisible({ timeout: 8_000 });
  await linger(page, pace);
  await scrollToBottom(page, { steps: 4, bottomLingerMs: Math.max(1500, pace) });

  // Final storefront linger
  await gotoLocal(page, `${BASE}/`);
  await expect(page.getByRole("link", { name: /View seat map/i }).first()).toBeVisible({
    timeout: 8_000,
  });
  await linger(page, Math.max(pace * 2.5, 2000));
});
