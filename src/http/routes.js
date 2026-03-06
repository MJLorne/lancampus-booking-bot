import express from "express";
import { config } from "../config.js";
import { createOrUpdateBookingFromWebhook } from "../services/bookingService.js";

export function createHttpApp(deps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => res.status(200).send("ok"));

  app.post("/wpbs/new-booking", async (req, res) => {
    try {
      if (req.header("x-shared-secret") !== config.wpSharedSecret) {
        return res.status(401).send("unauthorized");
      }
      if (!deps.client.isReady()) {
        return res.status(503).send("bot not ready");
      }

      const result = await createOrUpdateBookingFromWebhook({
        body: req.body || {},
        client: deps.client,
        store: deps.store,
        audit: deps.audit,
      });

      return res.json({ ok: true, channel_id: result.channelId, reused: result.reused, updated: result.updated });
    } catch (err) {
      console.error(err);
      const message = String(err?.message || err);
      if (message === "missing booking_id") return res.status(400).send("missing booking_id");
      if (message === "bot missing Manage Channels permission") return res.status(500).send(message);
      return res.status(500).send("error");
    }
  });

  return app;
}
