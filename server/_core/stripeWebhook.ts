/**
 * POST /api/stripe/webhook (build -279).
 *
 * Stripe signs the exact bytes it sends, so this route reads the RAW body and
 * must be registered BEFORE the JSON body parsers. Answers 404 until both
 * STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set. A bad signature is 400
 * (never retried usefully); a failure while handling is 500 so Stripe retries.
 *
 * In Stripe: Developers → Webhooks → Add endpoint → this URL, events
 *   checkout.session.completed, customer.subscription.created / updated /
 *   deleted, invoice.paid, invoice.payment_failed.
 */
import express, { type Express, type Request, type Response } from "express";
import { stripeConfigured, stripeWebhookSecret, verifyWebhook } from "./stripe";

export function registerStripeWebhook(app: Express): void {
  app.post("/api/stripe/webhook", express.raw({ type: () => true, limit: "1mb" }), async (req: Request, res: Response) => {
    const secret = stripeWebhookSecret();
    if (!secret || !stripeConfigured()) { res.status(404).type("text/plain").send("Not found"); return; }
    let evt: any;
    try {
      evt = verifyWebhook(req.body as Buffer, String(req.headers["stripe-signature"] || ""), secret);
    } catch (e: any) {
      console.warn("[stripe-webhook] refused:", e?.message || e);
      res.status(400).type("text/plain").send("Bad signature");
      return;
    }
    try {
      const { handleStripeEvent } = await import("./billing");
      const r = await handleStripeEvent(evt);
      res.status(200).json({ received: true, handled: r.handled, note: r.note });
    } catch (e) {
      console.error("[stripe-webhook] failed:", evt?.type, e);
      res.status(500).json({ received: false });
    }
  });
}
