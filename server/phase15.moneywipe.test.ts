/**
 * Build -276: a Money save can't wipe a budget that has data.
 * 2026-11-07: a device that had never loaded the server's budget ran the daily
 * Money agents on an empty default budget and saved it. It sent no revision,
 * and a save without one was accepted, so 19 accounts and ~1,500 transactions
 * were replaced by an empty budget (recovered from the nightly backup).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

let row: any = null;
const fakeDb: any = {
  select: (cols: any) => ({ from: () => ({ where: () => ({ limit: async () => (row ? [Object.fromEntries(Object.keys(cols).map((k) => [k, row[cols[k].name]]))] : []) }) }) }),
  update: () => ({ set: (s: any) => ({ where: async () => { Object.assign(row, s); } }) }),
  insert: () => ({ values: (v: any) => ({ onDuplicateKeyUpdate: async ({ set }: any) => { if (row) Object.assign(row, set); else row = { ...v }; } }) }),
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), adminListAllUsers: vi.fn(async () => []) }));
vi.mock("./routers/appData", async (orig) => ({ ...(await orig<any>()), isOwnerCtxUser: vi.fn(async (u: any) => u.id === 1) }));

import { appDataRouter, financeWipeVerdict } from "./routers/appData";

const own = () => appDataRouter.createCaller({ user: { id: 1, role: "admin" } } as any);
const stored = () => JSON.parse(row.finance);
const full = (rev: number) => ({
  _rev: rev,
  accounts: Array.from({ length: 19 }, (_, i) => ({ id: "a" + i, bankId: "b" + i })),
  transactions: Array.from({ length: 30 }, (_, i) => ({ id: "t" + i, amount: -i })),
  bills: [{ id: "bill1" }], rules: [{ id: "r1" }], categories: [{ id: "c" }], settings: { currency: "$" },
});
// What the client's _finDefault() + an agent run produced on Nov 7.
const emptyDefault = () => ({ accounts: [], transactions: [], categories: [{ id: "c" }], budgets: {}, bills: [], goals: [], settings: { currency: "$", agentLastRun: "2026-11-07T19:54:04.742Z" } });

beforeEach(() => { row = { userId: 1, finance: JSON.stringify(full(40)) }; });

describe("Money wipe guard (-276)", () => {
  it("the Nov 7 save - an empty default budget with no revision - is refused and the real budget comes back", async () => {
    const r: any = await own().save({ finance: JSON.stringify(emptyDefault()), financeBaseRev: null });
    expect(r.financeConflict.reason).toBe("unsynced");
    expect(r.financeConflict.finance.accounts.length).toBe(19);
    expect(stored().accounts.length).toBe(19);
    expect(stored()._rev).toBe(40);
  });
  it("a save with no revision at all (old client) can't replace a budget with data either", async () => {
    const r: any = await own().save({ finance: JSON.stringify({ ...full(0), note: "x" }) });
    expect(r.financeConflict.reason).toBe("unsynced");
    expect(stored().note).toBeUndefined();
  });
  it("with no revision, an EMPTY stored budget (new user) is still saved", async () => {
    row = { userId: 1, finance: JSON.stringify(emptyDefault()) };
    const r: any = await own().save({ finance: JSON.stringify({ ...emptyDefault(), accounts: [{ id: "first" }] }), financeBaseRev: null });
    expect(r.financeConflict).toBeNull();
    expect(stored().accounts.map((a: any) => a.id)).toEqual(["first"]);
    row = null; // no row at all
    const r2: any = await own().save({ finance: JSON.stringify({ accounts: [{ id: "x" }] }), financeBaseRev: null });
    expect(r2.financeConflict).toBeNull();
  });
  it("a current-revision save that empties accounts and transactions is refused", async () => {
    const r: any = await own().save({ finance: JSON.stringify({ ...emptyDefault(), _rev: 40 }), financeBaseRev: 40 });
    expect(r.financeConflict.reason).toBe("empty");
    expect(stored().transactions.length).toBe(30);
  });
  it("...unless it is a confirmed Replace import (financeAllowEmpty)", async () => {
    const r: any = await own().save({ finance: JSON.stringify({ ...emptyDefault(), _rev: 40 }), financeBaseRev: 40, financeAllowEmpty: true });
    expect(r.financeConflict).toBeNull();
    expect(r.financeRev).toBe(41);
    expect(stored().accounts.length).toBe(0);
  });
  it("ordinary edits still save: deleting one account, editing a bill", async () => {
    const f = full(40); f.accounts.pop(); f.bills[0] = { id: "bill1", amount: 9 } as any;
    const r: any = await own().save({ finance: JSON.stringify(f), financeBaseRev: 40 });
    expect(r.financeConflict).toBeNull();
    expect(stored().accounts.length).toBe(18);
  });
  it("verdict rules", () => {
    expect(financeWipeVerdict(null, emptyDefault(), null)).toBeNull();
    expect(financeWipeVerdict({ accounts: [], transactions: [], categories: [1, 2] }, {}, null)).toBeNull(); // categories alone aren't data
    expect(financeWipeVerdict({ bills: [{}] }, {}, null)).toBe("unsynced");
    expect(financeWipeVerdict({ accounts: [1, 2], transactions: [1] }, { accounts: [] }, 3)).toBeNull(); // below 5: small budgets can be cleared
    expect(financeWipeVerdict({ accounts: [1, 2, 3], transactions: [1, 2] }, { accounts: [], transactions: [] }, 3)).toBe("empty");
    expect(financeWipeVerdict({ accounts: [1, 2, 3], transactions: [1, 2] }, { accounts: [1], transactions: [] }, 3)).toBeNull();
  });
});

describe("shipped client (-276)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../client/public/js/app-part2.js"), "utf8");
  const fn = (name: string) => {
    const i = src.indexOf("function " + name + "(");
    let d = 0, j = src.indexOf("{", i);
    for (let k = j; k < src.length; k++) { if (src[k] === "{") d++; else if (src[k] === "}" && --d === 0) return src.slice(i, k + 1); }
    throw new Error(name);
  };
  it("the daily Money agents don't run before the server's budget has loaded", () => {
    const timers: Function[] = [];
    let ran = 0;
    const ctx: any = { window: {}, D: { finance: {} }, _finShared: null, setTimeout: (f: Function) => timers.push(f),
      ensureFin: () => ({ settings: {} }), _pd: (v: any) => new Date(v), _finAgentsRunAll: () => { ran++; } };
    vm.createContext(ctx);
    vm.runInContext(fn("_finAgentsAutoRun"), ctx);
    vm.runInContext("_finAgentsAutoRun()", ctx);
    expect(ran).toBe(0);
    expect(timers.length).toBe(1);           // tries again later
    ctx.window._luFinLoaded = true;
    timers.shift()!();
    expect(ran).toBe(1);
  });
  it("the push sends financeAllowEmpty only once, after a confirmed replace", () => {
    expect(src).toMatch(/const allowEmpty=window\._finAllowEmptyOnce===true; window\._finAllowEmptyOnce=false;/);
    expect(fn("finImport")).toMatch(/window\._finAllowEmptyOnce=true;/);
    expect(fn("finImport")).toMatch(/D\.finance\._rev=cur\._rev/);
  });
});
