/**
 * Build -266 (Audit 2 Phase 5): the owner's own Money save is revision-checked
 * like a co-editor's. A tab holding an older budget (another device saved, a
 * co-editor saved, the bank sync added transactions) no longer overwrites it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let row: any = null;
const fakeDb: any = {
  select: (cols: any) => ({ from: () => ({ where: () => ({ limit: async () => (row ? [Object.fromEntries(Object.keys(cols).map((k) => [k, row[cols[k].name]]))] : []) }) }) }),
  update: () => ({ set: (s: any) => ({ where: async () => { Object.assign(row, s); } }) }),
  insert: () => ({ values: (v: any) => ({ onDuplicateKeyUpdate: async ({ set }: any) => { if (row) Object.assign(row, set); else row = { ...v }; } }) }),
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), adminListAllUsers: vi.fn(async () => []) }));
vi.mock("./routers/appData", async (orig) => ({ ...(await orig<any>()), isOwnerCtxUser: vi.fn(async (u: any) => u.id === 1) }));

import { appDataRouter } from "./routers/appData";

const OWNER = { id: 1, role: "admin" };
const budget = (rev: number, extra: any = {}) => ({ _rev: rev, accounts: [], transactions: [{ id: "t1", amount: -5 }], ...extra });
const own = () => appDataRouter.createCaller({ user: OWNER } as any);
const stored = () => JSON.parse(row.finance);

beforeEach(() => { row = { userId: 1, finance: JSON.stringify(budget(7, { transactions: [{ id: "t1" }, { id: "bank-new" }] })) }; });

describe("the owner's Money save", () => {
  it("from a stale copy is refused, and the current budget comes back", async () => {
    const r: any = await own().save({ finance: JSON.stringify(budget(6, { transactions: [{ id: "t1" }] })), financeBaseRev: 6 });
    expect(r.financeConflict.rev).toBe(7);
    expect(r.financeConflict.finance.transactions.map((t: any) => t.id)).toEqual(["t1", "bank-new"]);
    expect(stored().transactions.length).toBe(2);          // the bank sync's transaction survives
    expect(stored()._rev).toBe(7);
  });
  it("from the current copy is saved and the new revision comes back", async () => {
    const r: any = await own().save({ finance: JSON.stringify(budget(7, { transactions: [] })), financeBaseRev: 7 });
    expect(r.financeConflict).toBeNull();
    expect(r.financeRev).toBe(8);
    expect(stored()).toMatchObject({ _rev: 8, transactions: [] });
    // the next save from that device carries 8 and goes through
    const r2: any = await own().save({ finance: JSON.stringify({ ...stored(), note: "x" }), financeBaseRev: r.financeRev });
    expect(r2.financeRev).toBe(9);
  });
  it("other lists in the same save are still written when Money is refused", async () => {
    const r: any = await own().save({ finance: JSON.stringify(budget(1)), financeBaseRev: 1, goals: JSON.stringify([{ id: 1, name: "Run" }]) });
    expect(r.financeConflict.rev).toBe(7);
    expect(JSON.parse(row.goals)).toEqual([{ id: 1, name: "Run" }]);
    expect(stored()._rev).toBe(7);
  });
  it("a client that sends no revision (pre-266) saves as before", async () => {
    const r: any = await own().save({ finance: JSON.stringify(budget(0)) });
    expect(r.financeConflict).toBeNull();
    expect(stored()._rev).toBe(8);
  });
});
