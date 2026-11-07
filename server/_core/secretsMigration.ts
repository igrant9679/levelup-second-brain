/**
 * One-time boot pass (audit F25): encrypt secrets that are still stored in
 * plaintext. New writes are encrypted by the schema's secretText columns and
 * by setSystemSetting for aiKey_*; this converts rows written before that.
 *
 * - Reads the raw stored values (plain SQL, so nothing is decrypted), and
 *   rewrites only values without the "enc:v1:" prefix.
 * - Guarded by system_settings.secretsEncryptedV1 (set only when every value
 *   was handled), so it runs until it fully succeeds, then never again.
 * - Skipped (and retried next boot) when no key is configured.
 * - Never throws; logs counts only — never a value.
 */
import { sql } from "drizzle-orm";
import { encryptSecret, isEncryptedSecret, secretsKeySource, SECRET_SETTING_KEY } from "./secrets";

const FLAG = "secretsEncryptedV1";

/** table → id column + secret columns (must match the secretText columns in drizzle/schema.ts). */
export const SECRET_COLUMNS: Array<{ table: string; id: string; cols: string[] }> = [
  { table: "oauth_tokens", id: "id", cols: ["accessToken", "refreshToken"] },
  { table: "user_oauth_credentials", id: "id", cols: ["clientSecret"] },
  { table: "smtp_imap_accounts", id: "id", cols: ["imapPassword", "smtpPassword"] },
  { table: "external_source_credentials", id: "id", cols: ["apiToken", "clientSecret", "refreshToken"] },
];

const rowsOf = (r: any): any[] => (Array.isArray(r?.[0]) ? r[0] : Array.isArray(r) ? r : []);

export async function encryptExistingSecretsOnce(dbIn?: any): Promise<{ ran: boolean; encrypted: number; failed: number; reason?: string }> {
  try {
    const { getDb, getSystemSetting, setSystemSetting } = await import("../db");
    const db = dbIn || (await getDb());
    if (!db) return { ran: false, encrypted: 0, failed: 0, reason: "no database" };
    if (secretsKeySource() === "none") {
      console.warn("[secrets] no SECRETS_KEY or JWT_SECRET — stored secrets stay unencrypted");
      return { ran: false, encrypted: 0, failed: 0, reason: "no key" };
    }
    if (await getSystemSetting(FLAG)) return { ran: false, encrypted: 0, failed: 0, reason: "already done" };

    let encrypted = 0, failed = 0;
    for (const t of SECRET_COLUMNS) {
      let rows: any[] = [];
      try {
        rows = rowsOf(await db.execute(sql.raw("SELECT `" + t.id + "`, " + t.cols.map((c) => "`" + c + "`").join(", ") + " FROM `" + t.table + "`")));
      } catch (e) {
        console.error(`[secrets] could not read ${t.table}:`, String((e as any)?.message || e).slice(0, 160));
        failed++;
        continue;
      }
      for (const row of rows) {
        for (const c of t.cols) {
          const v = row[c];
          if (typeof v !== "string" || v === "" || isEncryptedSecret(v)) continue;
          try {
            await db.execute(sql`UPDATE ${sql.raw("`" + t.table + "`")} SET ${sql.raw("`" + c + "`")} = ${encryptSecret(v)} WHERE ${sql.raw("`" + t.id + "`")} = ${row[t.id]}`);
            encrypted++;
          } catch (e) {
            failed++;
            console.error(`[secrets] could not encrypt ${t.table}.${c} #${row[t.id]}:`, String((e as any)?.message || e).slice(0, 160));
          }
        }
      }
    }
    // Workspace AI keys in system_settings.
    try {
      const rows = rowsOf(await db.execute(sql`SELECT \`key\`, \`value\` FROM system_settings WHERE \`key\` LIKE 'aiKey\\_%'`));
      for (const row of rows) {
        if (!SECRET_SETTING_KEY.test(String(row.key))) continue;
        const v = row.value;
        if (typeof v !== "string" || v === "" || isEncryptedSecret(v)) continue;
        try {
          await db.execute(sql`UPDATE system_settings SET \`value\` = ${encryptSecret(v)} WHERE \`key\` = ${row.key}`);
          encrypted++;
        } catch (e) { failed++; console.error(`[secrets] could not encrypt setting ${row.key}:`, String((e as any)?.message || e).slice(0, 160)); }
      }
    } catch (e) { failed++; console.error("[secrets] could not read system_settings:", String((e as any)?.message || e).slice(0, 160)); }

    if (!failed) await setSystemSetting(FLAG, JSON.stringify({ at: new Date().toISOString(), encrypted, keySource: secretsKeySource() }));
    console.log(`[secrets] encryption pass: ${encrypted} value(s) encrypted, ${failed} failure(s), key from ${secretsKeySource()}`);
    return { ran: true, encrypted, failed };
  } catch (e) {
    console.error("[secrets] encryption pass failed:", String((e as any)?.message || e).slice(0, 200));
    return { ran: false, encrypted: 0, failed: 1, reason: "error" };
  }
}
