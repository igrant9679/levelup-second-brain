/**
 * Build -246: bills on any schedule. Runs the SHIPPED client functions
 * (app-part2.js "Bill schedules") and server/_core/billSchedule.ts on the
 * same bills and requires the same due dates, overdue state and reconcile
 * result; checks each schedule, the pre-246 monthly fields, and the
 * reconcile window.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { billOccurrences, billDue, billOverdue, billReconcile, billMonthly, billPaidThrough } from "./_core/billSchedule";
import { reconcileBills } from "./_core/simplefinAutoSync";
import { computeMoneyStats } from "./_core/financeEmail";

const P2 = fs.readFileSync(path.join(__dirname, "../client/public/js/app-part2.js"), "utf8").replace(/\r\n/g, "\n");
function grab(name: string): string {
  const i = P2.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing " + name);
  const rest = P2.slice(i + 1);
  const m = rest.match(/\n(?=(?:async )?function |const |let |var |\/\/|\/\*)/);
  return P2.slice(i, m ? i + 1 + (m.index as number) : P2.length);
}
const line = (prefix: string) => { const i = P2.indexOf(prefix); return P2.slice(i, P2.indexOf("\n", i)); };
const CLIENT = [
  "function _ymd(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}",
  "function _finCatXfer(t){return false;}",
  ...["const _FIN_BILL_FREQS=", "const _FIN_BILL_PER_MONTH=", "const _FIN_BILL_STEP_DAYS=", "const _FIN_BILL_STEP_MONTHS=", "const _FIN_BILL_PERIOD="].map(line),
  ...["_finBillFreq", "_finBillMonthly", "_fbDayNum", "_fbFromDay", "_fbDay1", "_fbDay2", "_fbAnchor", "_finBillOccurrences", "_finBillPaidThrough",
    "_finBillDue", "_finBillPaidRecently", "_finBillSetPaid", "_finBillWindow", "_finBillReconcileOne", "_finBillTxMatch"].map(grab),
].join("\n");
const c: any = { console };
vm.createContext(c);
vm.runInContext(CLIENT, c);

const BILLS: any[] = [
  { id: "rent", name: "Rent", amount: 1800, dueDay: 1 },                                     // pre-246 monthly, never paid
  { id: "power", name: "Power", amount: 90, dueDay: 20, lastPaidYM: "2026-10" },               // pre-246 monthly, paid this month
  { id: "phone", name: "Phone", amount: 60, dueDay: 28, lastPaidYM: "2026-09" },               // paid last month, this month's still ahead
  { id: "gym", name: "Gym", amount: 25, freq: "weekly", startDate: "2026-10-05", dueDay: 5 },
  { id: "sitter", name: "Sitter", amount: 200, freq: "biweekly", startDate: "2026-10-09", dueDay: 9, paidThrough: "2026-10-23" },
  { id: "hoa", name: "HOA", amount: 300, freq: "semimonthly", dueDay: 1, dueDay2: 15, paidThrough: "2026-10-01" },
  { id: "water", name: "Water", amount: 150, freq: "quarterly", startDate: "2026-11-10", dueDay: 10, paidThrough: "2026-08-10" },
  { id: "car", name: "Car insurance", amount: 600, freq: "semiannual", startDate: "2026-04-15", dueDay: 15, paidThrough: "2026-04-15" },
  { id: "amazon", name: "Amazon Prime", amount: 139, freq: "yearly", startDate: "2027-02-03", dueDay: 3 },
];
const TODAY = "2026-10-27";
const copy = (x: any) => JSON.parse(JSON.stringify(x));

describe("bill schedules: client == server", () => {
  it("occurrences match for every schedule", () => {
    for (const b of BILLS) expect(c._finBillOccurrences(b, "2026-09-01", "2027-03-31")).toEqual(billOccurrences(b, "2026-09-01", "2027-03-31"));
  });
  it("due dates and overdue state match, and are the ones expected", () => {
    const want: Record<string, string> = {
      rent: "2026-10-01",   // never paid: this month's, overdue (as before -246)
      power: "2026-11-20",  // paid this month → next month
      phone: "2026-10-28",  // tomorrow
      gym: "2026-10-26",    // weekly, never paid: the last week's, overdue
      sitter: "2026-11-06", // every 2 weeks after the 23rd
      hoa: "2026-10-15",    // second date this month, overdue
      water: "2026-11-10",  // quarterly: Aug → Nov
      car: "2026-10-15",    // every 6 months: Apr → Oct, overdue
      amazon: "2027-02-03", // yearly, ahead
    };
    for (const b of BILLS) {
      expect([b.id, c._finBillDue(b, TODAY)]).toEqual([b.id, want[b.id]]);
      expect(billDue(b, TODAY)).toBe(want[b.id]);
      expect(billOverdue(b, TODAY)).toBe(want[b.id] < TODAY);
    }
  });
  it("monthly equivalents", () => {
    const m = (id: string) => billMonthly(BILLS.find((b) => b.id === id));
    expect(m("gym")).toBeCloseTo(25 * 52 / 12);
    expect(m("hoa")).toBe(600);
    expect(m("amazon")).toBeCloseTo(139 / 12);
    expect(c._finBillMonthly(BILLS[3])).toBeCloseTo(m("gym"));
  });
  it("pre-246 lastPaidYM still reads as the date paid", () => {
    expect(billPaidThrough({ dueDay: 20, lastPaidYM: "2026-10" })).toBe("2026-10-20");
    expect(c._finBillPaidThrough({ dueDay: 20, lastPaidYM: "2026-10" })).toBe("2026-10-20");
  });
});

describe("reconcile", () => {
  const txs = [
    { id: "t1", date: "2026-10-24", payee: "GOLDS GYM 0042", amount: -25 },
    { id: "t2", date: "2026-09-30", payee: "LANDLORD LLC RENT", amount: -1800 },
    { id: "t3", date: "2026-10-12", payee: "CITY WATER", amount: -150 },
  ];
  const gym = { id: "gym", name: "Gyms", matchText: "golds gym", amount: 25, freq: "weekly", startDate: "2026-10-05", dueDay: 5 };
  it("a charge a few days before the due date pays it, on both sides", () => {
    const a = copy(gym), b = copy(gym), ta = copy(txs), tb = copy(txs);
    expect(c._finBillReconcileOne(a, ta, "2026-10-27")?.id).toBe("t1");
    const match = (bill: any, t: any) => vm.runInContext("_finBillTxMatch", c)(bill, t);
    expect(billReconcile(b, tb, match, "2026-10-27")?.id).toBe("t1");
    expect(a.paidThrough).toBe("2026-10-26");
    expect(b.paidThrough).toBe("2026-10-26");
    expect(a.lastPaidYM).toBe("2026-10");
    expect(c._finBillDue(a, "2026-10-27")).toBe("2026-11-02");
  });
  it("rent paid a day early (end of last month) counts for the 1st", () => {
    const fin = { bills: [{ id: "rent", name: "Rent", matchText: "landlord", amount: 1800, dueDay: 1 }], transactions: copy(txs), categories: [] };
    expect(reconcileBills(fin, "2026-10-27")).toBe(1);
    expect(fin.bills[0]).toMatchObject({ paidThrough: "2026-10-01", lastPaidYM: "2026-10" });
    expect(fin.transactions.find((t: any) => t.id === "t2")).toMatchObject({ recurringBillId: "rent" });
  });
  it("one late payment pays one due date, not the next one too (-258), on both sides", () => {
    // monthly on the 15th, paid through Sep 15; ONE charge on Nov 8 (the October bill paid late)
    const phone = { id: "phone", name: "Phone", matchText: "verizon", amount: 90, dueDay: 15, paidThrough: "2026-09-15" };
    const late = [{ id: "v1", date: "2026-11-08", payee: "VERIZON WIRELESS", amount: -90 }];
    const match = (bill: any, t: any) => vm.runInContext("_finBillTxMatch", c)(bill, t);
    for (const side of ["client", "server"]) {
      const b = copy(phone), t = copy(late);
      const run = (today: string) => side === "client" ? c._finBillReconcileOne(b, t, today) : billReconcile(b, t, match, today);
      expect(run("2026-11-08")?.id).toBe("v1");        // pays Oct 15
      expect(b.paidThrough).toBe("2026-10-15");
      expect(t[0].billPaidDue).toBe("2026-10-15");
      expect(run("2026-11-09")).toBeNull();            // the same charge must not pay Nov 15
      expect(b.paidThrough).toBe("2026-10-15");
    }
  });
  it("a charge too early for the next due date does not pay it", () => {
    const water = { id: "water", name: "City Water", amount: 150, freq: "quarterly", startDate: "2026-11-10", dueDay: 10, paidThrough: "2026-08-10" };
    expect(c._finBillReconcileOne(copy(water), copy(txs), TODAY)).toBeNull();
  });
});

describe("the email's bills list uses the schedules", () => {
  it("weekly and twice-a-month bills appear when due, overdue ones stay", () => {
    const f: any = { accounts: [], transactions: [], categories: [], budgets: {}, budgetOverrides: {}, incomeStreams: [], networthHistory: [], bills: copy(BILLS) };
    const s = computeMoneyStats(f, new Date(2026, 9, 27, 9, 0));
    const names = s.bills7.map((b) => b.name + (b.overdue ? " (overdue)" : ""));
    expect(names).toContain("Gym (overdue)");
    expect(names).toContain("HOA (overdue)");
    expect(names).toContain("Rent (overdue)");
    expect(names).toContain("Phone");
    expect(names).not.toContain("Amazon Prime");
  });
});
