import { timingSafeEqual } from "crypto";
import express from "express";
import { config } from "../config.js";
import { createOrUpdateBookingFromWebhook } from "../services/bookingService.js";

function verifySecret(incoming) {
  try {
    const a = Buffer.from(incoming || "");
    const b = Buffer.from(config.wpSharedSecret);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const webhookDebounce = new Map();
const DEBOUNCE_MS = 5_000;

function isDebouncedOut(bookingId) {
  const last = webhookDebounce.get(bookingId);
  const now = Date.now();
  if (last && now - last < DEBOUNCE_MS) return true;
  webhookDebounce.set(bookingId, now);
  return false;
}

export function createHttpApp(deps) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => res.status(200).send("ok"));

  app.post("/wpbs/new-booking", async (req, res) => {
    try {
      if (!verifySecret(req.header("x-shared-secret"))) {
        return res.status(401).send("unauthorized");
      }

      const bookingId = req.body?.booking_id;
      if (bookingId && isDebouncedOut(String(bookingId))) {
        return res.status(429).json({ ok: false, reason: "debounced" });
      }

      const requiredFields = ["booking_id", "start_date", "end_date"];
      const missingFields = requiredFields.filter((f) => !req.body?.[f]);
      if (missingFields.length) {
        return res.status(400).json({ ok: false, reason: `missing fields: ${missingFields.join(", ")}` });
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
