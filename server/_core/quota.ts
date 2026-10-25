/**
 * Persistent daily quotas (migration 0056, table usage_counters).
 *
 * Replaces the in-memory email cap in routers/pm.ts, which reset on every
 * deploy and could be multiplied by registering more accounts. Each spend is
 * counted per user AND against a workspace-wide total (userId 0), so neither
 * one busy account nor many accounts can push unlimited email through the
 * system sender or unlimited calls through the workspace AI key.
 *
 *   await spendQuota(ctx.user, "email", recipients.length);   // throws 429
 *   await spendQuota(ctx.user, "ai");
 *
 * Days are UTC. Caps can be raised per deploy with env vars, e.g.
 * QUOTA_EMAIL_USER=300. The owner gets a higher per-user cap.
 */
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { isOwner } from "./ownerGuard";

export type QuotaBucket = "email" | "ai";

const DEFAULTS: Record<QuotaBucket, { user: number; owner: number; global: number }> = {
  email: { user: 150, owner: 400, global: 800 },
  ai: { user: 300, owner: 3000, global: 5000 },
};

function cap(bucket: QuotaBucket, kind: "user" | "owner" | "global"): number {
  const env = process.env[`QUOTA_${bucket.toUpperCase()}_${kind.toUpperCase()}`];
  const v = env != null && env !== "" ? Number(env) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : DEFAULTS[bucket][kind];
}

const LABEL: Record<QuotaBucket, string> = { email: "email", ai: "AI" };

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function bump(db: any, userId: number, bucket: QuotaBucket, day: string, n: number): Promise<number> {
  await db.execute(sql`INSERT INTO usage_counters (userId, bucket, day, n) VALUES (${userId}, ${bucket}, ${day}, ${n})
    ON DUPLICATE KEY UPDATE n = n + ${n}, updatedAt = NOW()`);
  const res: any = await db.execute(sql`SELECT n FROM usage_counters WHERE userId = ${userId} AND bucket = ${bucket} AND day = ${day}`);
  const rows = Array.isArray(res?.[0]) ? res[0] : Array.isArray(res) ? res : [];
  return Number(rows[0]?.n ?? n);
}

/**
 * Count `n` units of `bucket` for this user (and the workspace total).
 * Throws TOO_MANY_REQUESTS — and gives the units back — if either cap would
 * be exceeded. Pass user=null for server-side jobs that act for `userId`.
 */
export async function spendQuota(
  user: { id: number; openId?: string | null } | null,
  bucket: QuotaBucket,
  n = 1,
  opts?: { userId?: number },
): Promise<void> {
  if (n <= 0) return;
  const userId = user?.id ?? opts?.userId;
  if (!userId) return;
  let db: any = null;
  try { db = await getDb(); } catch { db = null; }
  if (!db) return; // no DB means nothing else works either; don't add a second failure
  const day = today();
  const owner = user ? await isOwner(user) : false;
  const userCap = cap(bucket, owner ? "owner" : "user");
  const globalCap = cap(bucket, "global");
  const u = await bump(db, userId, bucket, day, n);
  if (u > userCap) {
    await bump(db, userId, bucket, day, -n);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Daily ${LABEL[bucket]} limit reached (${userCap}). It resets at midnight UTC.` });
  }
  const g = await bump(db, 0, bucket, day, n);
  if (g > globalCap) {
    await bump(db, 0, bucket, day, -n);
    await bump(db, userId, bucket, day, -n);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `The workspace's daily ${LABEL[bucket]} limit has been reached. It resets at midnight UTC.` });
  }
}

/** Non-throwing variant for crons: returns false when over the cap. */
export async function trySpendQuota(userId: number, bucket: QuotaBucket, n = 1): Promise<boolean> {
  try {
    await spendQuota(null, bucket, n, { userId });
    return true;
  } catch (e) {
    if (e instanceof TRPCError && e.code === "TOO_MANY_REQUESTS") return false;
    console.warn(`[quota] ${bucket} check failed for user ${userId}:`, e);
    return true;
  }
}
