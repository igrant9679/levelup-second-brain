/**
 * Stripe, without the SDK (build -279, Phase I of docs/multi-tenant-plan.md).
 *
 * LevelUp uses five Stripe calls and one webhook, so this is a thin client
 * over Stripe's REST API (form-encoded requests, JSON answers) instead of a
 * dependency.
 *
 *   STRIPE_SECRET_KEY      sk_test_… / sk_live_… — billing is OFF without it
 *   STRIPE_WEBHOOK_SECRET  whsec_… of the endpoint POST /api/stripe/webhook
 *   STRIPE_API_BASE        tests and the local playground only: a fake Stripe
 *                          on localhost (ignored for any other host)
 *
 * The API version is pinned so a Stripe-side upgrade of the account's default
 * version cannot change the shapes read here.
 */
import crypto from "crypto";

const API_VERSION = "2024-06-20";

export function stripeKey(): string { return String(process.env.STRIPE_SECRET_KEY || "").trim(); }
export function stripeConfigured(): boolean { return !!stripeKey(); }
/** "test" | "live" | null — from the key's prefix (sk_test_ / rk_test_ …). */
export function stripeMode(): "test" | "live" | null {
  const k = stripeKey();
  if (!k) return null;
  return /^(sk|rk)_test_/.test(k) ? "test" : "live";
}
export function stripeWebhookSecret(): string { return String(process.env.STRIPE_WEBHOOK_SECRET || "").trim(); }

function apiBase(): string {
  const o = String(process.env.STRIPE_API_BASE || "").trim();
  if (o) {
    try {
      const u = new URL(o);
      // never let a stray setting send the secret key anywhere but this machine
      if (u.hostname === "127.0.0.1" || u.hostname === "localhost" || u.hostname === "[::1]") return o.replace(/\/+$/, "");
    } catch { /* fall through */ }
  }
  return "https://api.stripe.com";
}

/**
 * A link Stripe gave us for the customer's browser (an invoice page, its PDF):
 * returned only when it is an https page on stripe.com — or, for the local fake
 * (tests, playground), a page of that same local server. Anything else → null.
 */
export function stripeHostedUrl(u: unknown): string | null {
  const s = String(u || "").trim();
  if (!s || s.length > 2000) return null;
  try {
    const url = new URL(s);
    const base = apiBase();
    if (base !== "https://api.stripe.com" && s.startsWith(base + "/")) return s;
    if (url.protocol !== "https:") return null;
    return url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com") ? s : null;
  } catch { return null; }
}

/** {a:{b:1}, c:[{d:2}]} → a[b]=1&c[0][d]=2 (Stripe's form encoding). */
export function formEncode(obj: Record<string, any>, prefix = "", out: string[] = []): string {
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === "object") formEncode(item, `${key}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof v === "object") formEncode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.join("&");
}

export class StripeError extends Error {
  status: number; code?: string; type?: string;
  constructor(message: string, status: number, code?: string, type?: string) { super(message); this.status = status; this.code = code; this.type = type; }
}

/** One Stripe API call. `idempotencyKey` makes a retried POST safe. */
export async function stripeCall<T = any>(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, any>, opts: { idempotencyKey?: string; timeoutMs?: number } = {}): Promise<T> {
  const key = stripeKey();
  if (!key) throw new StripeError("Billing is not set up on this LevelUp (no Stripe key).", 503, "not_configured");
  const body = params ? formEncode(params) : "";
  const url = apiBase() + path + (method === "GET" && body ? `?${body}` : "");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 20_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Stripe-Version": API_VERSION,
        ...(method !== "GET" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
        ...(opts.idempotencyKey ? { "Idempotency-Key": opts.idempotencyKey } : {}),
      },
      body: method !== "GET" && body ? body : undefined,
      signal: ctl.signal,
    });
  } catch (e: any) {
    throw new StripeError(e?.name === "AbortError" ? "Stripe did not answer in time." : `Could not reach Stripe: ${e?.message || e}`, 502, "network");
  } finally { clearTimeout(timer); }
  let json: any = null;
  try { json = await res.json(); } catch { json = null; }
  if (!res.ok) {
    const err = json?.error || {};
    // Stripe's messages are written for the account holder and never contain the key
    throw new StripeError(String(err.message || `Stripe answered ${res.status}`), res.status, err.code, err.type);
  }
  return json as T;
}

/**
 * Verify a webhook: header "t=<unix>,v1=<hex>[,v1=…]", signature =
 * HMAC-SHA256(secret, `${t}.${rawBody}`). Returns the parsed event, or throws.
 */
export function verifyWebhook(rawBody: Buffer | string, header: string | undefined, secret: string, toleranceSec = 300, nowMs = Date.now()): any {
  if (!secret) throw new Error("No webhook secret configured");
  const parts = String(header || "").split(",").map((p) => p.trim().split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  const sigs = parts.filter((p) => p[0] === "v1" && p[1]).map((p) => p[1]);
  if (!t || !sigs.length) throw new Error("Malformed signature header");
  const ts = Number(t);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > toleranceSec) throw new Error("Signature timestamp outside the tolerance");
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  const expected = crypto.createHmac("sha256", secret).update(Buffer.concat([Buffer.from(`${t}.`, "utf8"), raw])).digest();
  const ok = sigs.some((s) => {
    let got: Buffer;
    try { got = Buffer.from(s, "hex"); } catch { return false; }
    return got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
  if (!ok) throw new Error("Signature mismatch");
  return JSON.parse(raw.toString("utf8"));
}

/** For the fake Stripe and the tests: sign a payload the way Stripe does. */
export function signWebhook(payload: string, secret: string, tsSec = Math.floor(Date.now() / 1000)): string {
  const v1 = crypto.createHmac("sha256", secret).update(`${tsSec}.${payload}`).digest("hex");
  return `t=${tsSec},v1=${v1}`;
}
