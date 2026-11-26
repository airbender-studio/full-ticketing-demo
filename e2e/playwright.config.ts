import { defineConfig } from "@playwright/test";

 const pace = Number(process.env.DEMO_PACE_MS ?? 1800);

export default defineConfig({
  testDir: ".",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? "http://localhost:5173",
    headless: process.env.HEADED === "0",
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      slowMo: pace,
    },
    trace: "off",
    video: "on",
  },
  reporter: [["list"]],
});
