/**
 * Cron runs and shutdown (build -264, Audit 2 Phase 3).
 *
 * - `job(name, fn)` runs one tick of a background job: never two of the same
 *   job at once (a slow pass used to overlap the next tick — two digest
 *   passes racing the same claims), and none once shutdown has begun. Every
 *   run is tracked so shutdown can wait for it.
 * - `installShutdown(server)`: on SIGTERM / SIGINT (Railway sends SIGTERM to
 *   the old instance on every deploy) stop accepting connections and new job
 *   runs, give running ones up to 20 s, then run the `onShutdown` cleanups —
 *   sendLedger releases claims whose email never went out, so the next
 *   instance's tick sends it instead of the day's email being lost.
 * - `isShuttingDown()`: long passes check it between users.
 */
const running = new Set<string>();
const active = new Set<Promise<unknown>>();
const cleanups: Array<() => unknown> = [];
let stopping = false;

export const isShuttingDown = () => stopping;

export function job<T>(name: string, fn: () => Promise<T>): Promise<T | undefined> {
  if (stopping) return Promise.resolve(undefined);
  if (running.has(name)) {
    console.log(`[${name}] previous run still going — skipping this tick`);
    return Promise.resolve(undefined);
  }
  running.add(name);
  const p = (async () => {
    try { return await fn(); } finally { running.delete(name); }
  })();
  active.add(p);
  p.then(() => active.delete(p), () => active.delete(p));
  return p;
}

export function onShutdown(fn: () => unknown): void { cleanups.push(fn); }

/** For tests: wait for running jobs (up to ms) and run the cleanups, without exiting. */
export async function drain(ms = 20_000): Promise<{ waited: number; timedOut: boolean }> {
  stopping = true;
  const n = active.size;
  let timedOut = false;
  await Promise.race([
    Promise.allSettled(Array.from(active)),
    new Promise<void>((r) => setTimeout(() => { timedOut = active.size > 0; r(); }, ms).unref?.()),
  ]);
  for (const f of cleanups) {
    try { await f(); } catch (e) { console.error("[shutdown] cleanup failed:", e); }
  }
  return { waited: n, timedOut };
}
/** For tests only. */
export function _resetLifecycle(): void { stopping = false; running.clear(); active.clear(); }

let installed = false;
export function installShutdown(server: { close?: (cb?: () => void) => unknown }, graceMs = 20_000): void {
  if (installed) return;
  installed = true;
  const go = async (sig: string) => {
    if (stopping) return;
    console.log(`[shutdown] ${sig}: letting ${active.size} running job(s) finish (up to ${Math.round(graceMs / 1000)} s)`);
    try { server.close?.(); } catch { /* already closed */ }
    const r = await drain(graceMs);
    console.log(`[shutdown] done${r.timedOut ? " (some jobs were still running)" : ""}`);
    process.exit(0);
  };
  process.once("SIGTERM", () => { void go("SIGTERM"); });
  process.once("SIGINT", () => { void go("SIGINT"); });
}
