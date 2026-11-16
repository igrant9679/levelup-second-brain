/**
 * Replies to platform mail (multi-workspace Phase E, build -278).
 *
 * With a platform mail service (platformMail.ts) coach check-ins and
 * delegation follow-ups go out with Reply-To "reply+<token>@<inbound domain>".
 * The provider receives the reply and POSTs it here:
 *
 *     POST /api/inbound/mail?key=<MAIL_INBOUND_SECRET>
 *
 * (Postmark: Servers → your server → Inbound → Webhook. Resend: Webhooks →
 * email.received.) The token names the message being answered; it carries an
 * HMAC bound to that message's owner, so a reply can only ever reach the
 * member (and workspace) the original went to — coachReplies.handleInboundMail
 * applies the same rules as the mailbox poller: the sender must be that
 * account's own address, auto-replies are ignored, hourly caps apply.
 *
 * Without MAIL_INBOUND_SECRET the route answers 404.
 */
import type { Express, Request, Response } from "express";
import crypto from "crypto";

function secretOk(given: unknown): boolean {
  const want = String(process.env.MAIL_INBOUND_SECRET || "");
  const got = String(given || "");
  if (!want || want.length < 16 || got.length !== want.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

/** "reply+coach.12.ab34@inbound.example" → "coach.12.ab34" */
export function tokenFromAddress(addr: string): string | null {
  const m = /\+([A-Za-z0-9._-]{3,120})@/.exec(String(addr || ""));
  return m ? m[1] : null;
}

/** Pull what we need out of a Postmark or Resend inbound payload. */
export function parseInbound(body: any): { from: string; subject: string; text: string; html: string; messageId: string; inReplyTo: string; references: string; token: string | null; headers: Record<string, string[]> } | null {
  if (!body || typeof body !== "object") return null;
  const d = body.data && typeof body.data === "object" ? body.data : body; // Resend wraps in {type, data}
  const headers: Record<string, string[]> = {};
  const addH = (name: unknown, value: unknown) => { const k = String(name || "").toLowerCase(); if (!k) return; (headers[k] = headers[k] || []).push(String(value ?? "")); };
  const H = d.Headers ?? d.headers;
  if (Array.isArray(H)) for (const h of H) addH(h?.Name ?? h?.name, h?.Value ?? h?.value);
  else if (H && typeof H === "object") for (const [k, v] of Object.entries(H)) addH(k, v);
  const from = String(d.FromFull?.Email || d.From || d.from?.email || d.from || "");
  if (!from) return null;
  const toList: string[] = [];
  const pushTo = (v: any) => { if (!v) return; if (Array.isArray(v)) v.forEach(pushTo); else if (typeof v === "object") toList.push(String(v.Email || v.email || v.address || "")); else toList.push(String(v)); };
  pushTo(d.OriginalRecipient); pushTo(d.ToFull); pushTo(d.To); pushTo(d.to);
  let token: string | null = d.MailboxHash ? String(d.MailboxHash) : null;
  if (!token) for (const t of toList) { const tk = tokenFromAddress(t); if (tk) { token = tk; break; } }
  const first = (k: string) => (headers[k] || [])[0] || "";
  return {
    from,
    subject: String(d.Subject ?? d.subject ?? ""),
    text: String(d.StrippedTextReply || d.TextBody || d.text || ""),
    html: String(d.HtmlBody || d.html || ""),
    messageId: String(d.MessageID || d.message_id || first("message-id") || ""),
    inReplyTo: first("in-reply-to"),
    references: first("references"),
    token,
    headers,
  };
}

export function registerInboundMailRoute(app: Express): void {
  app.post("/api/inbound/mail", async (req: Request, res: Response) => {
    if (!secretOk(req.query.key)) { res.status(404).type("text/plain").send("Not found"); return; }
    try {
      const m = parseInbound(req.body);
      if (!m) { res.status(200).json({ ok: true, handled: false, skip: "unreadable payload" }); return; }
      const { handleInboundMail } = await import("./coachReplies");
      const r = await handleInboundMail(m);
      if (r.skip) console.log("[inbound-mail] skipped:", r.skip);
      // 200 either way: a provider retries on anything else, and a skipped
      // reply (auto-reply, unknown sender) must not be retried.
      res.status(200).json({ ok: true, handled: r.handled });
    } catch (e) {
      console.error("[inbound-mail] failed:", e);
      res.status(500).json({ ok: false });
    }
  });
}
