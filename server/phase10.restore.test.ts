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
});
