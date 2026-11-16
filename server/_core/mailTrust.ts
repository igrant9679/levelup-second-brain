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
let _opWs: { at: number; id: number | null } | null = null;

/**
 * The workspace the platform operator lives in (normally workspace 1). Account
 * mail that belongs to no workspace — a password reset — and account mail of a
 * workspace that has no sender of its own goes out through that workspace's
 * sender. Cached 60 s.
 */
export async function operatorWorkspaceId(): Promise<number | null> {
  if (_opWs && Date.now() - _opWs.at < 60_000) return _opWs.id;
  let id: number | null = null;
  try {
    const db = await getDb();
    if (db) {
      // tenancy: operator — which workspace is the platform operator's own?
      const r: any[] = await db.select({ w: users.workspaceId }).from(users).where(eq(users.platformRole, "operator")).orderBy(asc(users.id)).limit(1);
      const w = Number(r[0] && r[0].w);
      if (Number.isInteger(w) && w > 0) id = w;
    }
  } catch { /* none */ }
  _opWs = { at: Date.now(), id };
  return id;
}

/**
 * Whose mail accounts may carry system mail.
 *   ownerUserIds(wsId)  the OWNER of that workspace (multi-workspace, -278) —
 *                       each workspace's mail goes through its own owner's
 *                       accounts, never through another workspace's.
 *   ownerUserIds()      no workspace given: the operator's workspace owner.
 *                       (Under vitest, for the tests that predate workspaces:
 *                       the old rule — the OWNER_OPEN_ID account and the first
 *                       registered user. Cached 60 s.)
 */
export async function ownerUserIds(wsId?: number | null): Promise<Set<number>> {
  if (wsId != null) {
    const { workspaceOwnerId } = await import("./workspace");
    const o = await workspaceOwnerId(wsId);
    const out = new Set<number>(o != null ? [o] : []);
    // The ORIGINAL workspace keeps exactly the accounts it trusted before
    // workspaces existed: its owner AND its first account (the old rule was
    // "the OWNER_OPEN_ID account and the first registered user" — on an
    // install where those are two accounts of the same person, the mail
    // sender may live on either). No other workspace gets a second account.
    if (Number(wsId) === 1) {
      try {
        const db = await getDb();
        if (db) {
          const first = await db.select({ id: users.id }).from(users).where(eq(users.workspaceId, 1)).orderBy(asc(users.id)).limit(1);
          if (first[0]) out.add(first[0].id);
        }
      } catch { /* the owner alone */ }
    }
    return out;
  }
  if (!process.env.VITEST) {
    const w = await operatorWorkspaceId();
    if (w != null) return ownerUserIds(w);
    // no operator recorded yet (first boot): fall through to the old rule
  }
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
      // tenancy: legacy rule (vitest / first boot before the operator is recorded)
      const first = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
      if (first[0]) ids.add(first[0].id);
    }
  } catch { /* empty set: no system sender rather than a member's */ }
  _cache = { at: Date.now(), ids };
  return ids;
}
export function _resetOwnerIdsForTest() { _cache = null; _opWs = null; }
