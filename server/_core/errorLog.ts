/**
 * Error log (build -233, migration 0059) — the app's own observability.
 *
 * Server side: installServerErrorCapture() wraps console.error, so every
 * failure the code already logs (crons, failed requests, startup) lands in
 * error_log without touching each call site, plus unhandled rejections and
 * uncaught exceptions. Client side: signed-in browsers report window errors
 * through ops.reportClientError.
 *
 * Rows are grouped by fingerprint = source + the message with numbers, ids
 * and quoted values normalised, so one failure repeating every minute is one
 * row with a count, not thousands. Writes are throttled per fingerprint and
 * overall; recording never throws and never logs through console.error
 * (that would recurse).
 */
import { desc, sql, gte } from "drizzle-orm";
import { getDb } from "../db";
import { errorLog } from "../../drizzle/schema";

export type ErrorReport = {
  source: "server" | "client";
  message: string;
  stack?: string | null;
  where?: string | null;
  build?: string | null;
  userId?: number | null;
  userAgent?: string | null;
};

function fnv(s: string, seed = 0x811c9dc5): string {
  let h = seed;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Messages that differ only in numbers, ids or quoted values group together. */
export function normaliseMessage(m: string): string {
  return String(m || "")
    .replace(/https?:\/\/\S+/g, "<url>")
    .replace(/(["'`])(?:(?!\1).){0,200}\1/g, "<q>")
    .replace(/\b[0-9a-f]{8,}\b/gi, "<id>")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}
export function fingerprintOf(source: string, message: string): string {
  const n = source + "|" + normaliseMessage(message);
  return fnv(n) + fnv(n, 0x01000193);
}

// Throttle: one write per fingerprint per 10s (skipped repeats are added to
// the next write's count) and at most 120 writes a minute overall.
const pending = new Map<string, { n: number; at: number }>();
let windowStart = 0, windowWrites = 0;

export async function recordError(r: ErrorReport): Promise<void> {
  try {
    const message = String(r.message || "(no message)").slice(0, 1000);
    const fp = fingerprintOf(r.source, message);
    const now = Date.now();
    const p = pending.get(fp);
    if (p && now - p.at < 10_000) { p.n++; return; }
    if (now - windowStart > 60_000) { windowStart = now; windowWrites = 0; }
    if (++windowWrites > 120) return;
    const extra = p ? p.n : 0;
    pending.set(fp, { n: 0, at: now });
    if (pending.size > 2000) pending.clear();
    const db = await getDb();
    if (!db) return;
    const row = {
      fingerprint: fp,
      source: r.source,
      message,
      stack: r.stack ? String(r.stack).slice(0, 8000) : null,
      location: r.where ? String(r.where).slice(0, 512) : null,
      build: r.build ? String(r.build).slice(0, 40) : null,
      userId: r.userId ?? null,
      userAgent: r.userAgent ? String(r.userAgent).slice(0, 255) : null,
      count: 1 + extra,
    };
    await db.insert(errorLog).values(row).onDuplicateKeyUpdate({
      set: {
        count: sql`${errorLog.count} + ${1 + extra}`,
        lastAt: new Date(),
        message: row.message,
        stack: row.stack,
        location: row.location,
        build: row.build,
        userId: row.userId,
        userAgent: row.userAgent,
      },
    });
  } catch {
    // Never surface: the error log failing must not create more errors.
  }
}

function describe(args: unknown[]): { message: string; stack: string | null } {
  let stack: string | null = null;
  const parts = args.map((a) => {
    if (a instanceof Error) { stack = stack || a.stack || null; return a.message; }
    if (typeof a === "string") return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  });
  return { message: parts.join(" ").slice(0, 1000), stack };
}

let installed = false;
export function installServerErrorCapture(): void {
  if (installed) return;
  installed = true;
  const orig = console.error.bind(console);
  let inside = false;
  console.error = (...args: unknown[]) => {
    orig(...args);
    if (inside) return;
    inside = true;
    try {
      const d = describe(args);
      const where = (d.message.match(/^\[[^\]]{1,60}\]/) || [null])[0];
      void recordError({ source: "server", message: d.message, stack: d.stack, where, build: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 12) || null });
    } finally { inside = false; }
  };
  // A stray rejected promise (a cron's un-awaited call) is logged, not fatal:
  // the default would crash the server for every user.
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason instanceof Error ? reason : String(reason));
  });
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err);
    // Record it, then exit as Node would — the process state is unknown.
    setTimeout(() => process.exit(1), 500).unref?.();
  });
}

/** Grouped errors seen since `sinceHours` ago, most recent first. */
export async function readErrors(sinceHours = 24 * 7, limit = 200) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - sinceHours * 3600_000);
  return db.select().from(errorLog).where(gte(errorLog.lastAt, since)).orderBy(desc(errorLog.lastAt)).limit(Math.min(limit, 500));
}
