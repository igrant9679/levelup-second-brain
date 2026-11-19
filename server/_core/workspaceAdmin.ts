/**
 * Workspace lifecycle (multi-workspace, build -278): create, export, delete.
 *
 *   createWorkspace()    the platform operator makes a workspace and invites
 *                        its owner (workspace router → opCreate).
 *   dumpWorkspace()      everything that belongs to ONE workspace, as JSON —
 *                        the owner's export (Settings → Workspace → Export).
 *   purgeWorkspace()     hard-delete a workspace's rows. Runs only for a
 *                        workspace marked deleted more than GRACE_DAYS ago
 *                        (purgeDeletedWorkspaces, daily), or in tests.
 *
 * "Belongs to a workspace" is decided by table shape, so a table added later
 * is covered without touching this file:
 *   - a table with a `workspaceId` column → rows with that workspace id;
 *   - a table with a `userId` column      → rows of the workspace's members;
 *   - `users`                              → the member rows themselves;
 *   - anything else (help articles, rate limits, the error log, platform
 *     settings) is platform content and is never exported or purged.
 */
import { randomBytes } from "crypto";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { users, workspaces } from "../../drizzle/schema";
import { redactRow } from "./backup";
import { invalidateWorkspace, slugify, wsMemberIds } from "./workspace";

export const GRACE_DAYS = 30;

const rowsOf = (r: any): any[] => (Array.isArray(r?.[0]) ? r[0] : Array.isArray(r) ? r : []);

/** Every table with the column that ties its rows to a workspace. */
async function workspaceTables(db: any): Promise<Array<{ name: string; by: "workspaceId" | "userId" | "users" | "workspaces" }>> {
  const names = rowsOf(await db.execute(sql`SHOW TABLES`)).map((r) => String(Object.values(r)[0])).filter((n) => /^[A-Za-z0-9_]+$/.test(n)).sort();
  const out: Array<{ name: string; by: "workspaceId" | "userId" | "users" | "workspaces" }> = [];
  for (const name of names) {
    if (name === "__drizzle_migrations") continue;
    // the platform's memory of who already had a free trial outlives the workspace (Audit 3)
    if (name === "trial_claims") continue;
    if (name === "users") { out.push({ name, by: "users" }); continue; }
    if (name === "workspaces") { out.push({ name, by: "workspaces" }); continue; }
    const cols = rowsOf(await db.execute(sql.raw("SHOW COLUMNS FROM `" + name + "`"))).map((c) => String(c.Field));
    if (cols.includes("workspaceId")) out.push({ name, by: "workspaceId" });
    else if (cols.includes("userId")) out.push({ name, by: "userId" });
  }
  return out;
}

function whereFor(by: string, wsId: number, memberIds: number[]): string | null {
  const ids = memberIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
  if (by === "workspaces") return "`id` = " + wsId;
  if (by === "workspaceId") return "`workspaceId` = " + wsId;
  if (!ids.length) return null;
  if (by === "users") return "`id` IN (" + ids.join(",") + ")";
  return "`userId` IN (" + ids.join(",") + ")";
}

export type WorkspaceDump = { version: 1; workspaceId: number; name: string; createdAt: string; note: string; tables: Record<string, { count: number; rows: any[] }> };

/** Everything in one workspace. Secrets (passwords, tokens, API keys) are redacted. */
export async function dumpWorkspace(wsId: number): Promise<WorkspaceDump> {
  const db: any = await getDb();
  if (!db) throw new Error("Database unavailable");
  const n = Number(wsId);
  if (!Number.isInteger(n) || n <= 0) throw new Error("No workspace");
  invalidateWorkspace(n);
  const members = await wsMemberIds(n);
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, n)).limit(1);
  const tables: WorkspaceDump["tables"] = {};
  for (const t of await workspaceTables(db)) {
    const where = whereFor(t.by, n, members);
    if (!where) { tables[t.name] = { count: 0, rows: [] }; continue; }
    let rows = rowsOf(await db.execute(sql.raw("SELECT * FROM `" + t.name + "` WHERE " + where))).map((row) => redactRow(t.name, row));
    if (t.name === "users") rows = rows.map((r) => { const { passwordHash: _p, tokenVersion: _t, platformRole: _r, ...rest } = r; return rest; });
    if (t.name === "workspaces") rows = rows.map((r) => ({ ...r, storage: r.storage ? "[redacted]" : null }));
    if (t.name === "workspace_settings") rows = rows.map((r) => (/^aiKey_/.test(String(r.key)) ? { ...r, value: "[redacted]" } : r));
    // Audit 3: a push subscription's address and keys let whoever holds them take over that device's
    // notifications — not in the owner's export (the encrypted nightly backup keeps them for a restore)
    if (t.name === "push_subscriptions") rows = rows.map((r) => ({ ...r, endpoint: "[redacted]", p256dh: "[redacted]", auth: "[redacted]" }));
    if (rows.length) tables[t.name] = { count: rows.length, rows };
  }
  return {
    version: 1, workspaceId: n, name: String(ws?.name || ""), createdAt: new Date().toISOString(),
    note: "Everything stored for this workspace. Secret values (passwords, tokens, API keys) are redacted. Uploaded files are listed in the files table; download them with the links there.",
    tables,
  };
}

/**
 * Remove every row of a workspace. A LOGIN row whose person is also in other
 * workspaces must survive (it holds their password): it is detached to
 * workspace 0 instead, with its own items here removed like everyone else's.
 */
export async function purgeWorkspace(wsId: number): Promise<{ tables: number; rows: number }> {
  const db: any = await getDb();
  if (!db) throw new Error("Database unavailable");
  const n = Number(wsId);
  if (!Number.isInteger(n) || n <= 0) throw new Error("No workspace");
  invalidateWorkspace(n);
  const members = await wsMemberIds(n);
  // Audit 3: members removed earlier — their rows are this workspace's too. Only ids that are no
  // longer anyone's member row elsewhere (deleted, or a login detached to workspace 0) are added.
  const former: number[] = [];
  try {
    const { getWorkspaceSetting } = await import("./workspace");
    const list = JSON.parse(String((await getWorkspaceSetting(n, "formerMembers")) || "[]"));
    for (const id of Array.isArray(list) ? list : []) {
      const x = Number(id);
      if (!Number.isInteger(x) || x <= 0 || members.includes(x)) continue;
      const still = rowsOf(await db.execute(sql.raw("SELECT `workspaceId` FROM `users` WHERE `id` = " + x + " LIMIT 1")));
      if (!still.length || Number(still[0].workspaceId) === 0) former.push(x);
    }
  } catch { /* none recorded */ }
  let tablesTouched = 0, rowsGone = 0;
  const count = (r: any) => Number(r?.[0]?.affectedRows ?? r?.affectedRows ?? 0);
  // 1. everything keyed to the workspace or its members (users last, below)
  for (const t of await workspaceTables(db)) {
    if (t.by === "users" || t.by === "workspaces") continue;
    const where = whereFor(t.by, n, t.by === "userId" ? [...members, ...former] : members);
    if (!where) continue;
    const c = count(await db.execute(sql.raw("DELETE FROM `" + t.name + "` WHERE " + where)));
    if (c) { tablesTouched++; rowsGone += c; }
  }
  // 2. the member rows
  for (const id of members) {
    const others = rowsOf(await db.execute(sql.raw("SELECT `id` FROM `users` WHERE `accountId` = " + Number(id) + " LIMIT 1")));
    if (others.length) await db.execute(sql.raw("UPDATE `users` SET `workspaceId` = 0, `role` = 'user' WHERE `id` = " + Number(id)));
    else { rowsGone += count(await db.execute(sql.raw("DELETE FROM `users` WHERE `id` = " + Number(id)))); }
  }
  // 3. the workspace itself
  rowsGone += count(await db.execute(sql.raw("DELETE FROM `workspaces` WHERE `id` = " + n)));
  invalidateWorkspace(n);
  console.log(`[workspace] purged workspace ${n}: ${rowsGone} rows in ${tablesTouched} tables`);
  return { tables: tablesTouched, rows: rowsGone };
}

/** Daily: hard-delete workspaces that were marked deleted more than GRACE_DAYS ago. */
export async function purgeDeletedWorkspaces(now = new Date()): Promise<number> {
  const db: any = await getDb();
  if (!db) return 0;
  const cutoff = new Date(now.getTime() - GRACE_DAYS * 86400e3);
  const due: any[] = await db.select({ id: workspaces.id }).from(workspaces).where(and(eq(workspaces.status, "deleted"), isNotNull(workspaces.deletedAt), lt(workspaces.deletedAt, cutoff)));
  let done = 0;
  for (const w of due) {
    if (Number(w.id) === 1) continue; // the original workspace is never purged by a timer
    // Audit 3: never purge a workspace whose subscription could not be stopped — its billing row is
    // the only link between Stripe and the workspace (the daily job retries the cancel; purge waits).
    try {
      const { cancelSubscriptionNow } = await import("./billing");
      if (!(await cancelSubscriptionNow(Number(w.id)))) { console.error(`[workspace] not purging ${w.id}: its subscription is still live`); continue; }
    } catch (e) { console.error(`[workspace] not purging ${w.id}:`, e); continue; }
    try {
      try { const { purgeWorkspaceFiles } = await import("./workspaceFiles"); await purgeWorkspaceFiles(Number(w.id)); } catch (e) { console.error(`[workspace] file purge failed for ${w.id}:`, e); }
      await purgeWorkspace(Number(w.id)); done++;
    } catch (e) { console.error(`[workspace] purge failed for ${w.id}:`, e); }
  }
  return done;
}

/** A new, empty workspace with no owner yet. */
export async function createWorkspace(o: { name: string; createdBy?: number | null; features?: Record<string, any> }): Promise<{ id: number; slug: string }> {
  const db: any = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = String(o.name || "").trim().slice(0, 120);
  if (!name) throw new Error("A workspace needs a name");
  const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
  const ins: any = await db.insert(workspaces).values({ name, slug, status: "active", createdBy: o.createdBy ?? null, features: JSON.stringify(o.features || {}) });
  const id = Number(ins?.[0]?.insertId ?? ins?.insertId);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Could not create the workspace");
  invalidateWorkspace(id);
  return { id, slug };
}

/** Member count per workspace (operator console). */
export async function memberCounts(): Promise<Map<number, number>> {
  const db: any = await getDb();
  const out = new Map<number, number>();
  if (!db) return out;
  // tenancy: operator — a head count per workspace, nothing else
  const rows: any[] = await db.select({ w: users.workspaceId, n: sql<number>`count(*)` }).from(users).groupBy(users.workspaceId);
  for (const r of rows) out.set(Number(r.w), Number(r.n));
  return out;
}
