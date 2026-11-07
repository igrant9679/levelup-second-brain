/**
 * Audit 2026-11-06 medium/low (server): jobs, integrations, migrations.
 *  - F62 job() also takes the MySQL lock lu_job_<name> (skips when another
 *    instance holds it; runs on the in-process guard when there is no DB);
 *  - F72 one Microsoft refresh (tenant → MS_TENANT_ID → common, timeout);
 *    Nifty requests time out and paging no longer stops at 5,000;
 *  - F38 the Nifty debug/probe endpoints are gone;
 *  - F96 promoted subtasks carry the parent's fields in raw + parent stamp;
 *  - F185 / F196 bank sync keeps rawDesc, matches rules on payee OR description,
 *    and dates transactions on the owner's clock.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null), getUserOauthCredential: vi.fn(async () => null), upsertOAuthToken: vi.fn(async () => {}), getOAuthToken: vi.fn(async () => null) }));

import { job, _resetLifecycle } from "./_core/lifecycle";
import { _setLockProviderForTests } from "./_core/dbLock";
import { exchangeMsRefreshToken, msTokenUrl } from "./_core/msToken";
import { pullNiftyProject, NIFTY_MAX_TASKS } from "./_core/niftyAdapter";
import { externalSourcesRouter } from "./routers/externalSources";
import { promotedSubtaskRaw, taskMigrationsRouter } from "./routers/taskMigrations";
import { mergeSimplefinPull } from "./_core/simplefinAutoSync";

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; vi.unstubAllEnvs(); _setLockProviderForTests(null); });
beforeEach(() => { _resetLifecycle(); });

describe("cross-instance job lock (F62)", () => {
  const provider = (got: boolean, ev: string[]) => async () => ({
    async getLock(n: string, t: number) { ev.push(`get ${n} ${t}`); return got; },
    async release(n: string) { ev.push(`release ${n}`); },
    async close() { ev.push("close"); },
  });
  it("runs the tick while holding lu_job_<name>, then releases it", async () => {
    const ev: string[] = [];
    _setLockProviderForTests(provider(true, ev));
    const r = await job("digest", async () => { ev.push("run"); return 7; });
    expect(r).toBe(7);
    expect(ev).toEqual(["get lu_job_digest 0", "run", "release lu_job_digest", "close"]);
  });
  it("skips the tick when another instance holds the lock", async () => {
    const ev: string[] = [];
    _setLockProviderForTests(provider(false, ev));
    let ran = false;
    expect(await job("digest", async () => { ran = true; })).toBeUndefined();
    expect(ran).toBe(false);
    // and the in-process guard is free again for the next tick
    _setLockProviderForTests(provider(true, ev));
    expect(await job("digest", async () => "next")).toBe("next");
  });
  it("without a database it falls back to the in-process guard and runs", async () => {
    _setLockProviderForTests(async () => null);
    expect(await job("backup", async () => "ran")).toBe("ran");
  });
});

describe("Microsoft token refresh (F72)", () => {
  it("one exchange: the user's tenant, else MS_TENANT_ID, else common — with a timeout", async () => {
    expect(msTokenUrl("contoso.onmicrosoft.com")).toBe("https://login.microsoftonline.com/contoso.onmicrosoft.com/oauth2/v2.0/token");
    expect(msTokenUrl(null)).toContain("/common/");
    vi.stubEnv("MS_TENANT_ID", "tenant-123");
    expect(msTokenUrl(null)).toContain("/tenant-123/");
    const seen: any[] = [];
    globalThis.fetch = vi.fn(async (url: any, init: any) => { seen.push([String(url), init]); return new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }), { status: 200 }); }) as any;
    const r = await exchangeMsRefreshToken({ refreshToken: "rt~x", clientId: "c", clientSecret: "s~y" });
    expect(r!.access_token).toBe("new");
    expect(seen[0][0]).toContain("/tenant-123/");
    expect(seen[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(String(seen[0][1].body)).toContain("client_secret=s~y"); // ~ kept literal
    expect(String(seen[0][1].body)).not.toContain("scope=");
  });
  it("the OneNote refresh uses it too (no hardcoded /common)", async () => {
    const fs = await import("fs");
    const src = fs.readFileSync(require("path").join(__dirname, "routers/onenote.ts"), "utf8");
    expect(src).not.toContain("login.microsoftonline.com/common/oauth2/v2.0/token");
    expect(src).toContain("exchangeMsRefreshToken");
    const sync = fs.readFileSync(require("path").join(__dirname, "routers/oauth-sync.ts"), "utf8");
    expect(sync).toContain("exchangeMsRefreshToken");
  });
});

describe("Nifty requests (F72)", () => {
  it("time out and page past 5,000 tasks", async () => {
    const offsets: number[] = [];
    let signals = 0;
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      if (init?.signal) signals++;
      const u = new URL(String(url));
      const off = Number(u.searchParams.get("offset"));
      const completed = u.searchParams.get("completed") === "true";
      if (!completed) offsets.push(off);
      const total = completed ? 0 : 6150;
      const n = Math.max(0, Math.min(100, total - off));
      return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => ({ id: `t${off + i}`, name: "T", project: "p", assignees: ["me"] }))), { status: 200 });
    }) as any;
    await pullNiftyProject({ projectId: "p", includeSubtasks: 1 } as any, { apiToken: "tok", accountExternalId: "me" } as any);
    expect(Math.max(...offsets)).toBe(6100); // used to stop at 4,900
    expect(signals).toBe((globalThis.fetch as any).mock.calls.length);
    expect(NIFTY_MAX_TASKS).toBeGreaterThan(5000);
  });
  it("log when the safety cap is hit", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn(async (url: any) => {
      const off = Number(new URL(String(url)).searchParams.get("offset"));
      return new Response(JSON.stringify(Array.from({ length: 100 }, (_, i) => ({ id: `x${off + i}` }))), { status: 200 });
    }) as any;
    await pullNiftyProject({ projectId: "big", includeSubtasks: 1 } as any, { apiToken: "tok" } as any);
    expect(spy.mock.calls.some((c) => String(c[0]).includes("safety cap"))).toBe(true);
    spy.mockRestore();
  }, 60_000);
});

describe("Nifty debug endpoints (F38)", () => {
  it("are gone from the router", () => {
    const procs = Object.keys((externalSourcesRouter as any)._def.procedures);
    for (const p of ["niftyDebugFindTask", "niftyProbeCompletionWrites", "niftyProbeCreate"]) expect(procs).not.toContain(p);
    expect(procs).toContain("niftySetTaskCompleted");
  });
});

describe("promoted subtasks (F96)", () => {
  it("carry the parent's fields in raw", () => {
    const parent = { id: "p1", priority: "High", due: "2026-11-20", projectId: "pr9", project: "Launch", clusterId: "c2", assignees: [4, 5], assigneeNames: ["Q", "R"], primaryAssigneeId: 4, assignedTo: "Q", subtasks: [] };
    const raw = promotedSubtaskRaw(parent, { title: "Child", done: true }, "s1", "p1", 0);
    expect(raw).toMatchObject({ id: "s1", title: "Child", status: "Done", done: true, parentTaskId: "p1", priority: "High", due: "2026-11-20", projectId: "pr9", project: "Launch", clusterId: "c2", assignees: [4, 5], primaryAssigneeId: 4, assignedTo: "Q" });
    expect(raw.assignees).not.toBe(parent.assignees); // copied
    expect(promotedSubtaskRaw({}, { title: "x" }, "s2", "p", 1)).not.toHaveProperty("priority");
  });
  it("the backfill writes them and stamps the parent with _subtasksPromotedAt", async () => {
    const parentRaw = { id: "p1", title: "P", priority: "High", due: "2026-11-20", projectId: "pr9", clusterId: "c2", assignees: [4], subtasks: [{ title: "A" }, { title: "B", done: true }] };
    const rows = [{ id: 1, userId: 3, taskId: "p1", parentTaskId: null, raw: JSON.stringify(parentRaw), priority: "High", due: "2026-11-20" }];
    const inserted: any[] = []; let parentSet: any = null;
    const db: any = {
      select: () => ({ from: () => ({ where: async () => rows }) }),
      insert: () => ({ values: async (v: any) => { inserted.push(v); } }),
      update: () => ({ set: (s: any) => ({ where: async () => { parentSet = s; } }) }),
    };
    const dbm: any = await import("./db");
    dbm.getDb.mockResolvedValueOnce(db);
    const r = await taskMigrationsRouter.createCaller({ user: { id: 3 } } as any).backfillNestedSubtasks({ dryRun: false });
    expect(r.subtasksPromoted).toBe(2);
    const child = JSON.parse(inserted[1].raw);
    expect(child).toMatchObject({ title: "B", done: true, priority: "High", due: "2026-11-20", projectId: "pr9", clusterId: "c2", assignees: [4], parentTaskId: "p1" });
    expect(typeof JSON.parse(parentSet.raw)._subtasksPromotedAt).toBe("string");
  });
});

describe("bank sync (F185, F196)", () => {
  const base = () => ({
    accounts: [{ id: "a1", bankId: "sf1" }], transactions: [] as any[],
    rules: [{ match: "netflix", catId: "subs" }, { match: "/^pos debit .*shell/", catId: "fuel" }],
    settings: { bankMap: { sf1: "a1" } },
  });
  it("keeps the bank description as rawDesc and matches rules on payee OR description", () => {
    const fin = base();
    mergeSimplefinPull(fin, [{ id: "sf1", balance: "1", transactions: [
      { id: "x1", posted: 1792000000, amount: "-15", payee: "NETFLIX.COM", description: "CHECKCARD 1101 NFLX*NETFLIX 866-579" },
      { id: "x2", posted: 1792000000, amount: "-40", payee: "Shell", description: "POS DEBIT 4471 SHELL OIL 5744" },
    ] }], "2026-10-14");
    const [a, b] = fin.transactions;
    expect(a).toMatchObject({ payee: "NETFLIX.COM", rawDesc: "CHECKCARD 1101 NFLX*NETFLIX 866-579", catId: "subs" });
    expect(b).toMatchObject({ payee: "Shell", rawDesc: "POS DEBIT 4471 SHELL OIL 5744", catId: "fuel" }); // matched on the description only
  });
  it("dates a transaction by the owner's clock, not UTC", () => {
    // 2026-10-15 02:30 UTC = 2026-10-14 22:30 in New York
    const posted = Date.UTC(2026, 9, 15, 2, 30) / 1000;
    const tx = { id: "late", posted, amount: "-5", description: "Late snack" };
    const utc = base(); mergeSimplefinPull(utc, [{ id: "sf1", transactions: [tx] }], "2026-10-15");
    const ny = base(); mergeSimplefinPull(ny, [{ id: "sf1", transactions: [tx] }], "2026-10-14", "America/New_York");
    expect(utc.transactions[0].date).toBe("2026-10-15");
    expect(ny.transactions[0].date).toBe("2026-10-14");
  });
});
