#!/usr/bin/env node
/**
 * Restore a LevelUp backup (.lubk) into an EMPTY database (build -264).
 *
 *   1. Create a fresh MySQL database and run the migrations into it:
 *        DATABASE_URL=mysql://…/levelup_restore pnpm exec drizzle-kit migrate
 *   2. Load the backup:
 *        BACKUP_KEY=… node scripts/restore-backup.mjs levelup-2026-11-01-nightly.lubk mysql://…/levelup_restore
 *      (BACKUP_KEY = the value the server ran with; JWT_SECRET if it never had one.
 *       Settings → Backups shows which one each backup used.)
 *   3. Point the app's DATABASE_URL at it, reconnect integrations (their
 *      tokens are redacted in backups), and sign in with "Forgot password".
 *
 * Refuses a database that already holds rows. The same code is exercised by
 * server/phase10.restore.test.ts in CI (backup → restore → identical tables).
 */
import fs from "fs";
import crypto from "crypto";
import zlib from "zlib";
import mysql from "mysql2/promise";
import { restoreDump } from "./lib/restore.mjs";

const [, , file, url] = process.argv;
if (!file || !url) { console.error("usage: BACKUP_KEY=… node scripts/restore-backup.mjs <backup.lubk> <mysql://target-database-url>"); process.exit(2); }
const base = process.env.BACKUP_KEY || process.env.JWT_SECRET;
if (!base) { console.error("Set BACKUP_KEY (or JWT_SECRET) to the value the server used."); process.exit(2); }
const key = crypto.createHash("sha256").update("levelup-backup:" + base).digest();
const buf = fs.readFileSync(file);
if (buf.subarray(0, 5).toString() !== "LUBK1") { console.error("Not a LevelUp backup file."); process.exit(1); }
let dump;
try {
  const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(5, 17));
  d.setAuthTag(buf.subarray(17, 33));
  dump = JSON.parse(zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(33)), d.final()])).toString("utf-8"));
} catch { console.error("Could not decrypt: wrong key, or the file is damaged."); process.exit(1); }

const conn = await mysql.createConnection({ uri: url, timezone: "Z", multipleStatements: false });
try {
  console.log(`Restoring the backup from ${dump.createdAt} …`);
  const r = await restoreDump(conn, dump, { log: (m) => console.log(m) });
  console.log(`Done: ${r.tables} tables, ${r.rows} rows${r.skipped.length ? ` (not in this schema, skipped: ${r.skipped.join(", ")})` : ""}.`);
  console.log("Next: reconnect integrations (tokens were redacted) and sign in via Forgot password.");
} catch (e) {
  console.error("Restore failed:", e?.message || e);
  process.exitCode = 1;
} finally {
  await conn.end();
}
