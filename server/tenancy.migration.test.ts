/**
 * The UPGRADE to workspaces (build -278): migrations 0063 + 0064 applied to a
 * database that already holds a single-workspace LevelUp — the state the live
 * database is in — and then the first boot.
 *
 * Real MySQL (CI's service, or an ephemeral one from mysql-memory-server):
 *   1. migrate up to 0062 only; put in accounts, an invite, log rows and the
 *      global settings as build -277 stored them;
 *   2. apply the remaining migrations;
 *   3. everything that existed is in workspace 1, the settings were copied,
 *      a row written WITHOUT a workspace lands in workspace 0 (nobody's);
 *   4. the boot pass names the owner (the OWNER_OPEN_ID account) and the
 *      platform operator, once.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";

// a real database and the whole API: each check gets real time (CI machines are slow and busy)
vi.setConfig({ testTimeout: 180_000, hookTimeout: 600_000 });
process.env.JWT_SECRET = process.env.JWT_SECRET || "tenancy-migration-secret-0123456789";
process.env.OWNER_OPEN_ID = "email:owner@old.test";
const CI_URL = process.env.DATABASE_URL || "";
const DB_NAME = "levelup_upgrade_" + crypto.randomBytes(4).toString("hex");

let conn: mysql.Connection;
let mem: any = null;
let url = "";
const q = async (sql: string, params: any[] = []) => (await conn.query(sql, params))[0] as any[];

describe("upgrading a single-workspace database to workspaces (real MySQL)", () => {
  beforeAll(async () => {
    if (CI_URL) {
      const u = new URL(CI_URL); u.pathname = "/";
      const admin = await mysql.createConnection({ uri: u.toString() });
      await admin.query("CREATE DATABASE `" + DB_NAME + "`");
      await admin.end();
      u.pathname = "/" + DB_NAME; url = u.toString();
    } else {
      const { createDB } = await import("mysql-memory-server");
      mem = await createDB({ version: "8.0.x", dbName: DB_NAME, logLevel: "ERROR" } as any);
      url = `mysql://${mem.username}@127.0.0.1:${mem.port}/${mem.dbName}`;
    }
    // 1. the schema as of build -277: migrations 0000 … 0062
    const src = path.join(__dirname, "../drizzle");
    const old = fs.mkdtempSync(path.join(os.tmpdir(), "lu-mig-"));
    fs.mkdirSync(path.join(old, "meta"));
    const journal = JSON.parse(fs.readFileSync(path.join(src, "meta/_journal.json"), "utf8"));
    const upTo62 = { ...journal, entries: journal.entries.filter((e: any) => e.idx <= 62) };
    fs.writeFileSync(path.join(old, "meta/_journal.json"), JSON.stringify(upTo62));
    for (const e of upTo62.entries) fs.copyFileSync(path.join(src, e.tag + ".sql"), path.join(old, e.tag + ".sql"));
    const m1 = await mysql.createConnection({ uri: url, multipleStatements: true });
    await migrate(drizzle(m1), { migrationsFolder: old });
    await m1.end();
    fs.rmSync(old, { recursive: true, force: true });
    conn = await mysql.createConnection({ uri: url });
    // …with the data a live single-workspace install has
    await conn.query("INSERT INTO users (openId, name, email, loginMethod, role, passwordHash) VALUES ('oauth:first', 'First Account', 'first@old.test', 'oauth', 'user', NULL), ('email:owner@old.test', 'The Owner', 'owner@old.test', 'email', 'admin', 'hash'), ('inv:abc', 'A Teammate', 'mate@old.test', 'invite', 'user', 'hash')");
    await conn.query("INSERT INTO team_invites (invitedBy, email, name, role, token, expiresAt) VALUES (2, 'pending@old.test', 'Pending', 'user', ?, ?)", ["t".repeat(64), new Date(Date.now() + 86400e3)]);
    await conn.query("INSERT INTO audit_log (actorUserId, actorName, action) VALUES (2, 'The Owner', 'member.role')");
    await conn.query("INSERT INTO email_delivery_log (userId, `to`, subject, status) VALUES (2, 'mate@old.test', 'Old mail', 'sent')");
    await conn.query("INSERT INTO system_settings (`key`, value) VALUES ('aiProvider', 'claude'), ('aiKey_claude', 'sk-ant-OLDKEY-wxyz'), ('notificationSender', 'smtp:2'), ('teamStarterPreset', '{\"preset\":\"pm\"}'), ('lastBackup', '{\"ok\":true}'), ('rolesDemoted253', '{}')");
    await conn.query("INSERT INTO tasks (userId, taskId, title, raw) VALUES (2, '1', 'An old task', '{\"id\":1,\"title\":\"An old task\"}')");
    // 2. the upgrade
    const m2 = await mysql.createConnection({ uri: url, multipleStatements: true });
    await migrate(drizzle(m2), { migrationsFolder: src });
    await m2.end();
    process.env.DATABASE_URL = url;
  }, 600_000);

  afterAll(async () => {
    try { await conn?.end(); } catch { /* */ }
    try { if (mem) await mem.stop(); } catch { /* */ }
    if (CI_URL) {
      try { const u = new URL(CI_URL); u.pathname = "/"; const admin = await mysql.createConnection({ uri: u.toString() }); await admin.query("DROP DATABASE IF EXISTS `" + DB_NAME + "`"); await admin.end(); } catch { /* */ }
    }
  }, 60_000);

  it("puts every existing account, invite and log row in workspace 1 and copies the workspace settings", async () => {
    const [ws] = await q("SELECT id, name, status, ownerUserId, features FROM workspaces");
    expect(ws).toMatchObject({ id: 1, status: "active", ownerUserId: null });
    expect(JSON.parse(ws.features)).toEqual({ atlas: true, cfLabels: true });
    const users = await q("SELECT id, workspaceId, accountId, platformRole, passwordHash FROM users ORDER BY id");
    expect(users.map((u: any) => u.workspaceId)).toEqual([1, 1, 1]);
    expect(users.every((u: any) => u.accountId === null && u.platformRole === null)).toBe(true);
    expect(users[1].passwordHash).toBe("hash"); // untouched
    expect((await q("SELECT workspaceId, asOwner FROM team_invites"))[0]).toMatchObject({ workspaceId: 1, asOwner: 0 });
    expect((await q("SELECT workspaceId FROM audit_log"))[0].workspaceId).toBe(1);
    expect((await q("SELECT workspaceId FROM email_delivery_log"))[0].workspaceId).toBe(1);
    const settings = await q("SELECT `key`, value FROM workspace_settings WHERE workspaceId = 1 ORDER BY `key`");
    expect(settings.map((s: any) => s.key)).toEqual(["aiKey_claude", "aiProvider", "notificationSender", "teamStarterPreset"]);
    expect(settings.find((s: any) => s.key === "aiKey_claude").value).toBe("sk-ant-OLDKEY-wxyz");
    // platform settings stay where they were, and nothing was removed from the old table
    expect((await q("SELECT COUNT(*) AS n FROM system_settings"))[0].n).toBe(6);
    expect((await q("SELECT title FROM tasks WHERE userId = 2"))[0].title).toBe("An old task");
    expect((await q("SELECT COUNT(*) AS n FROM files"))[0].n).toBe(0);
  });

  it("a row written without a workspace (the previous build, mid-deploy) belongs to nobody", async () => {
    await conn.query("INSERT INTO users (openId, name, email, loginMethod) VALUES ('email:stray@old.test', 'Stray', 'stray@old.test', 'email')");
    expect((await q("SELECT workspaceId FROM users WHERE openId = 'email:stray@old.test'"))[0].workspaceId).toBe(0);
    await conn.query("INSERT INTO team_invites (invitedBy, email, role, token, expiresAt) VALUES (2, 'x@old.test', 'user', ?, ?)", ["u".repeat(64), new Date(Date.now() + 86400e3)]);
    expect((await q("SELECT workspaceId FROM team_invites WHERE email = 'x@old.test'"))[0].workspaceId).toBe(0);
    // the previous build's hourly "last seen" write (INSERT … ON DUPLICATE KEY UPDATE with only an openId) still works
    await conn.query("INSERT INTO users (openId, lastSignedIn) VALUES ('email:owner@old.test', NOW()) ON DUPLICATE KEY UPDATE lastSignedIn = NOW()");
    expect((await q("SELECT workspaceId FROM users WHERE openId = 'email:owner@old.test'"))[0].workspaceId).toBe(1);
    const { wsIdOf, _resetWorkspaceCachesForTest } = await import("./_core/workspace");
    _resetWorkspaceCachesForTest();
    const [stray] = await q("SELECT * FROM users WHERE openId = 'email:stray@old.test'");
    expect(await wsIdOf(stray)).toBe(0);
  });

  it("first boot: the OWNER_OPEN_ID account owns workspace 1 and is the platform operator — once", async () => {
    const ws = await import("./_core/workspace");
    ws._resetWorkspaceCachesForTest();
    const r1 = await ws.ensureWorkspaceBootstrap();
    expect(r1).toMatchObject({ ownerSet: 2, operatorSet: 2 });   // the configured owner, not the first account
    const [w] = await q("SELECT ownerUserId FROM workspaces WHERE id = 1");
    expect(w.ownerUserId).toBe(2);
    expect((await q("SELECT id FROM users WHERE platformRole = 'operator'")).map((u: any) => u.id)).toEqual([2]);
    expect(await ws.ensureWorkspaceBootstrap()).toEqual({});     // a second boot changes nothing
    const [owner] = await q("SELECT * FROM users WHERE id = 2");
    const [mate] = await q("SELECT * FROM users WHERE id = 3");
    const [first] = await q("SELECT * FROM users WHERE id = 1");
    const { isOwnerCtxUser } = await import("./routers/appData");
    expect(await isOwnerCtxUser(owner)).toBe(true);
    expect(await isOwnerCtxUser(mate)).toBe(false);
    expect(await isOwnerCtxUser(first)).toBe(false);
    expect(await ws.isOperator(owner)).toBe(true);
    expect(await ws.isOperator(mate)).toBe(false);
    // the AI key the workspace had keeps answering, for it and as the platform default
    const { resolveWorkspaceAI, invalidateWorkspaceAI } = await import("./_core/workspaceAI");
    invalidateWorkspaceAI();
    expect(await resolveWorkspaceAI(1)).toMatchObject({ provider: "claude", apiKey: "sk-ant-OLDKEY-wxyz", source: "workspace" });
    // the mail sender the workspace had is still its sender; the first account stays trusted for workspace 1's mail
    expect(await ws.getWorkspaceSetting(1, "notificationSender")).toBe("smtp:2");
    const { ownerUserIds, _resetOwnerIdsForTest } = await import("./_core/mailTrust");
    _resetOwnerIdsForTest();
    expect(Array.from(await ownerUserIds(1)).sort()).toEqual([1, 2]);
    // signing in still finds the same login
    const db = await import("./db");
    expect((await db.getUserByEmail("owner@old.test"))?.id).toBe(2);
    expect(await ws.membershipsOf(owner)).toMatchObject([{ workspaceId: 1, role: "owner" }]);
    expect(await ws.membershipsOf(mate)).toMatchObject([{ workspaceId: 1, role: "member" }]);
  });
});
