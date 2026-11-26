import { test, expect } from "@playwright/test";

/** Reasonable paced walkthrough of the full demo. */
test("white-label ticket sale → lock → phone ticket → ERP visualizer", async ({ page }) => {
  // Start as Bluebox Arts
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 2 })).toContainText(/Bluebox|Harbor/i);
  await page.waitForTimeout(1200);

  // Switch white-label client → Harbor Live
  await page.getByTestId("client-switch").click();
  await page.getByRole("option", { name: /Harbor Live/i }).click();
  await expect(page.getByRole("link", { name: /Harbor Live/i }).first()).toBeVisible();
  await page.waitForTimeout(1400);

  // Switch back to Bluebox for the purchase path
  await page.getByTestId("client-switch").click();
  await page.getByRole("option", { name: /Bluebox Arts/i }).click();
  await expect(page.getByRole("link", { name: /Bluebox Arts/i }).first()).toBeVisible();
  await page.waitForTimeout(1000);

  // Open intimate venue (pre-sold seats visible as grey)
  await page.getByRole("link", { name: /View seat map/i }).first().click();
  await expect(page.getByRole("heading", { name: /Bluebox Studio/i })).toBeVisible();
  await page.waitForTimeout(1600);

  // Lock two available seats
  await page.getByTestId("quick-pick").click();
  await expect(page.getByTestId("hold-timer")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("hold-countdown")).toBeVisible();
  await page.waitForTimeout(2000);

  // Complete purchase
  await page.getByTestId("buy").click();
  await expect(page.getByTestId("ticket-phone")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Ticket delivery preview/i)).toBeVisible();
  await page.waitForTimeout(2500);

  // Visualizer shows pipeline
  await page.getByRole("link", { name: "API Visualizer" }).click();
  await expect(page.getByRole("heading", { name: "API Visualizer" })).toBeVisible();
  await expect(page.getByText(/erp_sync|order_complete|hold/i).first()).toBeVisible({
    timeout: 10_000,
  });
  await page.waitForTimeout(2000);

  // Branding page — dual clients
  await page.getByRole("link", { name: "Branding" }).click();
  await expect(page.getByTestId("client-card-bluebox")).toBeVisible();
  await expect(page.getByTestId("client-card-harbor")).toBeVisible();
  await page.getByTestId("client-card-harbor").click();
  await expect(page.getByRole("link", { name: /Harbor Live/i }).first()).toBeVisible();
  await page.waitForTimeout(1800);
});
