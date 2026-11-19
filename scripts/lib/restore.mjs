/**
 * Put a LevelUp backup dump back into a database (build -264).
 *
 * Used by scripts/restore-backup.mjs and the restore drill test
 * (server/phase10.restore.test.ts, runs in CI against MySQL).
 *
 * The target must be an EMPTY database created by `drizzle-kit migrate`
 * (same migrations as the backup's server) — restoreDump refuses one that
 * already holds rows, so it can never be pointed at the live database by
 * mistake and mix two copies. "Empty" allows the one row the migrations
 * themselves insert: workspace 1 with no owner (0063, build -278). It is
 * replaced by the backup's own workspaces.
 *
 * A backup taken BEFORE workspaces existed (build -277 and older) has no
 * workspaces table and no workspace columns: its accounts, invites and log
 * rows are placed in workspace 1 afterwards and the workspace settings are
 * copied, exactly as migration 0063 did for the live database. Dates go back as UTC (open the connection with
 * timezone 'Z'), JSON columns are re-serialised, foreign keys are off during
 * the load. "[redacted]" secrets stay redacted: reconnect integrations and
 * have people use "Forgot password" afterwards.
 */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SKIP = new Set(["__drizzle_migrations"]);

// Rows a fresh `drizzle-kit migrate` leaves behind: table -> the WHERE that
// matches ONLY those rows. Anything else in the table means "not empty".
const SEEDED = { workspaces: "id = 1 AND ownerUserId IS NULL AND createdBy IS NULL" };
const WS_SETTING_KEYS = ["aiProvider", "aiKey_openai", "aiKey_claude", "aiKey_gemini", "notificationSender", "teamStarterPreset"];

const rowsOf = (r) => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : Array.isArray(r) ? r : []);

/** conn: a mysql2/promise connection (timezone: 'Z'). Returns {tables, rows, skipped}. */
export async function restoreDump(conn, dump, { log = () => {}, batch = 200 } = {}) {
  if (!dump || dump.version !== 1 || !dump.tables) throw new Error("Not a LevelUp backup dump");
  const names = rowsOf(await conn.query("SHOW TABLES")).map((r) => String(Object.values(r)[0]));
  const present = new Set(names);
  for (const n of names) {
    if (SKIP.has(n)) continue;
    const [c] = rowsOf(await conn.query("SELECT COUNT(*) AS n FROM ??" + (SEEDED[n] ? " WHERE NOT (" + SEEDED[n] + ")" : ""), [n]));
    if (Number(c?.n) > 0) throw new Error(`The target database is not empty (${n} has ${c.n} rows). Restore into a fresh database made by drizzle-kit migrate.`);
  }
  let tables = 0, rows = 0;
  const skipped = [];
  const preWorkspaces = !dump.tables.workspaces && present.has("workspaces");
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  try {
    // the backup brings its own copy of what the migrations seeded
    for (const n of Object.keys(SEEDED)) if (present.has(n) && dump.tables[n]) await conn.query("DELETE FROM ??", [n]);
    for (const [name, t] of Object.entries(dump.tables)) {
      if (SKIP.has(name)) continue;
      if (!present.has(name)) { skipped.push(name); log(`  skip ${name}: not in the target schema`); continue; }
      const cols = rowsOf(await conn.query("SHOW COLUMNS FROM ??", [name]));
      const type = new Map(cols.map((c) => [String(c.Field), String(c.Type).toLowerCase()]));
      const list = Array.isArray(t.rows) ? t.rows : [];
      if (!list.length) { tables++; continue; }
      const fields = Object.keys(list[0]).filter((f) => type.has(f));
      const conv = (f, v) => {
        if (v == null) return v;
        const ty = type.get(f) || "";
        if ((ty.startsWith("timestamp") || ty.startsWith("datetime")) && typeof v === "string" && ISO.test(v)) return new Date(v);
        if (ty.startsWith("date") && !ty.startsWith("datetime") && typeof v === "string" && ISO.test(v)) return v.slice(0, 10);
        if (ty === "json" && typeof v !== "string") return JSON.stringify(v);
        if (typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
        return v;
      };
      for (let i = 0; i < list.length; i += batch) {
        const values = list.slice(i, i + batch).map((r) => fields.map((f) => conv(f, r[f])));
        await conn.query("INSERT INTO ?? (??) VALUES ?", [name, fields, values]);
      }
      tables++; rows += list.length;
      log(`  ${name.padEnd(36)} ${String(list.length).padStart(7)} rows`);
    }
    if (preWorkspaces) {
      // what migration 0063 did to the live database, for a backup older than it
      const has = async (t, c) => present.has(t) && rowsOf(await conn.query("SHOW COLUMNS FROM ?? LIKE ?", [t, c])).length > 0;
      if (await has("users", "workspaceId")) await conn.query("UPDATE users SET workspaceId = 1 WHERE workspaceId = 0");
      if (await has("team_invites", "workspaceId")) await conn.query("UPDATE team_invites SET workspaceId = 1 WHERE workspaceId = 0");
      if (await has("audit_log", "workspaceId")) await conn.query("UPDATE audit_log SET workspaceId = 1 WHERE workspaceId IS NULL");
      if (await has("email_delivery_log", "workspaceId")) await conn.query("UPDATE email_delivery_log SET workspaceId = 1 WHERE workspaceId IS NULL");
      if (present.has("workspace_settings") && present.has("system_settings")) {
        await conn.query("INSERT IGNORE INTO workspace_settings (workspaceId, `key`, value) SELECT 1, `key`, value FROM system_settings WHERE `key` IN (?) AND value <> '[redacted]'", [WS_SETTING_KEYS]);
      }
      log("  backup predates workspaces: everything placed in workspace 1");
    }
    // Audit 3: a removed member's rows survive under their old id. After a restore the next new
    // account must not get such an id (and inherit those rows): start the users ids above every
    // user id anything in the backup refers to.
    if (present.has("users")) {
      let maxId = 0;
      for (const t of Object.values(dump.tables)) {
        for (const r of Array.isArray(t?.rows) ? t.rows : []) {
          for (const k of ["userId", "accountId", "ownerUserId", "invitedBy", "acceptedUserId", "createdBy", "uploadedBy"]) {
            const v = Number(r?.[k]);
            if (Number.isInteger(v) && v > maxId) maxId = v;
          }
        }
      }
      for (const r of Array.isArray(dump.tables.users?.rows) ? dump.tables.users.rows : []) { const v = Number(r?.id); if (Number.isInteger(v) && v > maxId) maxId = v; }
      if (maxId > 0) await conn.query(`ALTER TABLE users AUTO_INCREMENT = ${Math.floor(maxId) + 1}`);
    }
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  }
  return { tables, rows, skipped, preWorkspaces };
}
