/**
 * One record per scheduled email actually owed (migration 0058, send_ledger).
 *
 * Before: "already sent?" lived in prefs (lastSentDate / lastSentISO). The
 * server compared in UTC and the client in local time, so report emails went
 * out twice; and any open tab saving prefs put the old stamp back, so the next
 * tick sent again. Now a sender first CLAIMS (userId, kind, period) — an
 * INSERT on the primary key — and only the one whose insert lands sends. A
 * failed send releases the claim so a later tick can retry.
 *
 *   kind    "digest" | "weekly" | "report:<reportId>"
 *   period  the user's local day ("2026-10-25"), or "2026-10" for monthly
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { onShutdown } from "./lifecycle";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function affected(res: any): number {
  const h = Array.isArray(res) ? res[0] : res;
  return Number(h?.affectedRows ?? h?.rowsAffected ?? 0);
}
function rowsOf(res: any): any[] {
  return Array.isArray(res?.[0]) ? res[0] : Array.isArray(res) ? res : [];
}

// Claims a cron pass made whose email may not have gone out yet (-264),
// tagged with the pass that owns them. A pass settles its claims as it moves
// on to the next user and when it ends; whatever is still open when the
// server shuts down (a deploy mid-send) is released, so the next instance
// sends it - before, that day's email was simply lost. Claims made for the
// browser (report catch-up) or for one-time actions (claims.once) are never
// tracked: releasing those could send or run something twice.
const open = new Map<string, { db: Db; userId: number; kind: string; period: string; owner: string }>();
const keyOf = (userId: number, kind: string, period: string) => `${userId}|${kind.slice(0, 64)}|${period.slice(0, 40)}`;

/** true = this caller owns the send; false = someone already did. `track` = the cron pass that will send it. */
export async function claimSend(db: Db, userId: number, kind: string, period: string, track?: string): Promise<boolean> {
  const res = await db.execute(sql`INSERT IGNORE INTO send_ledger (userId, kind, period) VALUES (${userId}, ${kind.slice(0, 64)}, ${period.slice(0, 40)})`);
  const ok = affected(res) === 1;
  if (ok && track) open.set(keyOf(userId, kind, period), { db, userId, kind, period, owner: track });
  return ok;
}

/** A pass is past these claims: sent, or nothing to send. */
export function settleClaims(owner: string): void {
  for (const [k, v] of Array.from(open.entries())) if (v.owner === owner) open.delete(k);
}
/** Release every claim still open (shutdown). Returns how many. */
export async function releaseOpenClaims(): Promise<number> {
  const list = Array.from(open.values());
  open.clear();
  for (const c of list) {
    try { await releaseSend(c.db, c.userId, c.kind, c.period); console.log(`[send-ledger] released unsent ${c.kind} ${c.period} for user ${c.userId} (shutdown)`); }
    catch (e) { console.error("[send-ledger] release on shutdown failed:", e); }
  }
  return list.length;
}
export function _openClaimCount(): number { return open.size; }
onShutdown(releaseOpenClaims);

export async function releaseSend(db: Db, userId: number, kind: string, period: string): Promise<void> {
  open.delete(keyOf(userId, kind, period));
  await db.execute(sql`DELETE FROM send_ledger WHERE userId = ${userId} AND kind = ${kind.slice(0, 64)} AND period = ${period.slice(0, 40)}`);
}

/** Most recent period sent for a kind (for "Last sent" in Settings). */
export async function lastSent(db: Db, userId: number, kind: string): Promise<{ period: string; sentAt: string } | null> {
  const res = await db.execute(sql`SELECT period, sentAt FROM send_ledger WHERE userId = ${userId} AND kind = ${kind.slice(0, 64)} ORDER BY sentAt DESC LIMIT 1`);
  const r = rowsOf(res)[0];
  return r ? { period: String(r.period), sentAt: new Date(r.sentAt).toISOString() } : null;
}
