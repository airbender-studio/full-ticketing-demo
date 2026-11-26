import { createApp } from "./app.js";
import { loadToggles } from "./config/toggles.js";
import { loadBranding } from "./config/branding.js";
import { releaseExpiredHolds } from "./services/orders.js";
import { reconcile } from "./services/erpWorker.js";
import { emit } from "./lib/events.js";

const app = createApp();
const port = Number(process.env.PORT ?? 4000);

async function boot() {
  await loadToggles();
  await loadBranding();
  await emit("boot", "Ticketing API online", { level: "success" });

  setInterval(() => void releaseExpiredHolds(), 30_000);
  setInterval(() => void reconcile(), 60_000);

  app.listen(port, () => {
    console.log(`API http://localhost:${port}`);
    console.log(`Docs http://localhost:${port}/docs`);
  });
}

boot().catch((e) => {
  console.error(e);
  process.exit(1);
});
