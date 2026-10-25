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

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function affected(res: any): number {
  const h = Array.isArray(res) ? res[0] : res;
  return Number(h?.affectedRows ?? h?.rowsAffected ?? 0);
}
function rowsOf(res: any): any[] {
  return Array.isArray(res?.[0]) ? res[0] : Array.isArray(res) ? res : [];
}

/** true = this caller owns the send; false = someone already did. */
export async function claimSend(db: Db, userId: number, kind: string, period: string): Promise<boolean> {
  const res = await db.execute(sql`INSERT IGNORE INTO send_ledger (userId, kind, period) VALUES (${userId}, ${kind.slice(0, 64)}, ${period.slice(0, 40)})`);
  return affected(res) === 1;
}

export async function releaseSend(db: Db, userId: number, kind: string, period: string): Promise<void> {
  await db.execute(sql`DELETE FROM send_ledger WHERE userId = ${userId} AND kind = ${kind.slice(0, 64)} AND period = ${period.slice(0, 40)}`);
}

/** Most recent period sent for a kind (for "Last sent" in Settings). */
export async function lastSent(db: Db, userId: number, kind: string): Promise<{ period: string; sentAt: string } | null> {
  const res = await db.execute(sql`SELECT period, sentAt FROM send_ledger WHERE userId = ${userId} AND kind = ${kind.slice(0, 64)} ORDER BY sentAt DESC LIMIT 1`);
  const r = rowsOf(res)[0];
  return r ? { period: String(r.period), sentAt: new Date(r.sentAt).toISOString() } : null;
}
