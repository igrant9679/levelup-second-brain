/**
 * Who may carry system mail, and how mail servers are trusted (audit F8).
 *
 * - System mail (password resets, invites, digests, coach check-ins) goes out
 *   ONLY through accounts that belong to the workspace owner. It used to fall
 *   back to every member's SMTP account and every connected Google/Microsoft
 *   account, so a member-controlled mailbox could end up carrying (and seeing
 *   copies of) reset links and invites.
 * - TLS certificates are verified. A mail server with a self-signed
 *   certificate can be allowed again with MAIL_TLS_INSECURE=true on Railway
 *   (not recommended: anyone on the network path could read the password).
 */
import { asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";

export function mailTlsOptions(): { rejectUnauthorized: boolean } {
  return { rejectUnauthorized: String(process.env.MAIL_TLS_INSECURE || "").toLowerCase() !== "true" };
}

let _cache: { at: number; ids: Set<number> } | null = null;
/** The owner's user ids — the same rule as isOwnerCtxUser: the OWNER_OPEN_ID
 *  account, and the first registered user. Cached 60 s. */
export async function ownerUserIds(): Promise<Set<number>> {
  if (_cache && Date.now() - _cache.at < 60_000) return _cache.ids;
  const ids = new Set<number>();
  try {
    const db = await getDb();
    if (db) {
      const { ENV } = await import("./env");
      if (ENV.ownerOpenId) {
        const r = await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
        if (r[0]) ids.add(r[0].id);
      }
      const first = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
      if (first[0]) ids.add(first[0].id);
    }
  } catch { /* empty set: no system sender rather than a member's */ }
  _cache = { at: Date.now(), ids };
  return ids;
}
export function _resetOwnerIdsForTest() { _cache = null; }
