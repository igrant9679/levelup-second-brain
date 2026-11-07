/**
 * Rate limiting for the public sign-in, password-reset and invite endpoints.
 *
 * -255 (audit 2) added an in-memory limiter: without it anyone could guess
 * passwords for a known member address without limit, or flood a member with
 * reset emails. Audit F19: memory resets on every deploy and is per process,
 * so a guesser simply waited for the next deploy (or hit another instance).
 *
 * Now (`rlHit` / `rlBlocked` / `rlClear`, async): counters live in MySQL
 * (`rate_limits`, migration 0062) — shared by every instance, kept across
 * deploys. Fixed windows of `windowMs` per key; the count is the current
 * window plus the previous one weighted by how much of it still overlaps
 * (the usual sliding-window estimate). Keys are stored hashed (they contain
 * email addresses and IPs). Old rows are pruned as the limiter is used.
 *
 * If the database is unavailable (or a query fails) the same calls fall back
 * to the in-memory limiter below, so throttling never turns into "no limit"
 * and never blocks a request by itself failing.
 */
import crypto from "crypto";
import { sql } from "drizzle-orm";

// ── In-memory limiter (fallback, and what unit tests without a DB exercise) ──
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

// ── Persistent limiter ──────────────────────────────────────────────────────
type Db = { execute: (q: any) => Promise<any> };
let _dbOverride: (() => Promise<Db | null>) | null = null;
/** Test seam: supply the database (or null) the persistent limiter uses. */
export function _setRateLimitDbForTests(fn: (() => Promise<Db | null>) | null): void { _dbOverride = fn; }
async function rlDb(): Promise<Db | null> {
  if (_dbOverride) return _dbOverride();
  try { const { getDb } = await import("../db"); return (await getDb()) as any; } catch { return null; }
}

const bucketOf = (key: string) => crypto.createHash("sha256").update("lu-rl:" + key).digest("hex").slice(0, 64);
const rowsOf = (r: any): any[] => (Array.isArray(r?.[0]) ? r[0] : Array.isArray(r) ? r : []);
let _lastPrune = 0;

async function windowCount(db: Db, bucket: string, windowMs: number, now: number): Promise<{ count: number; cur: number }> {
  const cur = Math.floor(now / windowMs) * windowMs;
  const prev = cur - windowMs;
  const r = await db.execute(sql`SELECT windowStart, hits FROM rate_limits WHERE bucket = ${bucket} AND windowStart IN (${cur}, ${prev})`);
  let c = 0, p = 0;
  for (const row of rowsOf(r)) {
    if (Number(row.windowStart) === cur) c = Number(row.hits) || 0;
    else if (Number(row.windowStart) === prev) p = Number(row.hits) || 0;
  }
  const overlap = 1 - (now - cur) / windowMs;
  return { count: c + p * overlap, cur };
}

async function maybePrune(db: Db, now: number): Promise<void> {
  if (now - _lastPrune < 10 * 60_000) return;
  _lastPrune = now;
  // Every window in use is at most a day long; anything two days old is dead.
  try { await db.execute(sql`DELETE FROM rate_limits WHERE windowStart < ${now - 2 * 86_400_000}`); } catch { /* best effort */ }
}

/**
 * Record one hit for `key` unless it is already at `limit` within `windowMs`.
 * Returns true when allowed (and recorded), false when over the limit.
 */
export async function rlHit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const db = await rlDb();
  if (db) {
    try {
      const bucket = bucketOf(key);
      const { count, cur } = await windowCount(db, bucket, windowMs, now);
      if (count >= limit) return false;
      await db.execute(sql`INSERT INTO rate_limits (bucket, windowStart, hits) VALUES (${bucket}, ${cur}, 1) ON DUPLICATE KEY UPDATE hits = hits + 1`);
      void maybePrune(db, now);
      return true;
    } catch (e) {
      console.warn("[rateLimit] database limiter unavailable — using memory:", String((e as any)?.message || e).slice(0, 160));
    }
  }
  return hit(key, limit, windowMs, now);
}

/** True if `key` is at `limit` within `windowMs` (records nothing). */
export async function rlBlocked(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const db = await rlDb();
  if (db) {
    try { return (await windowCount(db, bucketOf(key), windowMs, now)).count >= limit; }
    catch (e) { console.warn("[rateLimit] database limiter unavailable — using memory:", String((e as any)?.message || e).slice(0, 160)); }
  }
  return blocked(key, limit, windowMs, now);
}

/** Forget `key` (e.g. after a successful sign-in). */
export async function rlClear(key: string): Promise<void> {
  clearKey(key);
  const db = await rlDb();
  if (!db) return;
  try { await db.execute(sql`DELETE FROM rate_limits WHERE bucket = ${bucketOf(key)}`); } catch { /* best effort */ }
}
