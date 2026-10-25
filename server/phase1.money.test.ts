/**
 * Phase 1 Money guards (build -226):
 *  - a shared co-editor's write from a stale copy is refused (revision check);
 *  - the owner's own saves bump the revision;
 *  - bank transactions the user deleted are not re-imported by a sync.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { userAppData } from "../drizzle/schema";
import { mergeSimplefinPull } from "./_core/simplefinAutoSync";

let row: any = null;
const fakeDb: any = {
  select: (cols: any) => ({ from: () => ({ where: () => ({ limit: async () => (row ? [Object.fromEntries(Object.keys(cols).map((k) => [k, row[cols[k].name]]))] : []) }) }) }),
  update: () => ({ set: (s: any) => ({ where: async () => { Object.assign(row, s); } }) }),
  insert: () => ({ values: (v: any) => ({ onDuplicateKeyUpdate: async ({ set }: any) => { if (row) Object.assign(row, set); else row = { ...v }; } }) }),
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), adminListAllUsers: vi.fn(async () => []) }));
vi.mock("./routers/appData", async (orig) => ({ ...(await orig<any>()), isOwnerCtxUser: vi.fn(async (u: any) => u.id === 1) }));

import { appDataRouter } from "./routers/appData";

const OWNER = { id: 1, role: "admin" }, EDITOR = { id: 2, role: "admin" };
const budget = (rev: number, extra: any = {}) => ({ _rev: rev, accounts: [], transactions: [{ id: "t1", amount: -5 }], share: { assignees: [2], shareMode: "edit" }, ...extra });

beforeEach(() => { row = { userId: 1, finance: JSON.stringify(budget(3)) }; });

describe("shared budget writes", () => {
  it("are refused from a stale copy and the current budget comes back", async () => {
    const ed = appDataRouter.createCaller({ user: EDITOR } as any);
    const r: any = await ed.updateSharedFinance({ ownerUserId: 1, finance: JSON.stringify(budget(2, { transactions: [] })), baseRev: 2 });
    expect(r).toMatchObject({ ok: false, conflict: true });
    expect(r.finance.transactions.length).toBe(1);
    expect(JSON.parse(row.finance).transactions.length).toBe(1); // nothing overwritten
  });
  it("succeed from the current copy and bump the revision", async () => {
    const ed = appDataRouter.createCaller({ user: EDITOR } as any);
    const r: any = await ed.updateSharedFinance({ ownerUserId: 1, finance: JSON.stringify(budget(3, { transactions: [] })), baseRev: 3 });
    expect(r).toMatchObject({ ok: true, rev: 4 });
    expect(JSON.parse(row.finance)._rev).toBe(4);
  });
  it("the owner's own saves bump the revision too", async () => {
    const own = appDataRouter.createCaller({ user: OWNER } as any);
    await own.save({ finance: JSON.stringify(budget(0)) }); // owner's tab had an old _rev
    expect(JSON.parse(row.finance)._rev).toBe(4);
  });
});

describe("bank sync", () => {
  it("does not re-import a transaction the user deleted", () => {
    const fin = { accounts: [{ id: "a1", bankId: "sf1" }], transactions: [], settings: { bankMap: { sf1: "a1" }, deletedBankTxIds: ["x2"] } };
    const sf = [{ id: "sf1", balance: "10", transactions: [{ id: "x1", posted: 1792000000, amount: "-3", description: "Cafe" }, { id: "x2", posted: 1792000000, amount: "-9", description: "Duplicate" }] }];
    const r = mergeSimplefinPull(fin, sf, "2026-10-25");
    expect(r.added).toBe(1);
    expect(fin.transactions.map((t: any) => t.bankTxId)).toEqual(["x1"]);
  });
});
