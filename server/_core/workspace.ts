/**
 * Workspaces (multi-tenant foundation, build -278). docs/multi-tenant-plan.md.
 *
 * THE MODEL
 *   - A workspace is one customer: a company or an individual.
 *   - A `users` row is ONE MEMBER of ONE workspace (users.workspaceId). Every
 *     table keyed by userId is therefore inside that workspace by construction;
 *     a query "where userId = ctx.user.id" can never reach another workspace.
 *   - A person in several workspaces has one LOGIN row (accountId NULL: it
 *     holds the email, password hash and tokenVersion) and one further member
 *     row per extra workspace (accountId = the login row's id). The session
 *     cookie names a member row, so "which workspace am I in" is part of the
 *     signed session; switching workspace re-issues the cookie for the other
 *     member row (routers/workspace.ts).
 *   - The workspace OWNER is workspaces.ownerUserId (a member row). ADMIN is
 *     users.role = 'admin' on a member row, so it is per workspace too.
 *   - The platform OPERATOR is users.platformRole = 'operator' on a login row.
 *     The operator manages workspaces (create, suspend, quotas) and never gets
 *     access to a workspace's data through that role.
 *
 * WHAT CAN STILL CROSS WORKSPACES, and how it is closed
 *   Only code that reads rows NOT keyed by the caller's own id: team lists,
 *   "shared with me" scans, background passes, and endpoints that take another
 *   person's id from the client. Those must use wsMemberIds() / sameWorkspace()
 *   / assertSameWorkspace() from this file. `pnpm check:tenancy` lists every
 *   such query; server/tenancy.*.test.ts proves two workspaces stay apart.
 *
 * TESTS: the many older unit tests build users as plain objects with no
 * workspaceId and fake databases that know nothing about workspaces. Under
 * vitest (process.env.VITEST) such a user is in "no workspace model" mode:
 * wsIdOf() returns null and the callers keep their pre-workspace behaviour.
 * Outside tests a user without a workspace matches nothing (workspace 0).
 */
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { users, workspaces, workspaceSettings } from "../../drizzle/schema";
import { getDb, getSystemSetting, setSystemSetting } from "../db";
import { decryptSecret, encryptSecret } from "./secrets";

// (Audit 3: never in production, whatever the environment says)
const LEGACY_OK = !!process.env.VITEST && process.env.NODE_ENV !== "production";
const TTL = 30_000;

export type WsUserLike = {
  id: number;
  workspaceId?: number | null;
  accountId?: number | null;
  openId?: string | null;
  role?: string | null;
  platformRole?: string | null;
};

export type WorkspaceInfo = {
  id: number;
  name: string;
  slug: string;
  status: string;
  ownerUserId: number | null;
  features: Record<string, any>;
  branding: Record<string, any>;
  quotas: Record<string, any>;
  deletedAt: Date | null;
};

function parseObj(v: unknown): Record<string, any> {
  if (!v) return {};
  try { const o = JSON.parse(String(v)); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; }
}

// ── caches ───────────────────────────────────────────────────────────────────
const _ws = new Map<number, { at: number; v: WorkspaceInfo | null }>();
const _members = new Map<number, { at: number; ids: number[] }>();
/**
 * member row id → workspace id. A member row never changes workspace, but a removed one is
 * detached (workspace 0) — Audit 3: entries expire after 10 minutes, so another server
 * instance stops treating a removed member as "same workspace" soon after.
 */
const _userWsRaw = new Map<number, { ws: number; at: number }>();
const USERWS_TTL = 10 * 60_000;
const _userWs = {
  get(id: number): number | undefined { const e = _userWsRaw.get(id); if (!e) return undefined; if (Date.now() - e.at > USERWS_TTL) { _userWsRaw.delete(id); return undefined; } return e.ws; },
  set(id: number, ws: number) { _userWsRaw.set(id, { ws, at: Date.now() }); },
  delete(id: number) { _userWsRaw.delete(id); },
  clear() { _userWsRaw.clear(); },
};

export function invalidateWorkspace(id?: number | null) {
  if (id == null) { _ws.clear(); _members.clear(); } else { _ws.delete(id); _members.delete(id); }
  _active = null;
}
/** A member row was removed or detached: drop what is cached about it. */
export function _forgetUserWorkspace(userId: number) { _userWs.delete(Number(userId)); }
export function _resetWorkspaceCachesForTest() { _ws.clear(); _members.clear(); _userWs.clear(); _active = null; }

export async function getWorkspace(id: number | null | undefined): Promise<WorkspaceInfo | null> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return null;
  const hit = _ws.get(n);
  if (hit && Date.now() - hit.at < TTL) return hit.v;
  const db = await getDb();
  if (!db) return null;
  let v: WorkspaceInfo | null = null;
  const rows: any[] = await db.select().from(workspaces).where(eq(workspaces.id, n)).limit(1);
  const r = rows && rows[0];
  if (r && r.id != null) {
    v = {
      id: Number(r.id), name: String(r.name || ""), slug: String(r.slug || ""), status: String(r.status || "active"),
      ownerUserId: r.ownerUserId == null ? null : Number(r.ownerUserId),
      features: parseObj(r.features), branding: parseObj(r.branding), quotas: parseObj(r.quotas),
      deletedAt: r.deletedAt || null,
    };
  }
  _ws.set(n, { at: Date.now(), v });
  return v;
}

/**
 * The workspace a member row is in.
 *   number > 0  the workspace
 *   0           none (matches nothing) — a row that was never placed
 *   null        tests only: this user object predates the workspace model
 */
export async function wsIdOf(user: WsUserLike | null | undefined): Promise<number | null> {
  if (!user) return LEGACY_OK ? null : 0;
  const raw = (user as any).workspaceId;
  // A row that HAS a workspace column is never "legacy": 0 (or anything that
  // is not a real id) is no workspace at all, in tests as in production.
  if (raw !== undefined && raw !== null) {
    const w0 = Number(raw);
    return Number.isInteger(w0) && w0 > 0 ? w0 : 0;
  }
  const id = Number(user.id);
  if (Number.isInteger(id) && id > 0) {
    const hit = _userWs.get(id);
    if (hit) return hit;
    if ((user as any).workspaceId === undefined) {
      // A partial object ({id, email, …}): read the row.
      try {
        const db = await getDb();
        if (db) {
          const rows: any[] = await db.select({ w: users.workspaceId }).from(users).where(eq(users.id, id)).limit(1);
          const rw = Number(rows && rows[0] && rows[0].w);
          if (Number.isInteger(rw) && rw > 0) { _userWs.set(id, rw); return rw; }
          // the row exists and says "no workspace"
          if (rows && rows[0] && rows[0].w !== undefined && rows[0].w !== null && Number.isInteger(rw)) return 0;
        }
      } catch (e) {
        if (!LEGACY_OK) throw e;
      }
    }
  }
  return LEGACY_OK ? null : 0;
}

/** Every member row id of a workspace (cached 30 s). */
export async function wsMemberIds(wsId: number | null | undefined): Promise<number[]> {
  const n = Number(wsId);
  if (!Number.isInteger(n) || n <= 0) return [];
  const hit = _members.get(n);
  if (hit && Date.now() - hit.at < TTL) return hit.ids;
  const db = await getDb();
  if (!db) return [];
  const rows: any[] = await db.select({ id: users.id }).from(users).where(eq(users.workspaceId, n));
  const ids = rows.map(r => Number(r.id)).filter(x => Number.isInteger(x));
  for (const id of ids) _userWs.set(id, n);
  _members.set(n, { at: Date.now(), ids });
  return ids;
}

/**
 * The member ids the caller may see across: its workspace's members.
 * Returns null ONLY in the tests' no-workspace mode (= no filter, the
 * pre-workspace behaviour). Callers: `const ids = await scopeIds(user);
 * if (ids) conditions.push(inArray(table.userId, ids))` — and with an empty
 * array, return nothing.
 */
export async function scopeIds(user: WsUserLike | null | undefined): Promise<number[] | null> {
  const w = await wsIdOf(user);
  if (w === null) return null;
  return wsMemberIds(w);
}

/** Is `otherUserId` a member of the same workspace as `user`? */
export async function sameWorkspace(user: WsUserLike | null | undefined, otherUserId: number | null | undefined): Promise<boolean> {
  const other = Number(otherUserId);
  if (!user || !Number.isInteger(other) || other <= 0) return false;
  if (other === Number(user.id)) return true;
  const w = await wsIdOf(user);
  if (w === null) return true; // tests: no workspace model
  if (!w) return false;
  const known = _userWs.get(other);
  if (known != null) return known === w;
  const ids = await wsMemberIds(w);
  if (ids.includes(other)) return true;
  // Not in the cached list: it may have joined in the last 30 s — ask the row.
  const ow = await wsIdOf({ id: other });
  return ow === w;
}

/** Refuse (as "not found" — never confirm that the id exists elsewhere). */
export async function assertSameWorkspace(user: WsUserLike | null | undefined, otherUserId: number | null | undefined): Promise<void> {
  if (!(await sameWorkspace(user, otherUserId))) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No such person in this workspace." });
  }
}

/** Keep only the ids that are members of the caller's workspace. */
export async function filterToWorkspace(user: WsUserLike | null | undefined, ids: Array<number | string | null | undefined>): Promise<number[]> {
  const nums = Array.from(new Set((ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0)));
  const scope = await scopeIds(user);
  if (scope === null) return nums;
  const set = new Set(scope);
  return nums.filter(n => set.has(n));
}

// ── background jobs ──────────────────────────────────────────────────────────
let _active: { at: number; ids: Set<number> | null } | null = null;
/**
 * The members background jobs may act for: everyone in an ACTIVE workspace
 * (a suspended or deleted workspace gets no digests, check-ins, syncs…).
 * Cached 60 s. Returns null ONLY in the tests' no-workspace mode (no filter).
 *
 * Every job still handles each person strictly on their own: it reads that
 * member's rows and writes / mails that member. This only decides WHO is
 * included in the pass.
 */
export async function activeMemberIds(): Promise<Set<number> | null> {
  if (_active && Date.now() - _active.at < 60_000) return _active.ids;
  let ids: Set<number> | null = new Set<number>();
  try {
    const db = await getDb();
    if (!db) return LEGACY_OK ? null : new Set<number>();
    // tenancy: background — which workspaces are active (ids only)
    const wsRows: any[] = await db.select({ id: workspaces.id, status: workspaces.status, deletedAt: workspaces.deletedAt }).from(workspaces);
    let okWs = (wsRows || []).filter(w => w && w.id != null && String(w.status || "active") === "active" && !w.deletedAt).map(w => Number(w.id));
    // …minus those locked for non-payment (Audit 3): a locked workspace gets no
    // check-ins, digests, reports, syncs, nudges or AI spend (it used to get all of them).
    try {
      const { billingSummaries } = await import("./billing");
      const sums = await billingSummaries();
      if (sums.size) okWs = okWs.filter(id => !sums.get(id)?.locked);
    } catch { /* billing tables unreadable: nobody is locked */ }
    if (!(wsRows || []).some(w => w && w.id != null)) {
      // no workspace rows at all: the tests' fake databases
      ids = LEGACY_OK ? null : new Set<number>();
    } else if (okWs.length) {
      const rows: any[] = await db.select({ id: users.id }).from(users).where(inArray(users.workspaceId, okWs));
      for (const r of rows) ids.add(Number(r.id));
    }
  } catch (e) {
    if (LEGACY_OK) ids = null; else { console.error("[workspace] could not list active members:", e); ids = new Set<number>(); }
  }
  _active = { at: Date.now(), ids };
  return ids;
}
/** Ids of the active workspaces (null = the tests' no-workspace mode). */
export async function activeWorkspaceIds(): Promise<number[] | null> {
  try {
    const db = await getDb();
    if (!db) return LEGACY_OK ? null : [];
    // tenancy: background — which workspaces are active (ids only)
    const wsRows: any[] = await db.select({ id: workspaces.id, status: workspaces.status, deletedAt: workspaces.deletedAt }).from(workspaces);
    if (!(wsRows || []).some(w => w && w.id != null)) return LEGACY_OK ? null : [];
    let ids = wsRows.filter(w => w && w.id != null && String(w.status || "active") === "active" && !w.deletedAt).map(w => Number(w.id));
    // …and those locked for non-payment (build -279): no digests, check-ins or AI spend until it is sorted out
    try {
      const { billingSummaries } = await import("./billing");
      const sums = await billingSummaries();
      if (sums.size) ids = ids.filter(id => !sums.get(id)?.locked);
    } catch { /* billing tables unreadable: nobody is locked */ }
    return ids;
  } catch (e) {
    if (LEGACY_OK) return null;
    console.error("[workspace] could not list active workspaces:", e);
    return [];
  }
}
/** May a background job act for this member right now? */
export async function isActiveMember(userId: number): Promise<boolean> {
  const ids = await activeMemberIds();
  return ids === null || ids.has(Number(userId));
}

// ── owner / admin / operator ────────────────────────────────────────────────
/**
 * Is this member the OWNER of their workspace?
 *   true / false  decided by the workspace
 *   null          no workspace model here (tests) → the caller's legacy rule
 */
export async function workspaceOwnerVerdict(user: WsUserLike | null | undefined): Promise<boolean | null> {
  if (!user) return false;
  const w = await wsIdOf(user);
  if (w === null) return null;
  if (!w) return false;
  const ws = await getWorkspace(w);
  if (!ws) return LEGACY_OK ? null : false;
  if (ws.ownerUserId != null) return ws.ownerUserId === Number(user.id);
  // No owner recorded yet. Only the first workspace can be in that state on
  // its own (between migration 0063 and the boot pass, or a fresh install):
  // there the old rule decides. Any other workspace waits for its invited owner.
  if (w !== 1) return false;
  return legacyOwnerOfFirstWorkspace(user);
}

async function legacyOwnerOfFirstWorkspace(user: WsUserLike): Promise<boolean> {
  try {
    const { ENV } = await import("./env");
    if (ENV.ownerOpenId && user.openId === ENV.ownerOpenId) return true;
    const db = await getDb();
    if (!db) return false;
    if (ENV.ownerOpenId) {
      const cfg: any[] = await db.select({ id: users.id }).from(users).where(eq(users.openId, ENV.ownerOpenId)).limit(1);
      if (cfg[0]) return Number(cfg[0].id) === Number(user.id);
    }
    const first: any[] = await db.select({ id: users.id }).from(users).where(eq(users.workspaceId, 1)).orderBy(asc(users.id)).limit(1);
    return !!first[0] && Number(first[0].id) === Number(user.id);
  } catch { return false; }
}

/** The owner's member row id of a workspace (null when none yet). */
export async function workspaceOwnerId(wsId: number | null | undefined): Promise<number | null> {
  const ws = await getWorkspace(wsId);
  return ws ? ws.ownerUserId : null;
}

/** The login row behind a member row (itself when it is the login). */
export function accountIdOf(user: WsUserLike): number {
  const a = Number((user as any).accountId);
  return Number.isInteger(a) && a > 0 ? a : Number(user.id);
}

/**
 * Platform operator? sdk.authenticateRequest copies platformRole from the
 * login row onto ctx.user, so for a request this is a field read.
 *   null = no workspace model here (tests) → the caller's legacy rule.
 */
export async function operatorVerdict(user: WsUserLike | null | undefined): Promise<boolean | null> {
  if (!user) return false;
  if ((user as any).platformRole === "operator") return true;
  if ((user as any).platformRole !== undefined && (user as any).workspaceId !== undefined) return false;
  const w = await wsIdOf(user);
  if (w === null) return null;
  try {
    const db = await getDb();
    if (!db) return false;
    const rows: any[] = await db.select({ accountId: users.accountId, platformRole: users.platformRole }).from(users).where(eq(users.id, Number(user.id))).limit(1);
    const r = rows[0];
    if (!r) return false;
    if (r.platformRole === "operator") return true;
    if (r.accountId) {
      const acc: any[] = await db.select({ platformRole: users.platformRole }).from(users).where(eq(users.id, Number(r.accountId))).limit(1);
      return !!acc[0] && acc[0].platformRole === "operator";
    }
    return false;
  } catch { return false; }
}

/**
 * Every member row of the platform operator(s): the login rows flagged
 * 'operator' and their member rows in further workspaces. Platform-level
 * credentials (the platform's Drive file store) are only ever read from these.
 */
export async function operatorMemberIds(): Promise<number[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    // tenancy: operator — the platform operator's own rows
    const ops: any[] = await db.select({ id: users.id }).from(users).where(eq(users.platformRole, "operator"));
    const ids = ops.map(r => Number(r.id)).filter(n => Number.isInteger(n));
    if (!ids.length) return [];
    const more: any[] = await db.select({ id: users.id }).from(users).where(inArray(users.accountId, ids));
    return Array.from(new Set(ids.concat(more.map(r => Number(r.id)))));
  } catch { return []; }
}

export async function isOperator(user: WsUserLike | null | undefined): Promise<boolean> {
  const v = await operatorVerdict(user);
  if (v !== null) return v;
  // tests without a workspace model: the old "owner" rule stood for the operator
  const { isOwnerCtxUser } = await import("../routers/appData");
  return isOwnerCtxUser(user as any);
}

export async function assertOperator(user: WsUserLike | null | undefined): Promise<void> {
  if (!(await isOperator(user))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the platform operator can do this." });
  }
}

// ── feature flags ────────────────────────────────────────────────────────────
/** Features of a member's workspace. In the tests' no-workspace mode every
 *  feature the original workspace had is on. */
export async function featuresOf(user: WsUserLike | null | undefined): Promise<Record<string, any>> {
  const w = await wsIdOf(user);
  if (w === null) return { atlas: true, cfLabels: true };
  const ws = await getWorkspace(w);
  return ws ? ws.features : {};
}
export async function hasFeature(user: WsUserLike | null | undefined, name: string): Promise<boolean> {
  const on = !!(await featuresOf(user))[name];
  if (!on || name !== "atlas") return on;
  // Audit 3: the Atlas feed (one company's HR and finance data, from platform-wide credentials) is
  // the operator's own workspace's only — a console tick can't hand it to a customer.
  const w = await wsIdOf(user);
  if (w === null) return true; // tests' no-workspace mode
  const { operatorWorkspaceId } = await import("./mailTrust");
  const op = await operatorWorkspaceId();
  return op != null ? w === op : w === 1;
}

// ── per-workspace settings ───────────────────────────────────────────────────
const SECRET_KEY = /^aiKey_/;
/** Settings that belong to a workspace. Everything else stays in system_settings. */
export const WORKSPACE_SETTING_KEYS = new Set(["aiProvider", "aiKey_openai", "aiKey_claude", "aiKey_gemini", "aiKey_openrouter", "aiModel_openrouter", "notificationSender", "teamStarterPreset"]);

export async function getWorkspaceSetting(wsId: number | null | undefined, key: string): Promise<string | undefined> {
  const n = Number(wsId);
  if (!Number.isInteger(n) || n <= 0) return undefined;
  const db = await getDb();
  if (!db) return undefined;
  const rows: any[] = await db.select().from(workspaceSettings).where(and(eq(workspaceSettings.workspaceId, n), eq(workspaceSettings.key, key))).limit(1);
  if (!rows.length) return undefined;
  return SECRET_KEY.test(key) ? decryptSecret(rows[0].value) : rows[0].value;
}

export async function setWorkspaceSetting(wsId: number | null | undefined, key: string, value: string): Promise<void> {
  const n = Number(wsId);
  if (!Number.isInteger(n) || n <= 0) throw new Error("setWorkspaceSetting: no workspace");
  const db = await getDb();
  if (!db) return;
  if (SECRET_KEY.test(key)) value = encryptSecret(value);
  await db.insert(workspaceSettings).values({ workspaceId: n, key, value }).onDuplicateKeyUpdate({ set: { value } });
}

export async function deleteWorkspaceSetting(wsId: number | null | undefined, key: string): Promise<void> {
  const n = Number(wsId);
  if (!Number.isInteger(n) || n <= 0) return;
  const db = await getDb();
  if (!db) return;
  await db.delete(workspaceSettings).where(and(eq(workspaceSettings.workspaceId, n), eq(workspaceSettings.key, key)));
}

/**
 * A workspace-level setting for the member's workspace. In the tests'
 * no-workspace mode it is the old global system_settings row.
 */
export async function getSettingFor(user: WsUserLike | null | undefined, key: string): Promise<string | undefined> {
  const w = await wsIdOf(user);
  if (w === null) return getSystemSetting(key);
  return getWorkspaceSetting(w, key);
}
export async function setSettingFor(user: WsUserLike | null | undefined, key: string, value: string): Promise<void> {
  const w = await wsIdOf(user);
  if (w === null) return setSystemSetting(key, value);
  return setWorkspaceSetting(w, key, value);
}

// ── a person's workspaces ────────────────────────────────────────────────────
export type MembershipInfo = { workspaceId: number; userId: number; openId: string; name: string; slug: string; status: string; role: "owner" | "admin" | "member" };

/** Every workspace the login behind `user` belongs to (deleted ones left out). */
export async function membershipsOf(user: WsUserLike): Promise<MembershipInfo[]> {
  const db = await getDb();
  if (!db) return [];
  const acc = accountIdOf(user);
  // tenancy: the caller's own login — its member rows in each of its workspaces
  const rows: any[] = await db.select({ id: users.id, openId: users.openId, role: users.role, workspaceId: users.workspaceId })
    .from(users).where(or(eq(users.id, acc), eq(users.accountId, acc)));
  const out: MembershipInfo[] = [];
  for (const r of rows) {
    const ws = await getWorkspace(Number(r.workspaceId));
    if (!ws || ws.status === "deleted") continue;
    out.push({
      workspaceId: ws.id, userId: Number(r.id), openId: String(r.openId), name: ws.name, slug: ws.slug, status: ws.status,
      role: ws.ownerUserId === Number(r.id) ? "owner" : (String(r.role) === "admin" ? "admin" : "member"),
    });
  }
  out.sort((a, b) => a.workspaceId - b.workspaceId);
  return out;
}

// ── boot pass ────────────────────────────────────────────────────────────────
/**
 * Runs at every start (idempotent, never throws):
 *   1. workspace 1 exists (migration 0063 creates it; a hand-made database may not have it);
 *   2. workspace 1 has an owner — the OWNER_OPEN_ID account, else its first member;
 *   3. somebody is the platform operator — that same person, the first time.
 * After the first run nothing here changes anything.
 */
export async function ensureWorkspaceBootstrap(): Promise<{ ownerSet?: number; operatorSet?: number } | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const out: { ownerSet?: number; operatorSet?: number } = {};
    let rows: any[] = await db.select().from(workspaces).where(eq(workspaces.id, 1)).limit(1);
    if (!rows.length) {
      await db.insert(workspaces).values({ id: 1, name: "LevelUp", slug: "main", status: "active", features: JSON.stringify({ atlas: true, cfLabels: true }) } as any);
      rows = await db.select().from(workspaces).where(eq(workspaces.id, 1)).limit(1);
    }
    const ws1 = rows[0];
    let ownerId: number | null = ws1 && ws1.ownerUserId != null ? Number(ws1.ownerUserId) : null;
    if (ownerId == null) {
      const { ENV } = await import("./env");
      let cand: any[] = [];
      if (ENV.ownerOpenId) cand = await db.select({ id: users.id }).from(users).where(and(eq(users.openId, ENV.ownerOpenId), eq(users.workspaceId, 1))).limit(1);
      if (!cand.length) cand = await db.select({ id: users.id }).from(users).where(eq(users.workspaceId, 1)).orderBy(asc(users.id)).limit(1);
      if (cand.length) {
        ownerId = Number(cand[0].id);
        await db.update(workspaces).set({ ownerUserId: ownerId }).where(and(eq(workspaces.id, 1), isNull(workspaces.ownerUserId)));
        out.ownerSet = ownerId;
        console.log(`[workspace] workspace 1 owner set to user ${ownerId}`);
      }
    }
    if (ownerId != null) {
      // tenancy: operator — is anybody the platform operator yet?
      const ops: any[] = await db.select({ id: users.id }).from(users).where(eq(users.platformRole, "operator")).limit(1);
      if (!ops.length) {
        await db.update(users).set({ platformRole: "operator" }).where(and(eq(users.id, ownerId), isNull(users.accountId)));
        out.operatorSet = ownerId;
        console.log(`[workspace] platform operator set to user ${ownerId}`);
      }
    }
    invalidateWorkspace(1);
    return out;
  } catch (e) {
    console.error("[workspace] bootstrap failed:", e);
    return null;
  }
}

/** A URL-safe unique slug for a new workspace. */
export function slugify(name: string): string {
  const s = String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return s || "workspace";
}
