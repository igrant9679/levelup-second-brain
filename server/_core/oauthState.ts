/**
 * Signed OAuth `state` values.
 *
 * The state round-trips through the provider and comes back to our callback,
 * which uses it to decide WHICH LevelUp user the new token belongs to. It used
 * to be plain base64 JSON, so anyone could forge a state naming another user.
 * Now it is   base64url(JSON payload) "." HMAC-SHA256(JWT_SECRET, payload)
 * with an issue time (15-minute lifetime) and a random nonce. Callbacks must
 * also check that the signed-in session is the same user (see
 * oauth-callbacks.ts), so a valid state cannot be replayed in someone else's
 * browser.
 */
import crypto from "crypto";
import { ENV } from "./env";

export type OAuthStatePayload = {
  userId: number;
  origin: string;
  tenantId?: string | null;
  slot?: string;
};

const MAX_AGE_MS = 15 * 60 * 1000;

function key(): string {
  // JWT_SECRET is required for sessions anyway; fall back only so local dev
  // without one still produces (unforgeable-per-process) states.
  return ENV.cookieSecret || (globalThis as any).__luStateKey || ((globalThis as any).__luStateKey = crypto.randomBytes(32).toString("hex"));
}

function mac(body: string): string {
  return crypto.createHmac("sha256", key()).update("oauth-state:" + body).digest("base64url");
}

export function signOAuthState(p: OAuthStatePayload): string {
  const body = Buffer.from(JSON.stringify({ ...p, t: Date.now(), n: crypto.randomBytes(9).toString("base64url") }), "utf-8").toString("base64url");
  return `${body}.${mac(body)}`;
}

/** Returns the payload if the signature and age check out, else null. */
export function verifyOAuthState(state: string | undefined | null, now = Date.now()): OAuthStatePayload | null {
  if (!state || typeof state !== "string") return null;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expect = mac(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    if (!p || typeof p.userId !== "number" || typeof p.origin !== "string" || typeof p.t !== "number") return null;
    if (now - p.t > MAX_AGE_MS || p.t - now > 60_000) return null;
    if (!/^https?:\/\/[^/\s]+$/i.test(p.origin)) return null;
    return { userId: p.userId, origin: p.origin, tenantId: p.tenantId ?? null, slot: p.slot };
  } catch {
    return null;
  }
}
