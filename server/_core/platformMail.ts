/**
 * Platform mail service (multi-workspace Phase E, build -278).
 *
 * LevelUp is sold to many companies, so system mail (invites, password resets,
 * digests, coach check-ins, reports, follow-ups) must not depend on — or pass
 * through — one person's mailbox. When a transactional provider is configured
 * every workspace's mail goes out through it from one platform address, under
 * the workspace's name ("Acme via LevelUp").
 *
 * Configure on Railway (nothing here is active until these are set):
 *   MAIL_PROVIDER          "postmark" or "resend"
 *   POSTMARK_SERVER_TOKEN  (postmark)   — the server's API token
 *   RESEND_API_KEY         (resend)     — an API key with sending access
 *   MAIL_FROM              the verified sending address, e.g. notify@mail.levelupnow.tools
 *   MAIL_INBOUND_ADDRESS   optional: the provider's inbound address for replies,
 *                          e.g. reply@inbound.levelupnow.tools (see platformInbound.ts)
 *   MAIL_INBOUND_SECRET    optional: shared secret in the inbound webhook URL
 *
 * Without them sendEmail falls back to each workspace's own sender, exactly as
 * before. See docs/multi-tenant-plan.md → "Owner actions".
 */
export type PlatformMail = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName: string;
  messageId?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
};

function provider(): "postmark" | "resend" | null {
  const p = String(process.env.MAIL_PROVIDER || "").trim().toLowerCase();
  if (p === "postmark" && process.env.POSTMARK_SERVER_TOKEN && process.env.MAIL_FROM) return "postmark";
  if (p === "resend" && process.env.RESEND_API_KEY && process.env.MAIL_FROM) return "resend";
  return null;
}

/**
 * Resend's API, or — for the local playground only — a mail sink on this
 * machine (MAIL_API_BASE=http://127.0.0.1:port). Any other host is ignored,
 * so a stray setting can never send customers' mail somewhere else.
 */
function resendBase(): string {
  const o = String(process.env.MAIL_API_BASE || "").trim();
  if (o) {
    try { const u = new URL(o); if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return o.replace(/\/+$/, ""); } catch { /* ignore */ }
  }
  return "https://api.resend.com";
}

export function platformMailConfigured(): boolean {
  return provider() !== null;
}

/** The platform's bare sending address (MAIL_FROM may be "Name <addr>" or just the address). */
export function platformFromAddress(): string {
  const raw = String(process.env.MAIL_FROM || "").trim();
  const m = /<([^>]+)>/.exec(raw);
  return (m ? m[1] : raw).trim();
}

/** Where replies to platform mail are received, if inbound mail is set up. */
export function platformInboundAddress(): string | null {
  const a = String(process.env.MAIL_INBOUND_ADDRESS || "").trim();
  return /^[^@\s]+@[^@\s]+$/.test(a) ? a : null;
}

/**
 * The Reply-To for a threaded message when the platform receives replies:
 * "reply+<token>@inbound…", where the token is the local part of our own
 * Message-ID (e.g. "coach.123.ab12…"). Providers replace the Message-ID of
 * what they send, so the token rides in the address instead; the inbound
 * webhook turns it back into the reference coachReplies already understands.
 */
export function inboundReplyTo(messageId: string | undefined): string | null {
  const inbound = platformInboundAddress();
  if (!inbound || !messageId) return null;
  const m = /^<?([A-Za-z0-9._-]{3,120})@/.exec(messageId.trim());
  if (!m) return null;
  const [local, domain] = inbound.split("@");
  return `${local}+${m[1]}@${domain}`;
}

const cleanName = (s: string) => String(s || "LevelUp").replace(/["\r\n<>]/g, "").trim().slice(0, 80) || "LevelUp";

export async function sendViaPlatform(mail: PlatformMail): Promise<{ ok: boolean; error?: string }> {
  const p = provider();
  if (!p) return { ok: false, error: "no platform mail provider configured" };
  const from = `"${cleanName(mail.fromName)}" <${platformFromAddress()}>`;
  // Replies: to the platform inbox (token in the address) when there is one,
  // else wherever the caller asked.
  const replyTo = inboundReplyTo(mail.messageId) || mail.replyTo || undefined;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    if (p === "postmark") {
      const headers: Array<{ Name: string; Value: string }> = [];
      if (mail.messageId) { headers.push({ Name: "Message-ID", Value: mail.messageId }); headers.push({ Name: "X-PM-KeepID", Value: "true" }); }
      if (mail.inReplyTo) headers.push({ Name: "In-Reply-To", Value: mail.inReplyTo });
      if (mail.references) headers.push({ Name: "References", Value: mail.references });
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        signal: ctl.signal,
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-Postmark-Server-Token": String(process.env.POSTMARK_SERVER_TOKEN) },
        body: JSON.stringify({
          From: from, To: mail.to, Subject: mail.subject, HtmlBody: mail.html, TextBody: mail.text || undefined,
          ReplyTo: replyTo, Headers: headers.length ? headers : undefined,
          MessageStream: process.env.POSTMARK_STREAM || "outbound",
        }),
      });
      if (res.ok) return { ok: true };
      return { ok: false, error: `postmark ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` };
    }
    // resend
    const headers: Record<string, string> = {};
    if (mail.inReplyTo) headers["In-Reply-To"] = mail.inReplyTo;
    if (mail.references) headers["References"] = mail.references;
    const res = await fetch(resendBase() + "/emails", {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
      body: JSON.stringify({
        from, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text || undefined,
        reply_to: replyTo, headers: Object.keys(headers).length ? headers : undefined,
      }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: `resend ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}` };
  } catch (e: any) {
    return { ok: false, error: String(e?.name === "AbortError" ? "timed out" : (e?.message || e)) };
  } finally {
    clearTimeout(timer);
  }
}
