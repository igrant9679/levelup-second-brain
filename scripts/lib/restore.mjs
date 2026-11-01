/**
 * Put a LevelUp backup dump back into a database (build -264).
 *
 * Used by scripts/restore-backup.mjs and the restore drill test
 * (server/phase10.restore.test.ts, runs in CI against MySQL).
 *
 * The target must be an EMPTY database created by `drizzle-kit migrate`
 * (same migrations as the backup's server) — restoreDump refuses one that
 * already holds rows, so it can never be pointed at the live database by
 * mistake and mix two copies. Dates go back as UTC (open the connection with
 * timezone 'Z'), JSON columns are re-serialised, foreign keys are off during
 * the load. "[redacted]" secrets stay redacted: reconnect integrations and
 * have people use "Forgot password" afterwards.
 */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const SKIP = new Set(["__drizzle_migrations"]);

const rowsOf = (r) => (Array.isArray(r) && Array.isArray(r[0]) ? r[0] : Array.isArray(r) ? r : []);

/** conn: a mysql2/promise connection (timezone: 'Z'). Returns {tables, rows, skipped}. */
export async function restoreDump(conn, dump, { log = () => {}, batch = 200 } = {}) {
  if (!dump || dump.version !== 1 || !dump.tables) throw new Error("Not a LevelUp backup dump");
  const names = rowsOf(await conn.query("SHOW TABLES")).map((r) => String(Object.values(r)[0]));
  const present = new Set(names);
  for (const n of names) {
    if (SKIP.has(n)) continue;
    const [c] = rowsOf(await conn.query("SELECT COUNT(*) AS n FROM ??", [n]));
    if (Number(c?.n) > 0) throw new Error(`The target database is not empty (${n} has ${c.n} rows). Restore into a fresh database made by drizzle-kit migrate.`);
  }
  let tables = 0, rows = 0;
  const skipped = [];
  await conn.query("SET FOREIGN_KEY_CHECKS=0");
  try {
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
  } finally {
    await conn.query("SET FOREIGN_KEY_CHECKS=1");
  }
  return { tables, rows, skipped };
}
