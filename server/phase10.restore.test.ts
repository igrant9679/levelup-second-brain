/**
 * Build -264 (Audit 2 Phase 3): the restore drill. A backup is only worth
 * something if it can be put back. Against a real MySQL (CI provides one):
 * dump every table → encrypt → decrypt → restore into a FRESH database made
 * by the migrations → dump that → every table is identical. Also: the
 * restore refuses a database that already holds data.
 *
 * Skipped without DATABASE_URL (local runs); CI runs it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import path from "path";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import { sql } from "drizzle-orm";
// @ts-ignore — plain ESM helper shared with scripts/restore-backup.mjs
import { restoreDump } from "../scripts/lib/restore.mjs";

const URL_ = process.env.DATABASE_URL;
const DRILL = "levelup_restore_drill";

describe.skipIf(!URL_)("restore drill (MySQL)", () => {
  let admin: mysql.Connection, drillConn: mysql.Connection, drillUrl = "";
  beforeAll(async () => {
    const u = new URL(URL_!);
    u.pathname = "/";
    admin = await mysql.createConnection({ uri: u.toString(), timezone: "Z" });
    await admin.query(`DROP DATABASE IF EXISTS \`${DRILL}\``);
    await admin.query(`CREATE DATABASE \`${DRILL}\``);
    u.pathname = "/" + DRILL;
    drillUrl = u.toString();
    const mconn = await mysql.createConnection({ uri: drillUrl, multipleStatements: true });
    await migrate(drizzle(mconn), { migrationsFolder: path.join(__dirname, "../drizzle") });
    await mconn.end();
    drillConn = await mysql.createConnection({ uri: drillUrl, timezone: "Z" });
  }, 120_000);
  afterAll(async () => {
    try { await drillConn?.end(); } catch { /* */ }
    try { await admin?.query(`DROP DATABASE IF EXISTS \`${DRILL}\``); await admin?.end(); } catch { /* */ }
  });

  it("backup → restore into a fresh database → identical tables", async () => {
    const { dumpAllTables, encryptBackupAsync, decryptBackupAsync } = await import("./_core/backup");
    const live = drizzle(URL_!);
    // make sure there is something of each common shape to carry
    await live.execute(sql`INSERT INTO system_settings (\`key\`, value) VALUES ('restoreDrill', ${JSON.stringify({ at: new Date().toISOString(), n: 1 })}) ON DUPLICATE KEY UPDATE value = VALUES(value)`);
    await live.execute(sql`INSERT IGNORE INTO send_ledger (userId, kind, period) VALUES (99999, 'digest', '2026-11-01')`);
    const dump = await dumpAllTables(live);
    const back = await decryptBackupAsync(await encryptBackupAsync(dump));
    expect(back.tables).toEqual(dump.tables);

    const r = await restoreDump(drillConn, back);
    expect(r.skipped).toEqual([]);
    const again = await dumpAllTables(drizzle(drillConn as any));
    const norm = (rows: any[]) => rows.map((x) => JSON.stringify(x)).sort();
    let checked = 0;
    for (const [name, t] of Object.entries(dump.tables)) {
      if (name === "__drizzle_migrations") continue;
      expect(again.tables[name], name).toBeTruthy();
      expect(norm(again.tables[name].rows), name).toEqual(norm(t.rows));
      checked++;
    }
    expect(checked).toBeGreaterThan(30);
    expect(again.tables.system_settings.rows.some((x: any) => x.key === "restoreDrill")).toBe(true);
  }, 120_000);

  it("refuses a database that already holds rows", async () => {
    await expect(restoreDump(drillConn, { version: 1, createdAt: "", tables: {} })).rejects.toThrow(/not empty/);
  });

  // A fresh migrated database is not literally empty since build -278:
  // migration 0063 inserts workspace 1. The restore accepts exactly that row
  // (the drill above depends on it) and nothing more.
  const freshDb = async (name: string) => {
    await admin.query("DROP DATABASE IF EXISTS `" + name + "`");
    await admin.query("CREATE DATABASE `" + name + "`");
    const u = new URL(URL_!); u.pathname = "/" + name;
    const m = await mysql.createConnection({ uri: u.toString(), multipleStatements: true });
    await migrate(drizzle(m), { migrationsFolder: path.join(__dirname, "../drizzle") });
    await m.end();
    return mysql.createConnection({ uri: u.toString(), timezone: "Z" });
  };

  it("a backup from before workspaces lands in workspace 1, as the upgrade did", async () => {
    const c = await freshDb(DRILL + "_old");
    try {
      const old = { version: 1, createdAt: "2026-11-15T08:00:00.000Z", tables: {
        users: { count: 2, rows: [
          { id: 1, openId: "email:owner@old.test", name: "Owner", email: "owner@old.test", loginMethod: "email", role: "admin", passwordHash: "[redacted]" },
          { id: 2, openId: "inv:abc", name: "Mate", email: "mate@old.test", loginMethod: "invite", role: "user", passwordHash: "[redacted]" } ] },
        team_invites: { count: 1, rows: [{ id: 1, invitedBy: 1, email: "p@old.test", role: "user", token: "[redacted]", expiresAt: "2026-12-01T00:00:00.000Z" }] },
        audit_log: { count: 1, rows: [{ id: 1, actorUserId: 1, actorName: "Owner", action: "member.role" }] },
        email_delivery_log: { count: 1, rows: [{ id: 1, userId: 1, to: "mate@old.test", subject: "Old", status: "sent" }] },
        system_settings: { count: 4, rows: [
          { key: "aiProvider", value: "claude" }, { key: "aiKey_claude", value: "[redacted]" },
          { key: "notificationSender", value: "smtp:1" }, { key: "lastBackup", value: "{}" } ] },
      } };
      const r = await restoreDump(c, old);
      expect(r).toMatchObject({ preWorkspaces: true, skipped: [] });
      const q = async (s: string) => (await c.query(s))[0] as any[];
      expect(await q("SELECT id, ownerUserId FROM workspaces")).toEqual([{ id: 1, ownerUserId: null }]);   // the seed stays
      expect((await q("SELECT workspaceId FROM users ORDER BY id")).map((x) => x.workspaceId)).toEqual([1, 1]);
      expect((await q("SELECT workspaceId FROM team_invites"))[0].workspaceId).toBe(1);
      expect((await q("SELECT workspaceId FROM audit_log"))[0].workspaceId).toBe(1);
      expect((await q("SELECT workspaceId FROM email_delivery_log"))[0].workspaceId).toBe(1);
      // settings copied; a redacted key is NOT copied (it would read as a real, wrong key)
      expect((await q("SELECT `key` FROM workspace_settings WHERE workspaceId = 1 ORDER BY `key`")).map((x) => x.key)).toEqual(["aiProvider", "notificationSender"]);
    } finally {
      await c.end();
      await admin.query("DROP DATABASE IF EXISTS `" + DRILL + "_old`");
    }
  }, 120_000);

  it("the seeded workspace is the only row a 'fresh' database may hold", async () => {
    const c = await freshDb(DRILL + "_seed");
    try {
      await c.query("UPDATE workspaces SET ownerUserId = 7 WHERE id = 1");   // a workspace somebody owns is real data
      await expect(restoreDump(c, { version: 1, createdAt: "", tables: {} })).rejects.toThrow(/not empty \(workspaces/);
    } finally {
      await c.end();
      await admin.query("DROP DATABASE IF EXISTS `" + DRILL + "_seed`");
    }
  }, 120_000);
});
