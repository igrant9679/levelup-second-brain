/**
 * Confirming the owner's alternate email addresses (audit F29).
 *
 * The coach check-in address (prefs.coach.checkins.recipientEmail) and the
 * daily digest / weekly review "send to a different address" overrides
 * (prefs.dailyDigest.recipientEmail, prefs.weeklyReview.recipientEmail) are
 * client-written. They used to be used as soon as they were typed — and for
 * the coach, replies from that address are treated as the owner's own
 * commands. Now an address is used only after someone with access to that
 * mailbox clicks the link we send to it:
 *
 *   sendRecipientConfirm   emails a link with a stateless token:
 *                          base64url({u,e,k,x}).HMAC-SHA256(JWT_SECRET), 7 days
 *   GET  /api/confirm-recipient?t=…   a small page with a Confirm button
 *                          (a GET changes nothing — mail scanners open links)
 *   POST /api/confirm-recipient       same-origin only; records the address
 *
 * Confirmed addresses live in system_settings `recipientConfirmed:<userId>`
 * = JSON [{email, at}] (no schema change). recipient.ts allowedRecipient and
 * coachReplies.ts consult isRecipientConfirmed.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { Express } from "express";
import { getSystemSetting, setSystemSetting } from "../db";
import { ENV } from "./env";
import { appOrigin } from "./appOrigin";

const TTL_MS = 7 * 86400e3;
export type RecipientKind = "coach" | "digest" | "weekly";
export const RECIPIENT_KINDS: RecipientKind[] = ["coach", "digest", "weekly"];

const norm = (e: unknown) => String(e ?? "").trim().toLowerCase();
const b64u = (b: Buffer | string) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
function secret(): string { return process.env.JWT_SECRET || ENV.cookieSecret || ""; }
function sig(body: string, key: string): string { return b64u(createHmac("sha256", key).update("recipient-confirm:" + body).digest()); }

export function signRecipientToken(p: { userId: number; email: string; kind?: RecipientKind }, now = Date.now()): string {
  const key = secret();
  if (!key) throw new Error("JWT_SECRET is not set");
  const body = b64u(JSON.stringify({ u: p.userId, e: norm(p.email), k: p.kind || null, x: now + TTL_MS }));
  return `${body}.${sig(body, key)}`;
}
export function verifyRecipientToken(t: unknown, now = Date.now()): { userId: number; email: string; kind: RecipientKind | null } | null {
  const key = secret();
  const s = String(t ?? "");
  if (!key || s.length > 2000) return null;
  const [body, mac] = s.split(".");
  if (!body || !mac) return null;
  const want = Buffer.from(sig(body, key));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const o = JSON.parse(unb64u(body).toString("utf8"));
    if (!Number.isSafeInteger(o.u) || o.u <= 0 || typeof o.e !== "string" || !o.e.includes("@") || !(Number(o.x) > now)) return null;
    return { userId: o.u, email: o.e, kind: RECIPIENT_KINDS.includes(o.k) ? o.k : null };
  } catch { return null; }
}

const settingKey = (userId: number) => `recipientConfirmed:${userId}`;
export async function confirmedRecipients(userId: number): Promise<Array<{ email: string; at: string }>> {
  try {
    const raw = await getSystemSetting(settingKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => x && typeof x.email === "string") : [];
  } catch { return []; }
}
export async function isRecipientConfirmed(userId: number, email: unknown): Promise<boolean> {
  const e = norm(email);
  if (!e) return false;
  return (await confirmedRecipients(userId)).some((x) => norm(x.email) === e);
}
export async function addConfirmedRecipient(userId: number, email: string): Promise<void> {
  const e = norm(email);
  const list = (await confirmedRecipients(userId)).filter((x) => norm(x.email) !== e);
  list.push({ email: e, at: new Date().toISOString() });
  await setSystemSetting(settingKey(userId), JSON.stringify(list.slice(-20)));
}

/** The alternate addresses set in a user's prefs, by kind. */
export function alternateRecipients(prefs: any, ownEmail?: string | null): Array<{ kind: RecipientKind; email: string }> {
  const p = prefs && typeof prefs === "object" ? prefs : {};
  const own = norm(ownEmail);
  const out: Array<{ kind: RecipientKind; email: string }> = [];
  const add = (kind: RecipientKind, v: unknown) => { const e = norm(v); if (e && e.includes("@") && e !== own) out.push({ kind, email: e }); };
  add("coach", p.coach?.checkins?.recipientEmail);
  add("digest", p.dailyDigest?.recipientEmail);
  add("weekly", p.weeklyReview?.recipientEmail);
  return out;
}

const hx = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as any)[c]);
const KIND_WORDS: Record<string, string> = { coach: "AI coach check-ins", digest: "the daily digest", weekly: "the weekly review" };

export function confirmLink(token: string): string { return `${appOrigin()}/api/confirm-recipient?t=${encodeURIComponent(token)}`; }
export function renderConfirmEmail(o: { ownerName: string; email: string; kind?: RecipientKind | null; link: string }): string {
  return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<div style="max-width:560px;margin:0 auto;padding:24px 16px"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 22px;font-size:14.5px;line-height:1.55">
<p style="margin:0 0 12px">${hx(o.ownerName)} asked LevelUp to send ${hx(KIND_WORDS[o.kind || ""] || "their scheduled emails")} to <b>${hx(o.email)}</b>.</p>
<p style="margin:0 0 16px">If that's you, confirm this address. Nothing is sent here until you do.</p>
<p style="margin:0 0 16px"><a href="${hx(o.link)}" style="display:inline-block;background:#4338ca;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px">Confirm this address</a></p>
<p style="margin:0;font-size:12.5px;color:#64748b">The link works for 7 days. If you didn't expect this, ignore it.</p></div></div></body></html>`;
}

/** Email the confirmation link. Caller checks owner + quota. */
export async function sendRecipientConfirm(user: { id: number; name?: string | null; email?: string | null }, email: string, kind?: RecipientKind | null): Promise<boolean> {
  const e = norm(email);
  const link = confirmLink(signRecipientToken({ userId: user.id, email: e, kind: kind || undefined }));
  const ownerName = String(user.name || user.email || "A LevelUp user");
  const { sendEmail } = await import("./sendEmail");
  return sendEmail({
    to: e, subject: "Confirm your address for LevelUp emails",
    html: renderConfirmEmail({ ownerName, email: e, kind, link }),
    text: `${ownerName} asked LevelUp to send ${KIND_WORDS[kind || ""] || "their scheduled emails"} to ${e}.\n\nIf that's you, confirm this address (the link works for 7 days):\n${link}\n\nIf you didn't expect this, ignore it.\n`,
    senderUserId: user.id,
  }).catch(() => false);
}

// ─── routes ───────────────────────────────────────────────────────────────
const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${hx(title)}</title></head><body style="font-family:sans-serif;text-align:center;padding:32px;color:#0f172a">${body}</body></html>`;
function headers(res: any) {
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
}
function sameOrigin(req: any): boolean {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  const src = String(req.headers.origin || req.headers.referer || "");
  if (!host || !src || src === "null") return false;
  try { return new URL(src).host.toLowerCase() === host; } catch { return false; }
}

export function registerRecipientConfirmRoutes(app: Express) {
  app.get("/api/confirm-recipient", (req, res) => {
    headers(res);
    const t = String(req.query.t ?? "");
    const v = verifyRecipientToken(t);
    if (!v) { res.status(400).send(page("Link expired", "<h2>This link is invalid or has expired.</h2><p>Ask for a new one in LevelUp → Settings.</p>")); return; }
    res.send(page("Confirm address", `
      <h2 style="margin:0 0 8px">Confirm ${hx(v.email)}?</h2>
      <p style="color:#444;margin:0 0 20px">LevelUp will send ${hx(KIND_WORDS[v.kind || ""] || "scheduled emails")} to this address.</p>
      <form method="post" action="/api/confirm-recipient">
        <input type="hidden" name="t" value="${hx(t)}">
        <button type="submit" style="font-size:16px;padding:10px 22px;border-radius:8px;border:0;background:#4338ca;color:#fff;cursor:pointer">Confirm</button>
      </form>`));
  });
  app.post("/api/confirm-recipient", async (req, res) => {
    try {
      headers(res);
      if (!sameOrigin(req)) { res.status(403).send(page("Refused", "<h2>Refused: this request did not come from LevelUp.</h2>")); return; }
      const v = verifyRecipientToken((req.body || {}).t);
      if (!v) { res.status(400).send(page("Link expired", "<h2>This link is invalid or has expired.</h2>")); return; }
      await addConfirmedRecipient(v.userId, v.email);
      res.send(page("Confirmed", `<h2>✅ ${hx(v.email)} is confirmed.</h2><p style="color:#666">You can close this page.</p>`));
    } catch (err) {
      console.error("[confirm-recipient] failed:", err);
      res.status(500).send(page("Error", "<h2>Something went wrong. Please try again.</h2>"));
    }
  });
}
