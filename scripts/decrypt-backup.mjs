#!/usr/bin/env node
/**
 * Read a LevelUp backup (.lubk, made by server/_core/backup.ts) and write it
 * out as plain JSON, with a per-table row count.
 *
 *   BACKUP_KEY=… node scripts/decrypt-backup.mjs levelup-2026-10-26-nightly.lubk [out.json]
 *
 * The key is the BACKUP_KEY the server ran with (or JWT_SECRET if BACKUP_KEY
 * was never set). Restoring: each table's rows are under tables.<name>.rows;
 * insert them into an empty database created by `drizzle-kit migrate`.
 * Secret columns hold "[redacted]" — reconnect integrations afterwards and
 * have people use "Forgot password" to sign in.
 */
import fs from "fs";
import crypto from "crypto";
import zlib from "zlib";

const [, , file, outArg] = process.argv;
if (!file) { console.error("usage: BACKUP_KEY=… node scripts/decrypt-backup.mjs <backup.lubk> [out.json]"); process.exit(2); }
const base = process.env.BACKUP_KEY || process.env.JWT_SECRET;
if (!base) { console.error("Set BACKUP_KEY (or JWT_SECRET) to the value the server used."); process.exit(2); }
const key = crypto.createHash("sha256").update("levelup-backup:" + base).digest();
const buf = fs.readFileSync(file);
if (buf.subarray(0, 5).toString() !== "LUBK1") { console.error("Not a LevelUp backup file."); process.exit(1); }
const d = crypto.createDecipheriv("aes-256-gcm", key, buf.subarray(5, 17));
d.setAuthTag(buf.subarray(17, 33));
let json;
try { json = zlib.gunzipSync(Buffer.concat([d.update(buf.subarray(33)), d.final()])).toString("utf-8"); }
catch { console.error("Could not decrypt: wrong key, or the file is damaged."); process.exit(1); }
const dump = JSON.parse(json);
const out = outArg || file.replace(/\.lubk$/, "") + ".json";
fs.writeFileSync(out, json);
console.log(`Backup from ${dump.createdAt} → ${out}`);
for (const [name, t] of Object.entries(dump.tables)) console.log(`  ${name.padEnd(36)} ${String(t.count).padStart(7)} rows`);
