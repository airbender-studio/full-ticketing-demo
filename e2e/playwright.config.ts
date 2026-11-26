import { defineConfig } from "@playwright/test";

// Headed showcase pacing. Headless (HEADED=0) keeps slowMo off so agents don't crawl.
const pace = Number(process.env.DEMO_PACE_MS ?? (process.env.HEADED === "0" ? 0 : 1000));
// Cap action slowMo so DEMO_PACE_MS sleeps carry the rhythm, not every micro-action.
const slowMo = pace > 0 ? Math.min(220, Math.floor(pace * 0.2)) : 0;

export default defineConfig({
  testDir: ".",
  // Full walkthrough: 3 venues + camera tours + swagger + final linger
  timeout: 600_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.DEMO_BASE_URL ?? "http://localhost:5173",
    headless: process.env.HEADED === "0",
    viewport: { width: 1280, height: 800 },
    // Prefer concrete selectors over networkidle — Three.js/SSE keep connections open.
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
    launchOptions: {
      slowMo,
    },
    trace: "off",
    video: "on",
  },
  reporter: [["list"]],
});
