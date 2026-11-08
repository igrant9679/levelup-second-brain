/**
 * Build -264 (Audit 2 Phase 3): background jobs on deploys and restarts.
 *  - job(): no overlapping runs of one job, nothing new once shutdown began;
 *    shutdown waits for running jobs, then runs the cleanups.
 *  - send ledger: a cron's claim whose email never went out is released at
 *    shutdown (the next instance sends it); settled claims and untracked
 *    ones (browser report catch-up, one-time action claims) are not.
 *  - a coach check-in stored but never emailed / pushed is retried (3 tries).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const sent: any[] = [];
let sendOk = true;
vi.mock("./_core/sendEmail", () => ({ sendEmail: vi.fn(async (m: any) => { sent.push(m); return sendOk; }) }));
vi.mock("./db", () => ({ getDb: vi.fn(async () => null), getSystemSetting: vi.fn(async () => null), setSystemSetting: vi.fn(async () => {}), adminListAllUsers: vi.fn(async () => []) }));

import { job, drain, isShuttingDown, _resetLifecycle } from "./_core/lifecycle";
import { _setLockProviderForTests } from "./_core/dbLock";
// These cases test the in-process guard. With DATABASE_URL set (CI), job() would
// first open a real GET_LOCK connection, so the job would start a few ms later.
_setLockProviderForTests(async () => null);
import { claimSend, settleClaims, releaseOpenClaims, releaseSend, _openClaimCount } from "./_core/sendLedger";
import { redeliverPending } from "./_core/coachCron";

beforeEach(() => { _resetLifecycle(); sent.length = 0; sendOk = true; });

/** A send_ledger stand-in: INSERT IGNORE / DELETE on (userId, kind, period). */
function ledgerDb() {
  const rows = new Set<string>();
  const exec = vi.fn(async (q: any) => {
    const chunks: any[] = q.queryChunks || [];
    const text = chunks.map((c: any) => (c && c.value && Array.isArray(c.value) ? c.value.join("") : "")).join("?");
    const vals = chunks.filter((c: any) => !(c && c.value && Array.isArray(c.value))).map((c: any) => (c && typeof c === "object" && "value" in c ? c.value : c));
    const k = vals.slice(0, 3).join("|");
    if (/INSERT IGNORE/.test(text)) { if (rows.has(k)) return [{ affectedRows: 0 }]; rows.add(k); return [{ affectedRows: 1 }]; }
    if (/DELETE/.test(text)) { rows.delete(k); return [{ affectedRows: 1 }]; }
    return [[]];
  });
  return { db: { execute: exec } as any, rows };
}

describe("job()", () => {
  it("skips a tick while the previous run of the same job is still going", async () => {
    let release!: () => void, runs = 0;
    const slow = () => new Promise<void>((r) => { runs++; release = r; });
    const a = job("digest-test", slow);
    const b = await job("digest-test", slow);       // overlaps → skipped
    expect(b).toBeUndefined();
    expect(runs).toBe(1);
    await job("other-job", async () => { runs++; }); // a different job still runs
    expect(runs).toBe(2);
    release(); await a;
    await job("digest-test", async () => { runs++; }); // free again
    expect(runs).toBe(3);
  });

  it("shutdown waits for a running job, then refuses new ones", async () => {
    let done = false;
    const p = job("long", () => new Promise<void>((r) => setTimeout(() => { done = true; r(); }, 60)));
    const r = await drain(2000);
    expect(done).toBe(true);
    expect(r).toEqual({ waited: 1, timedOut: false });
    expect(isShuttingDown()).toBe(true);
    let ran = false;
    await job("late", async () => { ran = true; });
    expect(ran).toBe(false);
    await p;
  });
});

describe("send ledger on shutdown", () => {
  it("releases a cron claim whose email never went out — and only that one", async () => {
    const { db, rows } = ledgerDb();
    expect(await claimSend(db, 1, "digest", "2026-11-01", "digest")).toBe(true);   // sent, settled below
    settleClaims("digest");
    expect(await claimSend(db, 2, "digest", "2026-11-01", "digest")).toBe(true);   // mid-send when the deploy hits
    expect(await claimSend(db, 3, "claim:agent", "card-9")).toBe(true);           // one-time claim: never tracked
    expect(await claimSend(db, 4, "report:7", "2026-11-01")).toBe(true);           // the browser's report claim
    expect(await claimSend(db, 2, "digest", "2026-11-01", "digest")).toBe(false);  // already claimed
    expect(_openClaimCount()).toBe(1);
    // a job that never finishes (the email in flight) → drain times out → cleanup releases
    void job("daily-digest", () => new Promise(() => {}));
    const r = await drain(50);
    expect(r.timedOut).toBe(true);
    expect([...rows].sort()).toEqual(["1|digest|2026-11-01", "3|claim:agent|card-9", "4|report:7|2026-11-01"]);
    expect(_openClaimCount()).toBe(0);
  });

  it("a failed send's own release also clears the tracking", async () => {
    const { db } = ledgerDb();
    await claimSend(db, 5, "weekly", "2026-11-01", "weekly");
    await releaseSend(db, 5, "weekly", "2026-11-01");
    expect(_openClaimCount()).toBe(0);
    expect(await releaseOpenClaims()).toBe(0);
  });
});

describe("coach check-ins that were never delivered", () => {
  function coachDb(msgs: any[]) {
    const updates: any[] = [];
    const db: any = {
      select: (cols?: any) => {
        let table: any = null;
        const q: any = {
          from: (t: any) => { table = t; return q; }, where: () => q, orderBy: () => q,
          limit: () => {
            const name = table?.[Symbol.for("drizzle:Name")];
            if (name === "coach_messages") return Promise.resolve(msgs);
            if (name === "user_app_data") return Promise.resolve([{ prefs: JSON.stringify({ coach: { checkins: { enabled: true } } }) }]);
            if (name === "users") return Promise.resolve([{ id: 7, email: "me@example.com", role: "user", openId: "x" }]);
            return Promise.resolve([]);
          },
        };
        return q;
      },
      update: () => ({ set: (v: any) => ({ where: () => { updates.push(v); return Promise.resolve(); } }) }),
    };
    return { db, updates };
  }
  const old = new Date(Date.now() - 20 * 60e3);
  it("emails a stored check-in whose email never went out; stops after 3 tries", async () => {
    const m = { id: 501, userId: 7, kind: "midday", title: "Midday check-in", body: "Two things left.", pushText: "2 left", actions: null, channels: "inapp,email", emailedAt: null, pushedAt: null, createdAt: old };
    const { db, updates } = coachDb([m]);
    sendOk = false;
    for (let i = 0; i < 5; i++) await redeliverPending(db);
    expect(sent.length).toBe(3);                 // 3 tries, then left alone
    expect(sent[0].to).toBe("me@example.com");
    expect(sent[0].subject).toContain("Midday check-in");
    expect(updates).toEqual([]);                 // never marked emailed while failing
  });
  it("marks it emailed once the send works; replies and in-app-only messages are left alone", async () => {
    const m = { id: 502, userId: 7, kind: "evening", title: "Evening wrap", body: "Done.", pushText: "", actions: "[]", channels: "inapp,email", emailedAt: null, pushedAt: null, createdAt: old };
    const reply = { ...m, id: 503, kind: "reply" };
    const inapp = { ...m, id: 504, channels: "inapp" };
    const { db, updates } = coachDb([m, reply, inapp]);
    await redeliverPending(db);
    expect(sent.map((x) => x.subject)).toEqual(["🧭 Evening wrap"]);
    expect(updates.length).toBe(1);
    expect(updates[0].emailedAt).toBeInstanceOf(Date);
  });
});
