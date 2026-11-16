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

/**
 * MULTI-WORKSPACE (-278). Three counters per spend:
 *   - the member                       (usage_counters.userId = the member)
 *   - the member's WORKSPACE           (userId = -workspaceId)
 *   - the whole platform               (userId = 0)
 * "global" is the default cap of ONE workspace per day; the operator can
 * raise or lower it per workspace (workspaces.quotas → {"ai":8000,"email":500}).
 * "platform" is a ceiling over all workspaces together. In the tests that
 * predate workspaces there is one workspace, counted on userId 0 as before.
 */
const DEFAULTS: Record<QuotaBucket, { user: number; owner: number; global: number; platform: number }> = {
  email: { user: 150, owner: 400, global: 800, platform: 8000 },
  ai: { user: 300, owner: 3000, global: 5000, platform: 50000 },
};

function cap(bucket: QuotaBucket, kind: "user" | "owner" | "global" | "platform"): number {
  const env = process.env[`QUOTA_${bucket.toUpperCase()}_${kind.toUpperCase()}`];
  const v = env != null && env !== "" ? Number(env) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : DEFAULTS[bucket][kind];
}

/** A workspace's daily cap for a bucket: the operator's override, else the default. */
export async function workspaceCap(wsId: number, bucket: QuotaBucket): Promise<number> {
  try {
    const { getWorkspace } = await import("./workspace");
    const q = (await getWorkspace(wsId))?.quotas?.[bucket];
    const n = Number(q);
    if (q != null && q !== "" && Number.isFinite(n) && n >= 0) return n;
  } catch { /* default */ }
  return cap(bucket, "global");
}

/** Today's usage of a workspace (operator console, Settings). */
export async function workspaceUsage(wsId: number): Promise<Record<QuotaBucket, { used: number; cap: number }>> {
  const out: any = {};
  let db: any = null;
  try { db = await getDb(); } catch { db = null; }
  for (const b of ["email", "ai"] as QuotaBucket[]) {
    let used = 0;
    if (db) {
      try {
        const res: any = await db.execute(sql`SELECT n FROM usage_counters WHERE userId = ${-wsId} AND bucket = ${b} AND day = ${today()}`);
        const rows = Array.isArray(res?.[0]) ? res[0] : Array.isArray(res) ? res : [];
        used = Number(rows[0]?.n ?? 0);
      } catch { used = 0; }
    }
    out[b] = { used, cap: await workspaceCap(wsId, b) };
  }
  return out;
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
  let wsId: number | null = null;
  try { const { wsIdOf } = await import("./workspace"); wsId = await wsIdOf(user ? (user as any) : { id: userId }); } catch { wsId = null; }
  const u = await bump(db, userId, bucket, day, n);
  if (u > userCap) {
    await bump(db, userId, bucket, day, -n);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `Daily ${LABEL[bucket]} limit reached (${userCap}). It resets at midnight UTC.` });
  }
  if (wsId === null) {
    // no workspace model (tests that predate workspaces): one workspace, on userId 0
    const globalCap = cap(bucket, "global");
    const g = await bump(db, 0, bucket, day, n);
    if (g > globalCap) {
      await bump(db, 0, bucket, day, -n);
      await bump(db, userId, bucket, day, -n);
      throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `The workspace's daily ${LABEL[bucket]} limit has been reached. It resets at midnight UTC.` });
    }
    return;
  }
  if (!wsId) { // a member of no workspace spends nothing
    await bump(db, userId, bucket, day, -n);
    throw new TRPCError({ code: "FORBIDDEN", message: "This account is not in a workspace." });
  }
  const wsCap = await workspaceCap(wsId, bucket);
  const w = await bump(db, -wsId, bucket, day, n);
  if (w > wsCap) {
    await bump(db, -wsId, bucket, day, -n);
    await bump(db, userId, bucket, day, -n);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `The workspace's daily ${LABEL[bucket]} limit has been reached. It resets at midnight UTC.` });
  }
  const platformCap = cap(bucket, "platform");
  const g = await bump(db, 0, bucket, day, n);
  if (g > platformCap) {
    await bump(db, 0, bucket, day, -n);
    await bump(db, -wsId, bucket, day, -n);
    await bump(db, userId, bucket, day, -n);
    console.error(`[quota] PLATFORM daily ${bucket} ceiling reached (${platformCap})`);
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `LevelUp's daily ${LABEL[bucket]} capacity has been reached. It resets at midnight UTC.` });
  }
}

/** Non-throwing variant for crons: returns false when over the cap. */
export async function trySpendQuota(userId: number, bucket: QuotaBucket, n = 1): Promise<boolean> {
  try {
    await spendQuota(null, bucket, n, { userId });
    return true;
  } catch (e) {
    if (e instanceof TRPCError && e.code === "TOO_MANY_REQUESTS") return false;
    console.error(`[quota] ${bucket} check failed for user ${userId}:`, e);
    return true;
  }
}
