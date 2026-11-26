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

/** Navigate only to localhost demo hosts; fail fast if anything else wins. */
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
 * Grab-style OrbitControls tour via __demoCameraTour:
 * drag yaw+pitch to one side → zoom in → zoom out → reverse drag home.
 */
async function cameraTour(page: Page, durationMs = 5600) {
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => typeof window.__demoCameraTour === "function", null, {
    timeout: 15_000,
  });
  await beat(page, Math.floor(pace * 0.5));
  // Prefer real pointer grab on the canvas (OrbitControls), then fall back to helper.
  const canvas = page.locator("[data-testid=seat-canvas] canvas").first();
  const box = await canvas.boundingBox();
  if (box) {
    const cx = box.x + box.width * 0.5;
    const cy = box.y + box.height * 0.45;
    // 1) Grab-drag to one side while tilting (yaw + pitch together)
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + box.width * 0.28, cy + box.height * 0.16, { steps: 28 });
    await beat(page, Math.max(400, Math.floor(pace * 0.4)));
    await page.mouse.up();
    await beat(page, Math.max(350, Math.floor(pace * 0.35)));
    // 2) Zoom in · 3) Zoom out
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -420);
    await beat(page, Math.max(500, Math.floor(pace * 0.5)));
    await page.mouse.wheel(0, 420);
    await beat(page, Math.max(400, Math.floor(pace * 0.4)));
    // 4) Reverse drag home
    await page.mouse.move(cx + box.width * 0.28, cy + box.height * 0.16);
    await page.mouse.down();
    await page.mouse.move(cx, cy, { steps: 28 });
    await page.mouse.up();
    await beat(page, Math.max(400, Math.floor(pace * 0.4)));
  } else {
    await page.evaluate(async (ms) => {
      await window.__demoCameraTour?.({ durationMs: ms });
    }, durationMs);
  }
  await beat(page, Math.floor(pace * 0.4));
}

async function openVenue(page: Page, slug: string, heading: RegExp) {
  await gotoLocal(page, `${BASE}/venues/${slug}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quick-pick")).toBeVisible({ timeout: 15_000 });
}

/** Clients from seed/clients.ts — MenuItem value is slug; label is display name. */
const CLIENTS = {
  bluebox: { slug: "bluebox", name: /Bluebox Arts/i },
  harbor: { slug: "harbor", name: /Harbor Live/i },
} as const;

async function switchClient(page: Page, which: keyof typeof CLIENTS) {
  const { slug, name } = CLIENTS[which];
  const select = page.getByTestId("client-switch");
  await expect(select).toBeVisible();
  await select.click();
  // Prefer slug data-value — more stable than accessible name matching
  const opt = page.locator(`li[data-value="${slug}"], [role="option"][data-value="${slug}"]`);
  await expect(opt).toBeVisible({ timeout: 10_000 });
  await opt.click();
  await expect(page.getByTestId("brand-name")).toHaveText(name, { timeout: 15_000 });
}

/** Select seats → hold → checkout → phone ticket (must visibly succeed). */
async function purchaseWithPhoneTicket(page: Page) {
  console.log("[demo-e2e] quick-pick seats…");
  await page.getByTestId("email").fill("patron@example.com");

  const checkoutWait = page.waitForResponse(
    (r) => r.url().includes("/api/orders/checkout") && r.request().method() === "POST",
    { timeout: 30_000 }
  );

  await page.getByTestId("quick-pick").click();

  // Hold is debounced ~350ms — wait until timer + Buy enabled
  await expect(page.getByTestId("hold-timer")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
  await expect(page.getByTestId("buy")).toBeEnabled({ timeout: 15_000 });
  console.log("[demo-e2e] hold locked — clicking Buy");
  await linger(page, pace * 1.2);

  await page.getByTestId("buy").click();

  const checkoutRes = await checkoutWait;
  const status = checkoutRes.status();
  const bodyText = await checkoutRes.text().catch(() => "");
  console.log(`[demo-e2e] checkout → ${status} ${bodyText.slice(0, 180)}`);
  if (status >= 400) {
    throw new Error(`Checkout failed (${status}): ${bodyText}`);
  }

  const phone = page.getByTestId("ticket-phone");
  await phone.scrollIntoViewIfNeeded();
  await expect(phone).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText(/Ticket delivery preview/i)).toBeVisible();
  console.log("[demo-e2e] phone ticket preview visible ✓");
  await linger(page, pace * 2.5);
}

/** Mapping is a showcase beat — never flash. ~5–8s+ floor per pause. */
function mappingLingerMs(mult = 5) {
  return Math.max(5500, Math.floor(pace * mult));
}

/** Slow step-scroll so the mapping page is readable, not a jump. */
async function slowScrollMapping(page: Page) {
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    await page.evaluate(
      ({ i, steps }) => {
        const max = Math.max(0, document.body.scrollHeight - window.innerHeight);
        window.scrollTo({ top: (max * i) / steps, behavior: "smooth" });
      },
      { i, steps }
    );
    await beat(page, Math.max(900, Math.floor(pace * 0.9)));
  }
}

async function showMapping(page: Page, which: "harbor" | "bluebox") {
  console.log(`[demo-e2e] mapping linger → ${which}`);
  await gotoLocal(page, `${BASE}/customers/${which}/mapping`);
  await expect(page.getByTestId("mapping-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /Payload mapping/i })).toBeVisible();
  // Hero / title — sit here so the recipe story lands
  await linger(page, mappingLingerMs(5));

  await page.getByTestId("mapping-flow").scrollIntoViewIfNeeded();
  await linger(page, mappingLingerMs(4.5));

  await page.getByTestId("mapping-recipe").scrollIntoViewIfNeeded();
  await linger(page, mappingLingerMs(5));

  // Force JSON panels open and linger on before → after
  for (const id of ["mapping-json-before", "mapping-json-after"] as const) {
    const body = page.getByTestId(`${id}-body`);
    if (!(await body.isVisible().catch(() => false))) {
      await page.getByTestId(`${id}-toggle`).click();
      await beat(page, Math.max(600, pace));
    }
    await expect(page.getByTestId(`${id}-body`)).toBeVisible();
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    // Scroll inside the JSON pre a bit so the transform is obvious
    await page.evaluate((tid) => {
      const el = document.querySelector(`[data-testid="${tid}-body"]`);
      if (el) el.scrollTop = 0;
    }, id);
    await linger(page, mappingLingerMs(5.5));
    await page.evaluate((tid) => {
      const el = document.querySelector(`[data-testid="${tid}-body"]`);
      if (el) el.scrollTop = el.scrollHeight;
    }, id);
    await linger(page, mappingLingerMs(4));
  }

  await slowScrollMapping(page);
  await linger(page, mappingLingerMs(6));
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  await linger(page, mappingLingerMs(4));
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page, context }) => {
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (req.resourceType() === "document") {
      const url = req.url();
      if (!isAllowedUrl(url)) {
        console.error(`[demo-e2e] blocked off-localhost navigation: ${url}`);
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
      throw new Error(`[demo-e2e] main frame left localhost: ${url}`);
    }
  });
});

test("paced visual walkthrough: seats → ticket → ERP → customers → swagger", async ({
  page,
}) => {
  // ── 1. Storefront ──────────────────────────────────────────────
  await gotoLocal(page, `${BASE}/`);
  await expect(page).toHaveURL(/http:\/\/localhost:5173\/?$/);
  await expect(page.getByTestId("client-switch")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { level: 2 })).toContainText(/Bluebox|Harbor/i);
  await expect(page.getByRole("link", { name: /View seat map/i })).toHaveCount(3);
  await linger(page, pace * 1.5);

  await switchClient(page, "bluebox");
  await expect(page.getByTestId("brand-name")).toHaveText(/Bluebox Arts/i);
  await expect(page.getByRole("heading", { level: 2 })).toContainText(/Bluebox Arts/i);
  await beat(page);

  // ── 2. Studio: brief map → seats → hold → checkout → phone ticket ──
  // Camera tour AFTER purchase so the hold clock isn't racing the showcase spin.
  await openVenue(page, "studio-100", /Bluebox Studio/i);
  await linger(page, pace);
  await purchaseWithPhoneTicket(page);
  await cameraTour(page, 3600);
  await linger(page, pace);

  // ── 3. ERP / retry side — visualizer ────────────────────────────
  await page.getByRole("link", { name: "API Visualizer" }).click();
  await expect(page).toHaveURL(/localhost:5173\/visualizer/);
  await expect(page.getByRole("heading", { name: "API Visualizer" })).toBeVisible();
  await expect(page.getByText(/ERP synced|Queue depth|Integration toggles/i).first()).toBeVisible();
  await linger(page, pace * 1.5);

  await expect(page.getByText("ERP rate limit")).toBeVisible();
  await expect(page.getByText("Idempotency")).toBeVisible();
  await page.getByText("ERP fail chaos", { exact: false }).scrollIntoViewIfNeeded();
  await linger(page, pace * 1.2);

  await expect(
    page.getByText(/erp_sync|order_complete|hold|checkout|webhook|hmac/i).first()
  ).toBeVisible({ timeout: 15_000 });
  await page.locator(".log-row").first().scrollIntoViewIfNeeded().catch(() => {});
  await linger(page, pace * 2.5);

  // ── 4. Customer profiles + mapping gloss (linger hard) ──────────
  await page.getByRole("link", { name: "Customers" }).click();
  await expect(page).toHaveURL(/localhost:5173\/customers/);
  await expect(page.getByRole("heading", { name: /Customer profiles/i })).toBeVisible();
  await expect(page.getByTestId("customer-bluebox")).toBeVisible();
  await expect(page.getByTestId("customer-harbor")).toBeVisible();
  await linger(page, pace * 1.5);

  await page.getByTestId("customer-harbor").getByRole("button", { name: /Activate/i }).click();
  await expect(page.getByTestId("brand-name")).toHaveText(/Harbor Live/i, { timeout: 15_000 });
  await linger(page, pace * 1.2);

  await page.getByTestId("customer-harbor").getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: /Harbor Live/i })).toBeVisible();
  await linger(page, pace * 1.5);

  // Harbor legacy + Bluebox clean — expand JSON, scroll, linger hard
  await showMapping(page, "harbor");
  await showMapping(page, "bluebox");
  await expect(page.getByText(/Clean recipe/i)).toBeVisible();

  await page.getByRole("link", { name: "Customers" }).click();
  await page
    .getByTestId("customer-bluebox")
    .getByRole("button", { name: /Activate|Active skin/i })
    .click();
  await expect(page.getByTestId("brand-name")).toHaveText(/Bluebox Arts/i, { timeout: 15_000 });
  await page.getByTestId("customer-bluebox").getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: /Bluebox Arts/i })).toBeVisible();
  await linger(page, pace);

  // ── 5. Remaining venues — camera tour (orbit + tilt + zoom) ─────
  await openVenue(page, "hall-500", /Riverfront Hall/i);
  await linger(page, pace * 0.8);
  await cameraTour(page, 3400);

  await openVenue(page, "arena-1000", /Harbor Arena/i);
  await linger(page, pace * 0.8);
  await cameraTour(page, 3600);

  // ── 6. Swagger — scroll to bottom, linger longer ────────────────
  await gotoLocal(page, `${API}/docs`);
  await expect(page).toHaveURL(/http:\/\/localhost:4000\/docs\/?/);
  await expect(
    page.locator(".swagger-ui, #swagger-ui, .information-container").first()
  ).toBeVisible({ timeout: 20_000 });
  await linger(page, pace * 2);

  const op = page.locator(".opblock").first();
  if (await op.count()) {
    await op.click();
    await beat(page, pace);
  }
  // Step down the page so endpoints are readable, then hard scroll to bottom
  await page.evaluate(() => window.scrollBy(0, 600));
  await linger(page, pace * 1.5);
  await page.evaluate(() => window.scrollBy(0, 600));
  await linger(page, pace * 1.5);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await linger(page, pace * 3);

  // Optional branding + static ticket page
  await gotoLocal(page, `${BASE}/branding`);
  await expect(page.getByTestId("client-card-bluebox")).toBeVisible();
  await expect(page.getByTestId("client-card-harbor")).toBeVisible();
  await linger(page, pace);

  await gotoLocal(page, `${BASE}/ticket`);
  await expect(page.getByTestId("ticket-phone")).toBeVisible({ timeout: 10_000 });
  await linger(page, pace * 1.5);

  // Final linger — don't slam the browser shut
  await gotoLocal(page, `${BASE}/`);
  await expect(page.getByRole("link", { name: /View seat map/i }).first()).toBeVisible();
  await linger(page, Math.max(pace * 3.5, 3000));
});
