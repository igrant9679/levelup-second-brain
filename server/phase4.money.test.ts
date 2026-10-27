/**
 * Phase 4 gate (build -229): one fixture month gives the SAME totals on the
 * Money page (the shipped client code in app-part2.js), in the emails
 * (computeMoneyStats) and for the coach (moneyCoachLines).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { computeMoneyStats, moneyCoachLines, parseFinance } from "./_core/financeEmail";
import { safeRuleRegex } from "./_core/simplefinAutoSync";

const SRC = fs.readFileSync(path.join(__dirname, "../client/public/js/app-part2.js"), "utf8").replace(/\r\n/g, "\n");
function grab(name: string): string {
  const i = SRC.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing " + name);
  // up to the next top-level statement (brace counting trips on regexes)
  const rest = SRC.slice(i + 1);
  const m = rest.match(/\n(?=(?:async )?function |const |let |var |\/\/|\/\*)/);
  return SRC.slice(i, m ? i + 1 + (m.index as number) : SRC.length);
}
function grabLine(prefix: string): string {
  const i = SRC.indexOf(prefix);
  if (i < 0) throw new Error("missing " + prefix);
  return SRC.slice(i, SRC.indexOf("\n", i));
}
const CLIENT = [
  grabLine("const _FIN_PAY_RE="), grabLine("let _finClassCache="), grabLine("const _finReCache="),
  // -246: bill due dates come from the shared schedule helpers.
  ...["const _FIN_BILL_PER_MONTH=", "const _FIN_BILL_STEP_DAYS=", "const _FIN_BILL_STEP_MONTHS=", "const _FIN_BILL_PERIOD="].map(grabLine),
  ...["_finYM", "_finCat", "_finTxMonth", "_finCatKind", "_finClassify", "_finClassMap", "_finTxClass", "_finIsXfer", "_finCatXfer",
    "_finTotalsFor", "_finTotals", "_finIncome", "_finSpent", "_finSpentByCat", "_finBudgetFor", "_finBudgetIds", "_finBudgetTotal",
    "_finStreamExpected", "_finBillFreq", "_fbDayNum", "_fbFromDay", "_fbDay1", "_fbDay2", "_fbAnchor", "_finBillOccurrences",
    "_finBillPaidThrough", "_finBillDue", "_finBillNextDue", "_finBillOverdue", "_finSafeRe", "_finRuleTest"].map(grab),
].join("\n");

// ── the fixture month: October 2026, "today" = 20 Oct ──────────────────────
const fixture = {
  accounts: [
    { id: "chk", name: "Checking", type: "checking", balance: 2500, bankId: "sf1" },
    { id: "sav", name: "Savings", type: "savings", balance: 5000 },
    { id: "cc", name: "Capital One Quicksilver", type: "credit", balance: 800, apr: 24.9 },
    { id: "car", name: "Car loan", type: "loan", balance: 9000 },
  ],
  categories: [
    { id: "salary", name: "Salary", kind: "income" }, { id: "inc-other", name: "Other income", kind: "income" },
    { id: "groceries", name: "Groceries", kind: "expense" }, { id: "shopping", name: "Shopping", kind: "expense" },
    { id: "dining", name: "Dining", kind: "expense" }, { id: "housing", name: "Housing", kind: "expense" },
    { id: "misc-other", name: "Miscellaneous", kind: "expense" }, { id: "xfer-transfer", name: "Transfer", kind: "transfer" },
  ],
  transactions: [
    { id: "1", date: "2026-10-01", payee: "ACME PAYROLL", catId: "salary", accountId: "chk", amount: 4000 },
    { id: "2", date: "2026-10-03", payee: "WHOLE FOODS", catId: "groceries", accountId: "cc", amount: -150 },
    { id: "3", date: "2026-10-04", payee: "AMAZON", catId: "shopping", accountId: "cc", amount: -300 },
    { id: "4", date: "2026-10-09", payee: "AMAZON", catId: "shopping", accountId: "cc", amount: 120 },            // refund
    { id: "5", date: "2026-10-10", payee: "PAYMENT - THANK YOU", catId: "inc-other", accountId: "cc", amount: 450 }, // card side
    { id: "6", date: "2026-10-12", payee: "CAPITAL ONE ONLINE PMT", catId: "misc-other", accountId: "chk", amount: -450 }, // checking side
    { id: "7", date: "2026-10-01", payee: "RENT", catId: "housing", accountId: "chk", amount: -1500 },
    { id: "8", date: "2026-10-14", payee: "STATEMENT CREDIT", catId: "inc-other", accountId: "cc", amount: 25 },
    { id: "9", date: "2026-10-15", payee: "TRANSFER TO SAVINGS", catId: "xfer-transfer", accountId: "chk", amount: -1000 },
    { id: "10", date: "2026-10-15", payee: "TRANSFER FROM CHECKING", catId: "xfer-transfer", accountId: "sav", amount: 1000 },
    { id: "11", date: "2026-10-16", payee: "LIKEWISE CAFE", catId: "dining", accountId: "chk", amount: -60 },
    { id: "12", date: "2026-09-28", payee: "WHOLE FOODS", catId: "groceries", accountId: "cc", amount: -999 },   // other month
    { id: "13", date: "2026-10-17", payee: "ATM WITHDRAWAL", catId: "misc-other", accountId: "chk", amount: -200 },
    { id: "14", date: "2026-10-18", payee: "VENMO", catId: "inc-other", accountId: "chk", amount: 50 },
  ],
  budgets: { groceries: 400, shopping: 150, dining: 200, housing: 1500, "misc-other": 100 },
  budgetOverrides: {},
  incomeStreams: [
    { id: "s1", name: "Salary", expected: 4000 },
    { id: "s2", name: "Side gig", expected: 500, perMonth: { "2026-09": 500 } }, // nothing scheduled in October
  ],
  bills: [
    { id: "b1", name: "Rent", amount: 1500, dueDay: 1, lastPaidYM: "2026-09", active: true },
    { id: "b2", name: "Phone", amount: 80, dueDay: 25, active: true },
    { id: "b3", name: "Capital One", amount: 450, dueDay: 15, lastPaidYM: "2026-10", active: true },
  ],
  networthHistory: [],
};
const NOW = new Date(2026, 9, 20, 12, 0, 0); // local noon, 20 Oct

let client: any;
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const data = JSON.parse(JSON.stringify(fixture));
  const ctx: any = { Date, Map, Set, Math, JSON, String, Number, Object, Array, RegExp, isNaN, isFinite, parseFloat,
    setTimeout: () => 0, _finData: () => data, _finMonth: "2026-10",
    _ymd: (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    _pd: (s: string) => { const [y, m, dd] = String(s).split("-").map(Number); return new Date(y, m - 1, dd); } };
  vm.createContext(ctx);
  vm.runInContext(CLIENT + "\n;this.__api={totals:_finTotals,income:_finIncome,spent:_finSpent,byCat:_finSpentByCat,streamExp:_finStreamExpected,nextDue:_finBillNextDue,overdue:_finBillOverdue,isXfer:_finIsXfer,safeRe:_finSafeRe,rule:_finRuleTest};", ctx);
  client = ctx.__api;
  client.data = data;
});
afterAll(() => { vi.useRealTimers(); });

describe("one fixture month, same totals everywhere", () => {
  const ym = "2026-10";
  it("the app counts the refund, the card payment and the transfers correctly", () => {
    expect(client.income(ym)).toBe(4050);              // salary + Venmo; not the refund, card credits or savings transfer
    expect(client.spent(ym)).toBe(2065);               // 150 + (300-120) + 1500 + 60 + (200-25)
    expect(client.byCat(ym)).toEqual({ groceries: 150, shopping: 180, housing: 1500, dining: 60, "misc-other": 175 });
    const tx = (id: string) => client.data.transactions.find((t: any) => t.id === id);
    expect(client.isXfer(tx("5"))).toBe(true);         // card side: payment credit
    expect(client.isXfer(tx("6"))).toBe(true);         // checking side, paired two days later
    expect(client.isXfer(tx("13"))).toBe(false);       // ATM: no matching card credit
  });
  it("the email (computeMoneyStats) agrees with the app", () => {
    const f = parseFinance(JSON.stringify(fixture))!;
    const s = computeMoneyStats(f, NOW);
    expect(s.ym).toBe(ym);
    expect(s.income).toBe(client.income(ym));
    expect(s.spent).toBe(client.spent(ym));
    const streams = fixture.incomeStreams.reduce((a, st) => a + client.streamExp(st, ym), 0);
    expect(streams).toBe(4000);
    expect(s.incomeExpected).toBe(streams);            // the per-month stream expects nothing in October in both
    expect(s.overCats.map(c => c.name)).toEqual(["Miscellaneous", "Shopping"]);
  });
  it("the coach reads the same numbers", () => {
    const f = parseFinance(JSON.stringify(fixture))!;
    const lines = moneyCoachLines(f, NOW).join("\n");
    expect(lines).toContain("Spent $2,065");
    expect(lines).toContain("Income $4,050 of $4,000 expected");
    expect(lines).toContain("Shopping $180/$150 OVER");
    expect(lines).not.toContain("$999");
  });
  it("an unpaid bill whose day passed stays overdue in the app and the email", () => {
    const rent = fixture.bills[0];
    expect(client.overdue(rent)).toBe(true);
    expect(client.nextDue(rent).getDate()).toBe(1);
    expect(client.nextDue(rent).getMonth()).toBe(9);
    expect(client.nextDue(fixture.bills[2]).getMonth()).toBe(10); // paid this month → November
    const s = computeMoneyStats(parseFinance(JSON.stringify(fixture))!, NOW);
    const r = s.bills7.find(b => b.name === "Rent")!;
    expect(r.overdue).toBe(true);
    expect(s.bills7.find(b => b.name === "Phone")).toBeTruthy();
  });
});

describe("rules", () => {
  it("the anchored seed rule no longer catches Likewise", () => {
    expect(client.rule({ match: "/\\bwise\\b/" }, "likewise cafe")).toBe(false);
    expect(client.rule({ match: "/\\bwise\\b/" }, "wise transfer 1234")).toBe(true);
    expect(client.rule({ match: "wise" }, "likewise cafe")).toBe(true); // a plain rule still means "contains"
  });
  it("unsafe patterns never run, in the app and on the server", () => {
    for (const p of ["(a+)+$", "(\\w*)*x", "(x+x+)+y"]) {
      expect(client.safeRe(p)).toBeNull();
      expect(safeRuleRegex(p)).toBeNull();
    }
    for (const p of ["\\bwise\\b", "^check\\s*#?\\s*\\d+", "amazon|amzn"]) {
      expect(client.safeRe(p)).not.toBeNull();
      expect(safeRuleRegex(p)).not.toBeNull();
    }
    expect(safeRuleRegex("x".repeat(201))).toBeNull();
    expect(safeRuleRegex("(unclosed")).toBeNull();
  });
});
