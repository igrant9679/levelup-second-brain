/**
 * Small in-memory rate limiter for the public sign-in and password-reset
 * endpoints (-255, audit 2): without it anyone could guess passwords for a
 * known member address without limit, or flood a member with reset emails
 * (each one also cancels the previous link).
 *
 * Memory only — a restart clears it, which is acceptable for throttling. Each
 * key keeps the timestamps of recent hits inside its window; the map is
 * pruned as it is used and capped.
 */
const buckets = new Map<string, number[]>();
const MAX_KEYS = 50_000;

/** Record one hit for `key`; returns false when `limit` hits already happened inside `windowMs`. */
export function hit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) { buckets.set(key, arr); return false; }
  arr.push(now);
  buckets.set(key, arr);
  if (buckets.size > MAX_KEYS) {
    // drop the oldest quarter (insertion order) — throttling is best effort
    const drop: string[] = [];
    const n = Math.floor(MAX_KEYS / 4);
    buckets.forEach((_v, k) => { if (drop.length < n) drop.push(k); });
    drop.forEach((k) => buckets.delete(k));
  }
  return true;
}

/** True if `key` is at its limit (without recording a hit). */
export function blocked(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const arr = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  buckets.set(key, arr);
  return arr.length >= limit;
}

export function clearKey(key: string): void { buckets.delete(key); }
export function _resetRateLimits(): void { buckets.clear(); }

/** The caller's address (Express `trust proxy` is on, so req.ip is the client). */
export function clientIp(req: any): string {
  return String(req?.ip || req?.headers?.["x-forwarded-for"]?.split?.(",")[0] || req?.socket?.remoteAddress || "unknown").trim();
}
