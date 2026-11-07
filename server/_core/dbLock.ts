/**
 * Cross-instance named locks (MySQL GET_LOCK / RELEASE_LOCK).
 *
 * A named lock belongs to the connection that took it, so it must be taken
 * and released on the SAME connection — a pooled `db.execute` may run the two
 * on different connections. Each lock here therefore gets its own short-lived
 * connection (outside the drizzle pool, so a long cron run holding a lock
 * never starves request queries). The work itself runs on the normal pool.
 *
 * Used by:
 *   - lifecycle.job()  — `lu_job_<name>`, timeout 0: a cron tick that another
 *     instance is already running (deploy overlap, two replicas) is skipped
 *     (audit F62).
 *   - account creation — `lu_user_create`, timeout 5 s, with a case-insensitive
 *     email check inside the lock (audit F70; users.email is deliberately not
 *     UNIQUE, see drizzle/schema.ts).
 *
 * withNamedLock(name, timeoutSec, fn) →
 *   { acquired: true,  value }   fn ran while the lock was held
 *   { acquired: false }          another session holds it (fn NOT run)
 *   { acquired: null,  value }   no database to lock with — fn ran unguarded
 *                                (callers wanting "skip if unsure" check this)
 */
export type LockResult<T> = { acquired: true; value: T } | { acquired: false } | { acquired: null; value: T };

export interface LockConnection {
  getLock(name: string, timeoutSec: number): Promise<boolean>;
  release(name: string): Promise<void>;
  close(): Promise<void>;
}
type Provider = () => Promise<LockConnection | null>;

let _provider: Provider | null = null;
/** Test seam: replace how lock connections are opened (null → default). */
export function _setLockProviderForTests(p: Provider | null): void { _provider = p; }

async function defaultProvider(): Promise<LockConnection | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  let conn: any;
  try {
    const mysql: any = await import("mysql2/promise");
    conn = await (mysql.default || mysql).createConnection(url);
  } catch (e) {
    console.warn("[dbLock] could not open a lock connection:", String((e as any)?.message || e).slice(0, 160));
    return null;
  }
  return {
    async getLock(name, timeoutSec) {
      const [rows]: any = await conn.query("SELECT GET_LOCK(?, ?) AS got", [name, timeoutSec]);
      return Number(rows?.[0]?.got) === 1;
    },
    async release(name) { try { await conn.query("SELECT RELEASE_LOCK(?)", [name]); } catch { /* closing frees it anyway */ } },
    async close() { try { await conn.end(); } catch { try { conn.destroy(); } catch { /* gone */ } } },
  };
}

export async function withNamedLock<T>(name: string, timeoutSec: number, fn: () => Promise<T>): Promise<LockResult<T>> {
  const lockName = name.slice(0, 64); // MySQL caps lock names at 64 characters
  let conn: LockConnection | null = null;
  try { conn = await (_provider || defaultProvider)(); } catch { conn = null; }
  if (!conn) return { acquired: null, value: await fn() };
  let got = false;
  try {
    got = await conn.getLock(lockName, timeoutSec);
  } catch (e) {
    console.warn(`[dbLock] GET_LOCK ${lockName} failed:`, String((e as any)?.message || e).slice(0, 160));
    await conn.close();
    return { acquired: null, value: await fn() };
  }
  if (!got) { await conn.close(); return { acquired: false }; }
  try {
    return { acquired: true, value: await fn() };
  } finally {
    await conn.release(lockName);
    await conn.close();
  }
}

/**
 * Run an account-creating `fn` under the `lu_user_create` lock after a
 * case-insensitive check that `email` has no account yet. `exists(email)` is
 * evaluated INSIDE the lock; when it is true, `onExists()` decides (usually a
 * CONFLICT error). Throws a plain Error('busy') if the lock can't be had in 5 s.
 */
export async function createUserSerialised<T>(email: string, exists: (email: string) => Promise<boolean>, onExists: () => never, fn: () => Promise<T>): Promise<T> {
  const r = await withNamedLock("lu_user_create", 5, async () => {
    if (await exists(email)) onExists();
    return fn();
  });
  if (r.acquired === false) throw new Error("busy");
  return r.value;
}
