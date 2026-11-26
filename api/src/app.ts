import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./openapi.js";
import { venuesRouter } from "./routes/venues.js";
import { ordersRouter } from "./routes/orders.js";
import { webhooksRouter } from "./routes/webhooks.js";
import { adminRouter } from "./routes/admin.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    })
  );

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
  app.get("/openapi.json", (_req, res) => res.json(openApiSpec));

  app.use("/v1/webhooks", webhooksRouter);
  app.use(express.json());
  app.use("/api/venues", venuesRouter);
  app.use("/api/orders", ordersRouter);
  app.use("/api/admin", adminRouter);

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
  });

  return app;
}
