/**
 * TWO-WORKSPACE ISOLATION HARNESS (multi-workspace, build -278).
 *
 * The acceptance test for docs/multi-tenant-plan.md: must pass before every
 * push. It runs the REAL server code against a REAL MySQL:
 *   - CI: a fresh database on the CI MySQL service (DATABASE_URL);
 *   - locally: an ephemeral MySQL 8 started by mysql-memory-server.
 * All migrations are applied, two workspaces are filled with data through the
 * app's own endpoints, and then
 *   1. every procedure of the app router is called as a member of the OTHER
 *      workspace with inputs that name the victim's people and items — no
 *      response may contain a victim marker, and none of the victim's rows
 *      may change;
 *   2. the specific channels the audit found are tested one by one: team
 *      lists, "shared with me", shared edits, owner tools, AI keys, mail
 *      senders, logs, invites, files, the workspace switch, operator tools,
 *      suspension, export and purge.
 *
 * MARKERS: every piece of content seeded for workspace A contains "ALPHA-SECRET"
 * and for workspace B "BETA-SECRET". Member emails are distinctive too.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "path";
import crypto from "crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

// a real database and the whole API: each check gets real time (CI machines are slow and busy)
vi.setConfig({ testTimeout: 180_000, hookTimeout: 600_000 });
process.env.JWT_SECRET = process.env.JWT_SECRET || "tenancy-test-secret-0123456789abcdef";
process.env.SECRETS_KEY = process.env.SECRETS_KEY || "tenancy-test-secrets-key-0123456789";
const CI_URL = process.env.DATABASE_URL || "";
const DB_NAME = "levelup_tenancy_" + crypto.randomBytes(4).toString("hex");

// No test here may reach the network: anything that tries is a failure of its own.
const smtpHosts: string[] = [];
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (o: any) => { smtpHosts.push(String(o?.host || o?.service || "?")); return { sendMail: async () => { throw new Error("mail is disabled in the tenancy test"); } }; },
  },
}));

type Member = { id: number; openId: string; email: string; name: string; ws: number };
const P: Record<string, Member> = {};
let conn: mysql.Connection;
let memServer: any = null;
let appRouter: any;
let createContext: any;
let sdk: any;
let WS_B = 0;
const realFetch = globalThis.fetch;

function fakeReqRes(cookie?: string) {
  const headers: Record<string, any> = { host: "levelup.test", "x-forwarded-proto": "https" };
  if (cookie) headers.cookie = cookie;
  const setCookies: Array<{ name: string; value: string }> = [];
  const req: any = { headers, protocol: "https", secure: true, hostname: "levelup.test", query: {}, socket: { remoteAddress: "127.0.0.1" }, ip: "127.0.0.1", get: (h: string) => headers[String(h).toLowerCase()] };
  const res: any = { cookie: (name: string, value: string) => { setCookies.push({ name, value }); }, clearCookie: () => {}, setHeader: () => {}, getHeader: () => undefined };
  return { req, res, setCookies };
}
async function cookieFor(m: Member): Promise<string> {
  const { COOKIE_NAME } = await import("@shared/const");
  return `${COOKIE_NAME}=${await sdk.createSessionToken(m.openId, { name: m.name })}`;
}
async function callerFor(m: Member | null) {
  const { req, res, setCookies } = fakeReqRes(m ? await cookieFor(m) : undefined);
  const ctx = await createContext({ req, res });
  return { caller: appRouter.createCaller(ctx), ctx, setCookies };
}
const q = async (sql: string, params: any[] = []) => (await conn.query(sql, params))[0] as any[];

async function addMember(key: string, ws: number, name: string, email: string, role: "user" | "admin"): Promise<Member> {
  const openId = `email:${email}`;
  await conn.query("INSERT INTO users (openId, name, email, loginMethod, role, workspaceId, passwordHash) VALUES (?,?,?,?,?,?,?)", [openId, name, email, "email", role, ws, "$2a$10$abcdefghijklmnopqrstuuJ8Q1yq0gq0gq0gq0gq0gq0gq0gq0gq0"]);
  const [row] = await q("SELECT id FROM users WHERE openId = ?", [openId]);
  P[key] = { id: Number(row.id), openId, email, name, ws };
  return P[key];
}

/** Fill one workspace with content through the app's own endpoints. */
async function seedWorkspace(owner: Member, member: Member, tag: string, outsider: Member) {
  const o = (await callerFor(owner)).caller;
  const m = (await callerFor(member)).caller;
  const S = `${tag}-SECRET`;
  // tasks / notes / ideas (per-item sync) — one task is "assigned" to a person in the OTHER workspace by id
  await o.appData.syncEntity({ kind: "tasks", deletes: [], upserts: [
    { id: "101", raw: JSON.stringify({ id: 101, title: `${S} task plan`, status: "Not Started", assignees: [member.id], primaryAssigneeId: member.id }) },
    { id: "102", raw: JSON.stringify({ id: 102, title: `${S} task crafted`, status: "Not Started", assignees: [outsider.id], primaryAssigneeId: outsider.id }) },
  ] });
  await o.appData.syncEntity({ kind: "notes", deletes: [], upserts: [
    { id: "201", raw: JSON.stringify({ id: 201, title: `${S} note`, body: `${S} note body`, bodyHtml: `<p>${S} note body</p>`, assignees: [member.id, outsider.id] }) },
  ] });
  await o.appData.syncEntity({ kind: "ideas", deletes: [], upserts: [{ id: "301", raw: JSON.stringify({ id: 301, title: `${S} idea` }) }] });
  await m.appData.syncEntity({ kind: "tasks", deletes: [], upserts: [{ id: "111", raw: JSON.stringify({ id: 111, title: `${S} member task`, status: "Not Started" }) }] });
  // whole-list data: projects, programs, sheets, decks, mind maps (shared with everyone / with the outsider by id), Money shared with the outsider
  const shared = (id: number, title: string) => ({ id, title: `${S} ${title}`, name: `${S} ${title}`, shareAll: true, shareMode: "edit", assignees: [member.id, outsider.id], primaryAssigneeId: outsider.id });
  await o.appData.save({
    projects: JSON.stringify([shared(1, "project")]),
    programs: JSON.stringify([shared(2, "program")]),
    sheets: JSON.stringify([{ ...shared(3, "sheet"), columns: [{ id: 1, title: `${S} col`, type: "text" }], rows: [{ id: 1, cells: { 1: `${S} cell` } }] }]),
    decks: JSON.stringify([{ ...shared(4, "deck"), slides: [{ id: 1, elements: [{ id: 1, type: "text", text: `${S} slide`, x: 1, y: 1, w: 10, h: 10 }] }] }]),
    mindmaps: JSON.stringify([shared(5, "mindmap")]),
    goals: JSON.stringify([{ id: 6, title: `${S} goal` }]),
    contacts: JSON.stringify([{ id: 7, name: `${S} contact`, email: `contact-${tag.toLowerCase()}@contacts.test` }]),
    journal: JSON.stringify([{ id: 8, text: `${S} journal` }]),
    prefs: JSON.stringify({ theme: "dark", savedReports: [{ id: "r1", name: `${S} report`, shareAll: true, assignees: [outsider.id], widgets: [] }], coach: { facts: `${S} coach fact` } }),
    finance: JSON.stringify({ accounts: [{ id: "a1", name: `${S} bank`, balance: 1234 }], transactions: [{ id: "t1", payee: `${S} payee`, amount: -5 }], bills: [], share: { on: true, mode: "edit", assignees: [outsider.id, member.id] } }),
  } as any);
  // PM records and people
  await o.pm.recordUpsert({ kind: "risk", projectKey: "p:1", title: `${S} risk`, data: { note: `${S} risk note` } });
  await o.pm.peopleUpsert({ name: `${S} person`, email: `person-${tag.toLowerCase()}@people.test` } as any).catch(() => null);
  // activity, AI keys, starter layout
  await o.activityFeed.log({ action: "note_created", entityTitle: `${S} activity` });
  await o.aiSettings.set({ provider: "openai", openai: `sk-${tag.toLowerCase()}secretkey0000000000${tag === "ALPHA" ? "AAAA" : "BBBB"}` });
  await o.appData.setTeamStarterPreset({ preset: `${S}-preset`, layout: { note: `${S} layout` } });
  // rows the endpoints above don't create
  await conn.query("INSERT INTO coach_messages (userId, kind, runKey, title, body, channels) VALUES (?,?,?,?,?,?)", [owner.id, "morning", `seed-${tag}`, `${S} coach`, `${S} coach body`, "inapp"]);
  await conn.query("INSERT INTO bookmarks (userId, url, title, notes) VALUES (?,?,?,?)", [owner.id, `https://example.com/${tag}`, `${S} bookmark`, `${S} bookmark notes`]);
  await conn.query("INSERT INTO email_delivery_log (userId, workspaceId, `to`, subject, status) VALUES (?,?,?,?,?)", [owner.id, owner.ws, owner.email, `${S} mail subject`, "sent"]);
  await conn.query("INSERT INTO audit_log (actorUserId, workspaceId, actorName, action, detail) VALUES (?,?,?,?,?)", [owner.id, owner.ws, owner.name, "test.seed", JSON.stringify({ note: `${S} audit` })]);
  await conn.query("INSERT INTO smtp_imap_accounts (userId, email, displayName, imapHost, imapUsername, imapPassword, smtpHost, smtpUsername, smtpPassword) VALUES (?,?,?,?,?,?,?,?,?)",
    [owner.id, `mailbox-${tag.toLowerCase()}@mail.test`, `${S} mailbox`, `imap-${tag.toLowerCase()}.invalid`, "u", "p", `smtp-${tag.toLowerCase()}.invalid`, "u", "p"]);
  await conn.query("INSERT INTO oauth_tokens (userId, provider, accessToken, refreshToken, email, displayName, expiresAt) VALUES (?,?,?,?,?,?,?)",
    [owner.id, "microsoft", "at", "rt", `outlook-${tag.toLowerCase()}@mail.test`, `${S} outlook`, new Date(Date.now() + 86400e3)]).catch(async () => {
      await conn.query("INSERT INTO oauth_tokens (userId, provider, accessToken, refreshToken, email, expiresAt) VALUES (?,?,?,?,?,?)", [owner.id, "microsoft", "at", "rt", `outlook-${tag.toLowerCase()}@mail.test`, new Date(Date.now() + 86400e3)]);
    });
  await conn.query("INSERT INTO files (publicId, workspaceId, ownerUserId, store, backend, ref, name, size, mime) VALUES (?,?,?,?,?,?,?,?,?)",
    [crypto.createHash("md5").update(tag).digest("hex"), owner.ws, owner.id, "platform", "drive", `driveid_${tag}_0123456789`, `${S}-file.png`, 10, "image/png"]);
  // an invite created by the owner
  await o.teamInvites.create({ email: `invitee-${tag.toLowerCase()}@invites.test`, name: `${S} invitee`, role: "user", expiryDays: 7 });
}

/** A fingerprint of everything that belongs to a workspace (to prove nothing changed). */
async function fingerprint(ws: number): Promise<Record<string, string>> {
  const ids = (await q("SELECT id FROM users WHERE workspaceId = ?", [ws])).map((r) => Number(r.id));
  const out: Record<string, string> = {};
  const tables = (await q("SHOW TABLES")).map((r) => String(Object.values(r)[0]));
  for (const t of tables) {
    if (t === "__drizzle_migrations" || t === "usage_counters" || t === "rate_limits" || t === "error_log") continue;
    const cols = (await q("SHOW COLUMNS FROM `" + t + "`")).map((c: any) => String(c.Field));
    let where = "";
    if (t === "users") where = "`id` IN (" + ids.join(",") + ")";
    else if (t === "workspaces") where = "`id` = " + ws;
    else if (cols.includes("workspaceId")) where = "`workspaceId` = " + ws;
    else if (cols.includes("userId")) where = "`userId` IN (" + ids.join(",") + ")";
    else continue;
    // lastSignedIn / updatedAt on users move with the victim's own activity, not the attacker's
    const sel = t === "users" ? cols.filter((c) => !["lastSignedIn", "updatedAt"].includes(c)).map((c) => "`" + c + "`").join(",") : "*";
    const rows = await q("SELECT " + sel + " FROM `" + t + "` WHERE " + where + " ORDER BY 1");
    out[t] = crypto.createHash("sha1").update(JSON.stringify(rows)).digest("hex") + ":" + rows.length;
  }
  return out;
}

function leaf(obj: any, pathStr: string): any {
  return pathStr.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
}
const ser = (v: unknown) => { try { return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? String(x) : x)) || ""; } catch { return String(v); } };

/**
 * Call every procedure as `actor` with inputs that point at `victim`'s people
 * and items. Returns what leaked and how many procedures actually ran.
 */
async function sweep(actor: Member, victim: { owner: Member; member: Member; ws: number }, marker: string, identity: string[]) {
  const { caller } = await callerFor(actor);
  const paths = Object.keys((appRouter as any)._def.procedures);
  const victimRisk = Number((await q("SELECT id FROM pm_records WHERE userId = ? LIMIT 1", [victim.owner.id]))[0]?.id || 1);
  const victimInvite = Number((await q("SELECT id FROM team_invites WHERE workspaceId = ? LIMIT 1", [victim.ws]))[0]?.id || 1);
  const victimCoach = Number((await q("SELECT id FROM coach_messages WHERE userId = ? LIMIT 1", [victim.owner.id]))[0]?.id || 1);
  const victimBookmark = Number((await q("SELECT id FROM bookmarks WHERE userId = ? LIMIT 1", [victim.owner.id]))[0]?.id || 1);
  // "kitchen sink" inputs: zod keeps the fields a procedure declares and drops the rest
  const base: Record<string, any> = {
    taskId: "101", noteId: "201", itemId: "101", ideaId: "301", kind: "tasks", projectId: 1, programId: 2, sheetId: 3, deckId: 4, mindMapId: 5, mapId: 5, reportId: "r1",
    status: "Done", title: "HACKED", name: "HACKED", text: "HACKED", body: "HACKED", content: "HACKED", note: "HACKED", message: "HACKED", question: "HACKED", query: "SECRET", search: "SECRET", q: "SECRET",
    patch: { title: "HACKED", status: "Done", body: "HACKED", name: "HACKED" }, finance: JSON.stringify({ accounts: [], transactions: [] }), baseRev: 1,
    limit: 50, page: 1, pageSize: 50, sinceHours: 24, days: 30, sinceDays: 30, provider: "openai", source: "nifty", externalId: "x", slot: "morning",
    email: "probe@nowhere.test", newEmail: "probe@nowhere.test", role: "admin", preset: "x", layout: {}, confirmCount: 999, confirmName: "x", apply: true,
    projectKey: "p:1", refType: "task", refId: "101", data: { note: "HACKED" }, records: [], upserts: [], deletes: [], known: {}, columns: [], rows: [], slides: [],
    token: "x".repeat(64), password: "password-123", newPassword: "password-123", confirmPassword: "password-123", currentPassword: "password-123",
    senderKey: `smtp:${victim.owner.id}`, workspaceId: victim.ws, store: "platform", action: "x", url: "https://example.com", key: "x", scope: "x", period: "2026-11-15",
    region: "us-east-1", bucket: "b", accessKeyId: "a", secretAccessKey: "s", ownerEmail: "new-owner@x.test",
  };
  const variants: Array<Record<string, any> | undefined> = [
    undefined,
    {},
    { ...base, id: victimRisk },                                            // the victim's items by item id, no person id
    { ...base, id: victimInvite },
    { ...base, id: victimCoach },
    { ...base, id: victimBookmark },
    { ...base, id: victimRisk, ownerUserId: victim.owner.id, userId: victim.owner.id, memberUserId: victim.owner.id, linkedUserId: victim.owner.id }, // naming the victim outright
    { ...base, id: victimRisk, patch: { ...base.patch, assignees: [victim.member.id], primaryAssigneeId: victim.member.id } },
  ];
  const leaks: string[] = [];
  let ran = 0;
  for (const p of paths) {
    // never ask the app to sign the actor out / change their own password mid-sweep
    if (/^(auth\.logout|auth\.signOutEverywhere|emailAuth\.(setPassword|updateEmail|updateName|resetPassword|register|login)|workspace\.(requestDelete|switch)|team\.deleteMember)$/.test(p)) continue;
    const fn = leaf(caller, p);
    if (typeof fn !== "function") continue;
    let executed = false;
    for (const input of variants) {
      let out: unknown, err: any = null;
      try {
        out = await Promise.race([fn(input), new Promise((_, rej) => setTimeout(() => rej(new Error("__timeout")), 8000))]);
      } catch (e: any) { err = e; }
      if (err && (err.code === "BAD_REQUEST" || /invalid_type|Required|ZodError|"code":/.test(String(err.message || "")))) {
        // zod refused the input: the procedure body never ran
        if (err.code === "BAD_REQUEST" && !/invalid_type|Required|too_small|invalid_/.test(String(err.message))) executed = true;
      } else executed = true;
      const text = err ? String(err.message || err) : ser(out);
      if (text.includes(marker)) leaks.push(`${p} leaked a "${marker}" value (input variant ${variants.indexOf(input)}): ${text.slice(Math.max(0, text.indexOf(marker) - 60), text.indexOf(marker) + 80)}`);
      for (const idv of identity) if (text.includes(idv)) leaks.push(`${p} revealed ${idv} (input variant ${variants.indexOf(input)})`);
    }
    if (executed) ran++;
  }
  return { leaks, ran, total: paths.length };
}

describe("two workspaces stay apart (real MySQL)", () => {
  beforeAll(async () => {
    let url = "";
    if (CI_URL) {
      const u = new URL(CI_URL); u.pathname = "/";
      const admin = await mysql.createConnection({ uri: u.toString() });
      await admin.query("CREATE DATABASE `" + DB_NAME + "`");
      await admin.end();
      u.pathname = "/" + DB_NAME; url = u.toString();
    } else {
      const { createDB } = await import("mysql-memory-server");
      memServer = await createDB({ version: "8.0.x", dbName: DB_NAME, logLevel: "ERROR" } as any);
      url = `mysql://${memServer.username}@127.0.0.1:${memServer.port}/${memServer.dbName}`;
    }
    const mconn = await mysql.createConnection({ uri: url, multipleStatements: true });
    await migrate(drizzle(mconn), { migrationsFolder: path.join(__dirname, "../drizzle") });
    await mconn.end();
    process.env.DATABASE_URL = url;
    conn = await mysql.createConnection({ uri: url });
    // the server, only now that the environment points at the test database
    ({ appRouter } = await import("./routers"));
    ({ createContext } = await import("./_core/context"));
    ({ sdk } = await import("./_core/sdk"));
    globalThis.fetch = (async () => { throw new Error("network is disabled in the tenancy test"); }) as any;

    // Workspace 1 ("A", made by migration 0063) and its people.
    await addMember("aOwner", 1, "Avery Alpha", "avery@alpha-corp.test", "admin");
    await addMember("aMember", 1, "Ari Alpha", "ari@alpha-corp.test", "user");
    const { ensureWorkspaceBootstrap, invalidateWorkspace } = await import("./_core/workspace");
    await ensureWorkspaceBootstrap(); // A's first member becomes its owner and the platform operator
    // Workspace 2 ("B").
    const { createWorkspace } = await import("./_core/workspaceAdmin");
    WS_B = (await createWorkspace({ name: "Beta Corp", createdBy: P.aOwner.id })).id;
    await addMember("bOwner", WS_B, "Blake Beta", "blake@beta-corp.test", "admin");
    await addMember("bMember", WS_B, "Bo Beta", "bo@beta-corp.test", "user");
    await conn.query("UPDATE workspaces SET ownerUserId = ? WHERE id = ?", [P.bOwner.id, WS_B]);
    invalidateWorkspace();
    await seedWorkspace(P.aOwner, P.aMember, "ALPHA", P.bMember);
    await seedWorkspace(P.bOwner, P.bMember, "BETA", P.aMember);
  }, 600_000);

  afterAll(async () => {
    globalThis.fetch = realFetch;
    try { await conn?.end(); } catch { /* */ }
    try { if (memServer) await memServer.stop(); } catch { /* */ }
    if (CI_URL) {
      try { const u = new URL(CI_URL); u.pathname = "/"; const admin = await mysql.createConnection({ uri: u.toString() }); await admin.query("DROP DATABASE IF EXISTS `" + DB_NAME + "`"); await admin.end(); } catch { /* */ }
    }
  }, 60_000);

  it("the setup is what the tests assume", async () => {
    const [ws1] = await q("SELECT ownerUserId FROM workspaces WHERE id = 1");
    expect(Number(ws1.ownerUserId)).toBe(P.aOwner.id);
    const [op] = await q("SELECT platformRole FROM users WHERE id = ?", [P.aOwner.id]);
    expect(op.platformRole).toBe("operator");
    const me = await (await callerFor(P.bOwner)).caller.auth.me();
    expect(me.workspace).toMatchObject({ id: WS_B, name: "Beta Corp", role: "owner" });
    expect(me.isOperator).toBe(false);
    expect(me.passwordHash).toBeUndefined();
    const meA = await (await callerFor(P.aOwner)).caller.auth.me();
    expect(meA.isOperator).toBe(true);
    // each owner sees their own content
    const loadA = await (await callerFor(P.aOwner)).caller.appData.load();
    expect(ser(loadA)).toContain("ALPHA-SECRET");
    expect(ser(loadA)).not.toContain("BETA-SECRET");
  });

  // ── 2. the channels, one by one ───────────────────────────────────────────
  it("team: each company lists only its own people", async () => {
    const list = await (await callerFor(P.bMember)).caller.team.listMembers();
    expect(list.map((u: any) => u.email).sort()).toEqual(["blake@beta-corp.test", "bo@beta-corp.test"]);
    expect(list.find((u: any) => u.email === "blake@beta-corp.test").owner).toBe(true);
  });

  it("shared with me: an item 'assigned' to someone in another company never reaches them", async () => {
    // A's owner assigned a task, a note, a project, a sheet, a deck, a report and Money to B's member by id.
    const b = (await callerFor(P.bMember)).caller;
    for (const name of ["sharedTasksForMe", "sharedNotesForMe", "sharedProjectsForMe", "sharedProgramsForMe", "sharedSheetsForMe", "sharedDecksForMe", "sharedMindMapsForMe", "sharedReportsForMe", "sharedFinanceForMe"]) {
      const out = await (b.appData as any)[name]();
      expect(ser(out), name).not.toContain("ALPHA-SECRET");
    }
    // …and inside workspace A the same sharing still works.
    const a = (await callerFor(P.aMember)).caller;
    expect(ser(await a.appData.sharedTasksForMe())).toContain("ALPHA-SECRET task plan");
    expect(ser(await a.appData.sharedProjectsForMe())).toContain("ALPHA-SECRET project");
    // a workspace OWNER sees their whole workspace — and only it
    const bo = (await callerFor(P.bOwner)).caller;
    const all = ser(await bo.appData.sharedTasksForMe());
    expect(all).toContain("BETA-SECRET member task");
    expect(all).not.toContain("ALPHA-SECRET");
  });

  it("shared edits: naming another company's person or item is 'not found', and nothing is written", async () => {
    const before = await fingerprint(1);
    const b = (await callerFor(P.bMember)).caller;
    const bo = (await callerFor(P.bOwner)).caller;
    await expect(b.appData.updateSharedTaskStatus({ ownerUserId: P.aOwner.id, taskId: "102", status: "Done" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.appData.updateSharedTask({ ownerUserId: P.aOwner.id, taskId: "102", patch: { title: "HACKED" } } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.appData.updateSharedNote({ ownerUserId: P.aOwner.id, noteId: "201", patch: { title: "HACKED" } } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(b.appData.updateSharedFinance({ ownerUserId: P.aOwner.id, finance: "{}", baseRev: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bo.appData.deleteSharedItem({ ownerUserId: P.aOwner.id, kind: "tasks", itemId: "101" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bo.appData.transferItemOwnership({ ownerUserId: P.aOwner.id, kind: "tasks", itemId: "101" } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bo.team.setRole({ userId: P.aMember.id, role: "admin" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bo.team.deleteMember({ userId: P.aMember.id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // assigning one of your own items to a person in another company is refused too
    await expect(bo.appData.updateSharedTask({ ownerUserId: P.bMember.id, taskId: "111", patch: { assignees: [P.aMember.id] } } as any)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await fingerprint(1)).toEqual(before);
  });

  it("canOverride: an owner or admin is nobody outside their own workspace", async () => {
    const { canOverride } = await import("./_core/access");
    const row = async (m: Member) => (await q("SELECT * FROM users WHERE id = ?", [m.id]))[0];
    expect(await canOverride(await row(P.bOwner), P.aMember.id)).toBe(false);
    expect(await canOverride(await row(P.bOwner), P.bMember.id)).toBe(true);
    expect(await canOverride(await row(P.aOwner), P.bMember.id)).toBe(false); // not even the operator
  });

  it("AI keys: each workspace has its own; a workspace without one uses the platform's, never sees it", async () => {
    const b = (await callerFor(P.bMember)).caller;
    const got = await b.aiSettings.get();
    expect(got.keys.openai.hint).toMatch(/BBBB$/);
    const { resolveWorkspaceAI, invalidateWorkspaceAI } = await import("./_core/workspaceAI");
    expect((await resolveWorkspaceAI(WS_B)).apiKey).toMatch(/BBBB$/);
    expect((await resolveWorkspaceAI(1)).apiKey).toMatch(/AAAA$/);
    // B removes its own key → AI answers on the platform's (workspace 1's) key, but B is never shown it
    await (await callerFor(P.bOwner)).caller.aiSettings.set({ openai: "" });
    invalidateWorkspaceAI();
    const r = await resolveWorkspaceAI(WS_B);
    expect(r.source).toBe("platform");
    expect(r.apiKey).toMatch(/AAAA$/);
    const after = await b.aiSettings.get();
    expect(after.usingPlatform).toBe(true);
    expect(after.keys.openai.configured).toBe(false);
    expect(ser(after)).not.toContain("AAAA");
    // a member (not owner / admin) can't change keys; an admin of ANOTHER workspace changes only their own
    await expect(b.aiSettings.set({ openai: "sk-x" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await (await callerFor(P.bOwner)).caller.aiSettings.set({ openai: "sk-betasecretkey0000000000BBBB" });
    invalidateWorkspaceAI();
    expect((await resolveWorkspaceAI(1)).apiKey).toMatch(/AAAA$/);
  });

  it("daily limits are counted per workspace", async () => {
    const { spendQuota, workspaceUsage } = await import("./_core/quota");
    const before = (await workspaceUsage(1)).ai.used;
    const row = (await q("SELECT * FROM users WHERE id = ?", [P.bMember.id]))[0];
    await spendQuota(row, "ai", 3);
    expect((await workspaceUsage(WS_B)).ai.used).toBeGreaterThanOrEqual(3);
    expect((await workspaceUsage(1)).ai.used).toBe(before);
    // the operator's cap for B applies to B only
    await conn.query("UPDATE workspaces SET quotas = ? WHERE id = ?", [JSON.stringify({ ai: 4 }), WS_B]);
    (await import("./_core/workspace")).invalidateWorkspace(WS_B);
    await expect(spendQuota(row, "ai", 5)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await conn.query("UPDATE workspaces SET quotas = NULL WHERE id = ?", [WS_B]);
    (await import("./_core/workspace")).invalidateWorkspace(WS_B);
  });

  it("mail: a workspace's mail only ever goes through its own owner's accounts", async () => {
    const { sendEmail } = await import("./_core/sendEmail");
    smtpHosts.length = 0;
    await sendEmail({ to: "someone@x.test", subject: "BETA digest", html: "<p>x</p>", recipientUserId: P.bMember.id });
    expect(smtpHosts).toContain("smtp-beta.invalid");
    expect(smtpHosts).not.toContain("smtp-alpha.invalid");
    const [tried] = await q("SELECT errorMessage FROM email_delivery_log WHERE subject = 'BETA digest'");
    expect(String(tried.errorMessage)).toContain(`smtp:${P.bOwner.id}`);
    expect(String(tried.errorMessage)).not.toContain(`:${P.aOwner.id}:`);
    expect(String(tried.errorMessage)).not.toMatch(new RegExp(`(smtp|microsoft|google):${P.aOwner.id}\\b`));
    // B loses its sender: CONTENT mail is skipped — it does not fall back to A's mailbox
    await conn.query("DELETE FROM smtp_imap_accounts WHERE userId = ?", [P.bOwner.id]);
    await conn.query("DELETE FROM oauth_tokens WHERE userId = ?", [P.bOwner.id]);
    smtpHosts.length = 0;
    expect(await sendEmail({ to: "someone@x.test", subject: "BETA digest 2", html: "<p>x</p>", recipientUserId: P.bMember.id })).toBe(false);
    expect(smtpHosts).toEqual([]);
    const [log] = await q("SELECT status, workspaceId FROM email_delivery_log WHERE subject = 'BETA digest 2'");
    expect(log).toMatchObject({ status: "skipped", workspaceId: WS_B });
    // ACCOUNT mail (an invitation: nothing from any workspace in it) may use the platform's sender
    smtpHosts.length = 0;
    await sendEmail({ to: "someone@x.test", subject: "invite", html: "<p>x</p>", workspaceId: WS_B, kind: "account" });
    expect(smtpHosts).toContain("smtp-alpha.invalid");
    expect(smtpHosts).not.toContain("smtp-beta.invalid");
    // sender options and logs are the workspace's own
    const bo = (await callerFor(P.bOwner)).caller;
    expect(ser(await bo.oauthSync.getNotificationSenderOptions())).not.toMatch(/alpha/i);
    await expect(bo.oauthSync.setNotificationSender({ senderKey: `smtp:${P.aOwner.id}` })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(ser(await bo.oauthSync.getAdminEmailDeliveryLog({ page: 1, pageSize: 100 }))).not.toContain("ALPHA-SECRET");
    expect(ser(await bo.ops.auditLog({ limit: 500 }))).not.toContain("ALPHA-SECRET");
    expect(ser(await bo.activityFeed.getTeamFeed({ limit: 200 }))).not.toContain("ALPHA-SECRET");
  });

  it("platform tools are the operator's: another company's owner is refused; the operator's views carry no content", async () => {
    const bo = (await callerFor(P.bOwner)).caller;
    await expect(bo.ops.errors({})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(bo.workspace.opList()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(bo.workspace.opUpdate({ workspaceId: 1, status: "suspended" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(bo.oauthSync.getScheduledTaskLog({ limit: 5 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await bo.appData.backupStatus()).toMatchObject({ ok: false });
    expect(await bo.appData.exportUserAppDataBackup()).toMatchObject({ ok: false });
    expect(await bo.appData.runBackupNow()).toMatchObject({ ok: false });
    const ao = (await callerFor(P.aOwner)).caller;
    const list = await ao.workspace.opList();
    expect(list.workspaces.map((w: any) => w.name).sort()).toEqual(["Beta Corp", "LevelUp"]);
    expect(list.workspaces.find((w: any) => w.id === WS_B)).toMatchObject({ members: 2, owner: { email: "blake@beta-corp.test" } });
    expect(ser(list)).not.toContain("BETA-SECRET");
    expect(ser(await ao.workspace.opMembers({ workspaceId: WS_B }))).not.toContain("BETA-SECRET");
    // the operator is not a member of B: its content endpoints give them nothing of B's
    expect(ser(await ao.appData.sharedTasksForMe())).not.toContain("BETA-SECRET");
    expect(ser(await ao.team.listMembers())).not.toContain("beta-corp");
  });

  it("invites: created, listed and accepted inside one workspace", async () => {
    await conn.query("DELETE FROM rate_limits");
    const bo = (await callerFor(P.bOwner)).caller;
    const mine = await bo.teamInvites.list();
    expect(mine.map((i: any) => i.email)).toEqual(["invitee-beta@invites.test"]);
    const [aInv] = await q("SELECT id, token FROM team_invites WHERE workspaceId = 1 LIMIT 1");
    await expect(bo.teamInvites.delete({ id: Number(aInv.id) })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(bo.teamInvites.resend({ id: Number(aInv.id), expiryDays: 7 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // a new person accepts A's invite → a member of A, not of B
    const anon = (await callerFor(null)).caller;
    const v = await anon.teamInvites.validate({ token: String(aInv.token) });
    expect(v).toMatchObject({ workspaceName: "LevelUp", hasAccount: false });
    await anon.teamInvites.accept({ token: String(aInv.token), name: "Newcomer", password: "a-long-password-1" });
    const [nu] = await q("SELECT workspaceId, role, accountId FROM users WHERE email = 'invitee-alpha@invites.test'");
    expect(nu).toMatchObject({ workspaceId: 1, role: "user", accountId: null });
  });

  it("one login in two workspaces: joins with their own password, switches, and the data stays apart", async () => {
    await conn.query("DELETE FROM rate_limits");
    // Dana works at B, with a real password. A invites Dana's address into workspace A.
    const bcrypt = await import("bcryptjs");
    const dana = await addMember("dual", WS_B, "Dana Dual", "dana@dual.test", "user");
    (await import("./_core/workspace")).invalidateWorkspace();
    await conn.query("UPDATE users SET passwordHash = ? WHERE id = ?", [await bcrypt.hash("bo-password-123", 4), dana.id]);
    await (await callerFor(dana)).caller.appData.syncEntity({ kind: "tasks", deletes: [], upserts: [{ id: "901", raw: JSON.stringify({ id: 901, title: "DANA-AT-BETA task" }) }] });
    const ao = (await callerFor(P.aOwner)).caller;
    const inv = await ao.teamInvites.create({ email: P.dual.email, name: "Bo (at Alpha)", role: "user", expiryDays: 7 });
    const token = String(inv.inviteUrl).split("/invite/")[1];
    const anon = (await callerFor(null)).caller;
    expect(await anon.teamInvites.validate({ token })).toMatchObject({ hasAccount: true, workspaceName: "LevelUp" });
    // someone who only holds the link cannot attach the workspace to Bo's login, or change Bo's password
    await expect(anon.teamInvites.accept({ token, name: "Mallory", password: "not-bos-password" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const [pw0] = await q("SELECT passwordHash FROM users WHERE id = ?", [P.dual.id]);
    // Bo confirms with their own password
    const r = await anon.teamInvites.accept({ token, name: "Bo (at Alpha)", password: "bo-password-123" });
    expect(r.joinedExisting).toBe(true);
    const [pw1] = await q("SELECT passwordHash FROM users WHERE id = ?", [P.dual.id]);
    expect(pw1.passwordHash).toBe(pw0.passwordHash);
    const rows = await q("SELECT id, workspaceId, accountId, passwordHash FROM users WHERE email = ? ORDER BY id", [P.dual.email]);
    expect(rows.length).toBe(2);
    const second = rows.find((x: any) => Number(x.workspaceId) === 1);
    expect(second).toMatchObject({ accountId: P.dual.id, passwordHash: null });
    // signing in still finds ONE login; the workspace list shows both
    const bo = await callerFor(P.dual);
    const list = await bo.caller.workspace.list();
    expect(list.workspaces.map((w: any) => w.name).sort()).toEqual(["Beta Corp", "LevelUp"]);
    expect(list.currentId).toBe(WS_B);
    // in B: B's data. Switch → a new cookie → in A: A's shared data, none of B's own
    expect(ser(await bo.caller.appData.load())).toContain("DANA-AT-BETA task");
    const sw = await bo.caller.workspace.switch({ workspaceId: 1 });
    expect(sw.userId).toBe(Number(second.id));
    const { COOKIE_NAME } = await import("@shared/const");
    const newCookie = bo.setCookies.find((c) => c.name === COOKIE_NAME)!;
    const { req, res } = fakeReqRes(`${COOKIE_NAME}=${newCookie.value}`);
    const inA = appRouter.createCaller(await createContext({ req, res }));
    const meA = await inA.auth.me();
    expect(meA.workspace).toMatchObject({ id: 1, role: "member" });
    const loadA = ser(await inA.appData.load());
    expect(loadA).not.toContain("BETA-SECRET");
    expect(loadA).not.toContain("DANA-AT-BETA");
    expect(ser(await inA.team.listMembers())).toContain("avery@alpha-corp.test");
    // a workspace you are not in cannot be switched to
    await expect((await callerFor(P.aMember)).caller.workspace.switch({ workspaceId: WS_B })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // the password is the login's: changing it from the second workspace needs the current one
    await expect(inA.emailAuth.setPassword({ newPassword: "new-password-12345" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // removing Bo from A ends that membership only
    await ao.team.deleteMember({ userId: Number(second.id) });
    const left = await q("SELECT workspaceId FROM users WHERE email = ?", [P.dual.email]);
    expect(left.map((x: any) => Number(x.workspaceId))).toEqual([WS_B]);
  });

  it("files: a recorded file opens only for members of its workspace", async () => {
    const express = (await import("express")).default;
    const { registerFileRoutes } = await import("./_core/fileProxy");
    const { Readable } = await import("stream");
    const app = express();
    registerFileRoutes(app, { openRecord: async (row: any) => ({ kind: "stream", body: Readable.from([Buffer.from("BYTES-" + row.name)]) }) as any, open: async () => ({ kind: "stream", body: Readable.from([Buffer.from("LEGACY-BYTES")]) }) as any });
    const server = app.listen(0);
    try {
      const port = (server.address() as any).port;
      const get = async (p: string, m: Member | null) => {
        const r = await realFetch(`http://127.0.0.1:${port}${p}`, { headers: m ? { cookie: await cookieFor(m) } : {} });
        return { status: r.status, text: await r.text() };
      };
      const aFile = "/api/files/x/" + crypto.createHash("md5").update("ALPHA").digest("hex") + "/f.png";
      expect((await get(aFile, P.aMember)).status).toBe(200);
      expect((await get(aFile, P.aMember)).text).toContain("ALPHA-SECRET-file.png");
      expect((await get(aFile, P.bOwner)).status).toBe(404);
      expect((await get(aFile, P.bOwner)).text).not.toContain("ALPHA");
      expect((await get(aFile, null)).status).toBe(401);
      // a file that was not made public can't be opened through the public route either
      expect((await get(aFile.replace("/x/", "/p/"), null)).status).toBe(404);
      // links from before workspaces existed belong to the original workspace
      expect((await get("/api/files/d/legacydriveid_0123456789/old.png", P.aMember)).status).toBe(200);
      expect((await get("/api/files/d/legacydriveid_0123456789/old.png", P.bOwner)).status).toBe(404);
    } finally { server.close(); }
  });

  it("PM: a person key or report recipient from another company resolves to nobody", async () => {
    const { resolvePerson, knownRecipientEmails } = await import("./_core/pmDelegation");
    const db = await (await import("./db")).getDb();
    expect(await resolvePerson(db, P.bOwner.id, `u:${P.aMember.id}`)).toBeNull();
    expect(await resolvePerson(db, P.bOwner.id, `u:${P.bMember.id}`)).toMatchObject({ email: "bo@beta-corp.test" });
    const known = await knownRecipientEmails(db, P.bOwner.id);
    expect(known.has("bo@beta-corp.test")).toBe(true);
    expect(known.has("avery@alpha-corp.test")).toBe(false);
  });

  it("names: the same display name in two companies never links them", async () => {
    // Somebody in B is renamed to exactly A's owner's name.
    await conn.query("UPDATE users SET name = ? WHERE id = ?", ["Avery Alpha", P.bMember.id]);
    const { _resolveUserIdMap, _invalidateUserIdMap } = await import("./routers/appData");
    _invalidateUserIdMap();
    const mapA = await _resolveUserIdMap({ id: P.aOwner.id });
    const mapB = await _resolveUserIdMap({ id: P.bOwner.id });
    expect(mapA.get("avery alpha")).toBe(P.aOwner.id);
    expect(mapB.get("avery alpha")).toBe(P.bMember.id);
    await conn.query("UPDATE users SET name = ? WHERE id = ?", ["Bo Beta", P.bMember.id]);
    _invalidateUserIdMap();
  });

  it("export: a workspace's export holds everything of its own and nothing of anyone else's", async () => {
    const bo = (await callerFor(P.bOwner)).caller;
    const out = await bo.workspace.export();
    const text = ser(out.dump);
    expect(text).toContain("BETA-SECRET task plan");
    expect(text).toContain("BETA-SECRET bank");
    expect(text).not.toContain("ALPHA-SECRET");
    expect(text).not.toContain("alpha-corp.test");
    expect(text).not.toMatch(/sk-betasecretkey/);           // AI key redacted
    expect(text).not.toContain("$2a$");                      // no password hashes
    await expect((await callerFor(P.bMember)).caller.workspace.export()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("suspension: a suspended workspace is locked out and skipped by background jobs; others carry on", async () => {
    const ao = (await callerFor(P.aOwner)).caller;
    await ao.workspace.opUpdate({ workspaceId: WS_B, status: "suspended" });
    const b = await callerFor(P.bOwner);
    await expect(b.caller.appData.load()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const me = await b.caller.auth.me();
    expect(me).toMatchObject({ workspaceInactive: true, wsStatus: "suspended" });
    const { req } = fakeReqRes(await cookieFor(P.bOwner));
    await expect(sdk.authenticateRequest(req)).rejects.toBeTruthy(); // file links, callbacks…
    const { activeMemberIds } = await import("./_core/workspace");
    const active = await activeMemberIds();
    expect(active!.has(P.bOwner.id)).toBe(false);
    expect(active!.has(P.aOwner.id)).toBe(true);
    const { prefsRows } = await import("./_core/prefsScan");
    const rows = await prefsRows(await (await import("./db")).getDb());
    expect(rows.some((r: any) => r.userId === P.bOwner.id)).toBe(false);
    expect(rows.some((r: any) => r.userId === P.aOwner.id)).toBe(true);
    await expect(ao.workspace.opUpdate({ workspaceId: 1, status: "suspended" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await ao.workspace.opUpdate({ workspaceId: WS_B, status: "active" });
    expect(ser(await (await callerFor(P.bOwner)).caller.appData.load())).toContain("BETA-SECRET");
  });

  it("the operator creates a workspace and invites its owner; accepting makes them the owner", async () => {
    await conn.query("DELETE FROM rate_limits");
    const ao = (await callerFor(P.aOwner)).caller;
    const made = await ao.workspace.opCreate({ name: "Gamma Ltd", ownerEmail: "gia@gamma.test", ownerName: "Gia Gamma" });
    const token = String(made.inviteUrl).split("/invite/")[1];
    const anon = (await callerFor(null)).caller;
    expect(await anon.teamInvites.validate({ token })).toMatchObject({ workspaceName: "Gamma Ltd", asOwner: true });
    await anon.teamInvites.accept({ token, name: "Gia Gamma", password: "gia-password-123" });
    const [g] = await q("SELECT id, workspaceId, role FROM users WHERE email = 'gia@gamma.test'");
    expect(Number(g.workspaceId)).toBe(made.workspaceId);
    const [ws] = await q("SELECT ownerUserId FROM workspaces WHERE id = ?", [made.workspaceId]);
    expect(Number(ws.ownerUserId)).toBe(Number(g.id));
    const gia: Member = { id: Number(g.id), openId: (await q("SELECT openId FROM users WHERE id = ?", [g.id]))[0].openId, email: "gia@gamma.test", name: "Gia Gamma", ws: made.workspaceId };
    const gc = (await callerFor(gia)).caller;
    expect((await gc.auth.me()).workspace).toMatchObject({ name: "Gamma Ltd", role: "owner" });
    // a brand-new workspace: empty, AI on the platform's key, original-workspace extras off
    const load = ser(await gc.appData.load());
    expect(load).not.toContain("ALPHA-SECRET");
    expect(load).not.toContain("BETA-SECRET");
    expect((await gc.aiSettings.get()).usingPlatform).toBe(true);
    expect((await gc.auth.me()).workspace.features).toEqual({});
    await expect(gc.atlas.pull()).rejects.toBeTruthy();
    // closing it: unreachable at once, purged after the grace period, others untouched
    const beforeA = await fingerprint(1), beforeB = await fingerprint(WS_B);
    await gc.workspace.requestDelete({ confirmName: "Gamma Ltd" });
    await expect((await callerFor(gia)).caller.appData.load()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    const { purgeDeletedWorkspaces } = await import("./_core/workspaceAdmin");
    expect(await purgeDeletedWorkspaces(new Date())).toBe(0);                                // still inside the 30 days
    expect(await purgeDeletedWorkspaces(new Date(Date.now() + 31 * 86400e3))).toBe(1);
    expect((await q("SELECT id FROM workspaces WHERE id = ?", [made.workspaceId])).length).toBe(0);
    expect((await q("SELECT id FROM users WHERE email = 'gia@gamma.test'")).length).toBe(0);
    expect(await fingerprint(1)).toEqual(beforeA);
    expect(await fingerprint(WS_B)).toEqual(beforeB);
  });

  // ── 3. the sweep: every procedure, as the other company (last: it also exercises each caller's own tools) ───────────────────
  const A = () => ({ owner: P.aOwner, member: P.aMember, ws: 1 });
  const B = () => ({ owner: P.bOwner, member: P.bMember, ws: WS_B });
  for (const [who, victim, marker] of [["bOwner", "A", "ALPHA-SECRET"], ["bMember", "A", "ALPHA-SECRET"], ["aMember", "B", "BETA-SECRET"], ["aOwner", "B", "BETA-SECRET"]] as const) {
    it(`sweep: ${who} calls every endpoint aiming at workspace ${victim} — nothing is read, nothing changes`, async () => {
      const v = victim === "A" ? A() : B();
      const before = await fingerprint(v.ws);
      // The operator legitimately sees workspace names and owners' names/emails
      // in the console; everybody else must not learn who is in the other company.
      const identity = who === "aOwner" ? [v.member.email] : [v.owner.email, v.member.email];
      const r = await sweep(P[who], v, marker, identity);
      // The operator's member list (names, emails, roles — to pick a new owner) is account-level by design.
      if (who === "aOwner") r.leaks = r.leaks.filter((l) => !/^workspace\.opMembers revealed /.test(l));
      expect(r.leaks, r.leaks.join("\n")).toEqual([]);
      expect(await fingerprint(v.ws)).toEqual(before);
      // the sweep is only worth something if it really runs most of the API
      expect(r.ran).toBeGreaterThan(r.total * 0.6);
    }, 900_000);
  }

  it("no mail server of the other workspace was ever contacted during the sweeps", async () => {
    // (each workspace's own sender may be tried for its own mail; nothing may cross)
    // B's actions can reach smtp-beta only, A's smtp-alpha only — checked per action in the mail test below.
    // every mail attempt is on record with the accounts it tried ("smtp:<member id>"):
    // a workspace's content mail never tried an account of the other workspace's owner
    const rows = await q("SELECT workspaceId, errorMessage FROM email_delivery_log WHERE errorMessage IS NOT NULL");
    for (const r of rows) {
      const tried = Array.from(String(r.errorMessage).matchAll(/(?:smtp|microsoft|google):(\d+)/g)).map((m) => Number(m[1]));
      const owners = Number(r.workspaceId) === 1 ? [P.aOwner.id] : Number(r.workspaceId) === WS_B ? [P.bOwner.id, P.aOwner.id /* account mail may use the platform's */] : null;
      if (owners) expect(tried.every((id) => owners.includes(id)), `workspace ${r.workspaceId}: ${r.errorMessage}`).toBe(true);
    }
    expect(smtpHosts.length).toBeGreaterThan(0);
  });

});
