import { Router, raw } from "express";
import { handleWebhook } from "../services/webhook.js";

export const webhooksRouter = Router();

webhooksRouter.post(
  "/vivenu",
  raw({ type: "application/json" }),
  async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = req.header("x-vivenu-signature") ?? undefined;
    const result = await handleWebhook(rawBody, signature);
    res.status(result.status).json(result.body);
  }
);
