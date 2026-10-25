/**
 * Database backups (Phase 1, build -226).
 *
 * The old Settings "💾 Download backup" exported only user_app_data, so it
 * silently left out tasks, notes and ideas (their own tables since 0052) and
 * every newer table (PM, coach, money tokens …). Now:
 *
 *   dumpAllTables()   every table in the database, rows as JSON, with secret
 *                     columns/settings REDACTED (passwords, tokens, API keys,
 *                     the SimpleFIN access URL, VAPID private key). A restore
 *                     therefore needs integrations reconnected and users to
 *                     sign in again via "Forgot password" — the data itself
 *                     is complete.
 *   runBackup()       nightly (startBackupCron, ~08:00 UTC) and on demand:
 *                     dump → gzip → AES-256-GCM encrypt → VERIFY by decrypting
 *                     the bytes and comparing every table's row count and
 *                     checksum with the dump → upload privately
 *                     (storagePutPrivate, never a public link) → record the
 *                     result in system_settings.lastBackup.
 *
 * Encryption key: sha256 of BACKUP_KEY (or JWT_SECRET if unset). Keep that
 * value safe — scripts/decrypt-backup.mjs needs it to read a backup.
 * File format: "LUBK1" | iv(12) | tag(16) | ciphertext(gzip(JSON)).
 */
import crypto from "crypto";
import zlib from "zlib";
import { sql } from "drizzle-orm";
import { getDb, getSystemSetting, setSystemSetting } from "../db";
import { ENV } from "./env";

const MAGIC = Buffer.from("LUBK1");
const SECRET_COL = /(password|secret|token|api_?key|accessurl|refresh|vapidprivate|clientsecret)/i;
const SECRET_SETTING = /(aikey|apikey|secret|token|password|vapidprivate)/i;

export type BackupDump = { version: 1; createdAt: string; tables: Record<string, { count: number; hash: string; rows: any[] }> };

function backupKey(): Buffer {
  const base = process.env.BACKUP_KEY || ENV.cookieSecret || "";
  if (!base) throw new Error("Set BACKUP_KEY (or JWT_SECRET) before running backups.");
  return crypto.createHash("sha256").update("levelup-backup:" + base).digest();
}
function tableHash(rows: any[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex").slice(0, 32);
}
function plain(v: any): any {
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v.toString("base64");
  if (typeof v === "bigint") return v.toString();
  return v;
}
/** Secret values are replaced, everything else kept as-is. */
export function redactRow(table: string, row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v != null && v !== "" && SECRET_COL.test(k)) out[k] = "[redacted]";
    else out[k] = plain(v);
  }
  if (table === "system_settings" && typeof row.key === "string" && SECRET_SETTING.test(row.key)) out.value = "[redacted]";
  return out;
}

export async function dumpAllTables(db?: any): Promise<BackupDump> {
  db = db || (await getDb());
  if (!db) throw new Error("Database unavailable");
  const res: any = await db.execute(sql`SHOW TABLES`);
  const list: any[] = Array.isArray(res?.[0]) ? res[0] : Array.isArray(res) ? res : [];
  const names = list.map((r) => String(Object.values(r)[0])).filter((n) => /^[A-Za-z0-9_]+$/.test(n)).sort();
  const tables: BackupDump["tables"] = {};
  for (const name of names) {
    const r: any = await db.execute(sql.raw("SELECT * FROM `" + name + "`"));
    const rows = (Array.isArray(r?.[0]) ? r[0] : Array.isArray(r) ? r : []).map((row: any) => redactRow(name, row));
    tables[name] = { count: rows.length, hash: tableHash(rows), rows };
  }
  return { version: 1, createdAt: new Date().toISOString(), tables };
}

export function encryptBackup(dump: BackupDump): Buffer {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(dump), "utf-8"), { level: 9 });
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", backupKey(), iv);
  const ct = Buffer.concat([c.update(gz), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), ct]);
}
export function decryptBackup(buf: Buffer): BackupDump {
  if (!buf.subarray(0, 5).equals(MAGIC)) throw new Error("Not a LevelUp backup file");
  const iv = buf.subarray(5, 17), tag = buf.subarray(17, 33), ct = buf.subarray(33);
  const d = crypto.createDecipheriv("aes-256-gcm", backupKey(), iv);
  d.setAuthTag(tag);
  const gz = Buffer.concat([d.update(ct), d.final()]);
  return JSON.parse(zlib.gunzipSync(gz).toString("utf-8"));
}

/** Restore test: the bytes decrypt, decompress, parse, and every table matches. */
export function verifyBackup(buf: Buffer, source: BackupDump): { ok: boolean; tables: number; rows: number; mismatches: string[] } {
  const back = decryptBackup(buf);
  const mismatches: string[] = [];
  let rows = 0;
  for (const [name, t] of Object.entries(source.tables)) {
    const b = back.tables?.[name];
    if (!b) { mismatches.push(`${name}: missing`); continue; }
    if (!Array.isArray(b.rows) || b.rows.length !== t.count || b.count !== t.count) mismatches.push(`${name}: ${b?.rows?.length ?? "?"} rows, expected ${t.count}`);
    else if (tableHash(b.rows) !== t.hash) mismatches.push(`${name}: checksum differs`);
    rows += t.count;
  }
  return { ok: mismatches.length === 0, tables: Object.keys(source.tables).length, rows, mismatches };
}

export type BackupResult = { at: string; ok: boolean; tables?: number; rows?: number; bytes?: number; provider?: string; fileId?: string; key?: string; error?: string; mismatches?: string[] };

let _running = false;
export async function runBackup(reason: "nightly" | "manual"): Promise<BackupResult> {
  if (_running) return { at: new Date().toISOString(), ok: false, error: "A backup is already running." };
  _running = true;
  const at = new Date().toISOString();
  let result: BackupResult;
  try {
    const dump = await dumpAllTables();
    const buf = encryptBackup(dump);
    const v = verifyBackup(buf, dump);
    if (!v.ok) throw Object.assign(new Error("Backup verification failed"), { mismatches: v.mismatches });
    const { storagePutPrivate } = await import("../storage");
    const up = await storagePutPrivate(`backups/levelup-${at.slice(0, 10)}-${reason}.lubk`, buf, "application/octet-stream");
    result = { at, ok: true, tables: v.tables, rows: v.rows, bytes: buf.length, provider: up.provider, fileId: up.id, key: up.key };
    console.log(`[backup] ${reason}: ${v.tables} tables, ${v.rows} rows, ${(buf.length / 1048576).toFixed(1)} MB → ${up.provider} ${up.id}`);
  } catch (e: any) {
    result = { at, ok: false, error: String(e?.message || e).slice(0, 300), mismatches: e?.mismatches };
    console.error(`[backup] ${reason} failed:`, result.error);
  } finally {
    _running = false;
  }
  try { await setSystemSetting("lastBackup", JSON.stringify(result)); } catch { /* status only */ }
  return result;
}

export async function backupStatus(): Promise<BackupResult | null> {
  try { const v = await getSystemSetting("lastBackup"); return v ? JSON.parse(v) : null; } catch { return null; }
}

/** Nightly at ~08:00 UTC (about 3–4 am US Eastern); checks hourly, runs once a day. */
export function startBackupCron() {
  const tick = async () => {
    try {
      const now = new Date();
      if (now.getUTCHours() < 8) return;
      const last = await backupStatus();
      if (last && last.at.slice(0, 10) === now.toISOString().slice(0, 10) && last.ok) return;
      if (last && !last.ok && Date.now() - Date.parse(last.at) < 3 * 3600e3) return; // retry a failure after 3h
      await runBackup("nightly");
    } catch (e) { console.error("[backup] cron tick failed:", e); }
  };
  setTimeout(tick, 5 * 60 * 1000);
  setInterval(tick, 60 * 60 * 1000);
}
