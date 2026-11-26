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

/** Wait for Three.js map + demo camera helper, then orbit+tilt+zoom → home. */
async function cameraTour(page: Page, durationMs = 3400) {
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 20_000 });
  await page.waitForFunction(() => typeof window.__demoCameraTour === "function", null, {
    timeout: 15_000,
  });
  await beat(page, Math.floor(pace * 0.5));
  await page.evaluate(async (ms) => {
    await window.__demoCameraTour?.({ durationMs: ms });
  }, durationMs);
  await beat(page, Math.floor(pace * 0.4));
}

async function openVenue(page: Page, slug: string, heading: RegExp) {
  await gotoLocal(page, `${BASE}/venues/${slug}`);
  await expect(page.getByRole("heading", { name: heading })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("seat-canvas")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("quick-pick")).toBeVisible({ timeout: 15_000 });
}

async function switchClient(page: Page, label: RegExp) {
  await page.getByTestId("client-switch").click();
  await page.getByRole("option", { name: label }).click();
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

async function showMapping(page: Page, which: "harbor" | "bluebox") {
  await gotoLocal(page, `${BASE}/customers/${which}/mapping`);
  await expect(page.getByTestId("mapping-page")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /Payload mapping/i })).toBeVisible();
  await linger(page, pace * 1.2);

  await page.getByTestId("mapping-flow").scrollIntoViewIfNeeded();
  await linger(page, pace);

  await page.getByTestId("mapping-recipe").scrollIntoViewIfNeeded();
  await linger(page, pace * 1.2);

  // Ensure JSON panels are expanded and readable
  for (const id of ["mapping-json-before", "mapping-json-after"] as const) {
    const body = page.getByTestId(`${id}-body`);
    if (!(await body.isVisible().catch(() => false))) {
      await page.getByTestId(`${id}-toggle`).click();
    }
    await expect(page.getByTestId(`${id}-body`)).toBeVisible();
    await page.getByTestId(id).scrollIntoViewIfNeeded();
    await linger(page, pace * 1.4);
  }

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await linger(page, pace * 2);
  await page.evaluate(() => window.scrollTo(0, 0));
  await linger(page, pace);
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

  await switchClient(page, /Bluebox Arts/i);
  await expect(page.getByRole("link", { name: /Bluebox Arts/i }).first()).toBeVisible();
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
  await expect(page.getByRole("link", { name: /Harbor Live/i }).first()).toBeVisible();
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
  await expect(page.getByRole("link", { name: /Bluebox Arts/i }).first()).toBeVisible();
  await page.getByTestId("customer-bluebox").getByRole("link", { name: "Profile" }).click();
  await expect(page.getByRole("heading", { name: /Bluebox/i })).toBeVisible();
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
