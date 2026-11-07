/**
 * Build -275 — Audit 1 medium/low findings fixed in the client bundles.
 *
 * Pulls the SHIPPED top-level functions out of the bundles with acorn (so the
 * test runs exactly the code users get) and drives them in a vm with a small
 * fake D.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";
import * as acorn from "acorn";

const JS = resolve(__dirname, "../client/public/js");
const cache: Record<string, { src: string; fns: Map<string, string> }> = {};
function bundle(file: string) {
  if (cache[file]) return cache[file];
  const src = readFileSync(resolve(JS, file), "utf8");
  const ast: any = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script" });
  const fns = new Map<string, string>();
  for (const n of ast.body) {
    if (n.type === "FunctionDeclaration" && n.id) fns.set(n.id.name, src.slice(n.start, n.end));
    if (n.type === "VariableDeclaration") for (const d of n.declarations) if (d.id && d.id.name) fns.set(d.id.name, src.slice(n.start, n.end));
  }
  return (cache[file] = { src, fns });
}
function load(ctx: any, parts: [string, string[]][]) {
  vm.createContext(ctx);
  let code = "";
  for (const [file, names] of parts) {
    const b = bundle(file);
    for (const nm of names) {
      const s = b.fns.get(nm);
      if (!s) throw new Error(`${nm} not found in ${file}`);
      code += s + "\n";
    }
  }
  const all = parts.flatMap(([, n]) => n).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  code += all.map((n) => `try{this.${n}=${n};}catch(_){}`).join("\n");
  vm.runInContext(code, ctx);
  return ctx;
}
const ymd = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

describe("F41/F42 escaping and CSV", () => {
  const C = load({}, [["app-1-core.js", ["esc", "_csvSafe", "_csvCell", "_luSafeHref"]]]);
  it("esc keeps 0, drops null/false, escapes single quotes", () => {
    expect(C.esc(0)).toBe("0");
    expect(C.esc(null)).toBe("");
    expect(C.esc(false)).toBe("");
    expect(C.esc(`a'b"<c>&`)).toBe("a&#39;b&quot;&lt;c&gt;&amp;");
  });
  it("CSV cells that a spreadsheet would run as a formula get an apostrophe", () => {
    expect(C._csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(C._csvCell("+cmd")).toBe("'+cmd");
    expect(C._csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(C._csvCell("-12.5")).toBe("-12.5");
    expect(C._csvCell("plain, text")).toBe('"plain, text"');
  });
  it("hrefs: web/mail only", () => {
    expect(C._luSafeHref("javascript:alert(1)")).toBe("#");
    expect(C._luSafeHref("https://x.test/?a=1&b=2")).toBe("https://x.test/?a=1&amp;b=2");
    expect(C._luSafeHref("mailto:a@b.c", true)).toBe("#");
  });
});

describe("F145 sheet formulas: TRUE/FALSE, & and percent", () => {
  const src = bundle("app-part2.js").src;
  const a = src.indexOf("// ─── Formula engine"), b = src.indexOf("// ─── Display / formatting", a);
  const ctx: any = { esc: (s: any) => String(s) };
  vm.createContext(ctx);
  vm.runInContext(src.slice(a, b) + "\n;this._shEval=_shEval;", ctx);
  const sheet = { id: 1, columns: [{ id: 1, name: "A" }, { id: 2, name: "B" }], rows: [{ id: 1, cells: { 1: "Ann", 2: 4 } }] };
  const ev = (f: string) => ctx._shEval(sheet, f, 0);
  it("evaluates the new syntax like a spreadsheet", () => {
    expect(ev("=A1&\" has \"&B1")).toBe("Ann has 4");
    expect(ev("=B1+1&\"x\"")).toBe("5x");
    expect(ev("=50%*B1")).toBe(2);
    expect(ev("=IF(TRUE,1,2)")).toBe(1);
    expect(ev("=B1>3")).toBe(true);
  });
  it("still reports bad formulas", () => {
    expect(ev("=(1+2")).toBe("#ERR");
  });
});

describe("F132 journal streak = consecutive days", () => {
  const today = new Date(); today.setHours(12);
  const day = (n: number) => { const d = new Date(today); d.setDate(d.getDate() - n); return ymd(d); };
  const ctx: any = { D: { journal: [] }, _ymd: ymd, _dayOf: (v: string) => String(v).slice(0, 10) };
  load(ctx, [["app-part2.js", ["calcJournalStreak", "_journalDayOf"]]]);
  it("counts days, not entries, and tolerates a gap only for today", () => {
    ctx.D.journal = [{ date: day(0) }, { date: day(0) }, { date: day(1) }, { date: day(2) }, { date: day(4) }];
    expect(ctx.calcJournalStreak()).toBe(3);
    ctx.D.journal = [{ date: day(1) }, { date: day(2) }];
    expect(ctx.calcJournalStreak()).toBe(2);
    ctx.D.journal = [{ date: day(2) }];
    expect(ctx.calcJournalStreak()).toBe(0);
    ctx.D.journal = Array.from({ length: 40 }, () => ({ date: day(9) }));
    expect(ctx.calcJournalStreak()).toBe(0);
  });
});

describe("F190 one bill per debt account", () => {
  const ctx: any = {};
  load(ctx, [["app-part2.js", ["_finDebtBill"]]]);
  const f = {
    bills: [{ id: "b1", name: "Capital One Venture" }, { id: "b2", name: "Chase" }],
    accounts: [{ id: "a1", name: "Capital One Venture", type: "credit" }, { id: "a2", name: "Capital One Quicksilver", type: "credit" }, { id: "a3", name: "Chase Sapphire", type: "credit" }],
  };
  it("a bill two cards match is not given to either; an explicit link wins", () => {
    expect(ctx._finDebtBill(f, f.accounts[0])).toBeNull(); // both Capital One cards hit b1 by first two words
    expect(ctx._finDebtBill(f, f.accounts[2]).id).toBe("b2");
    const g = JSON.parse(JSON.stringify(f)); g.accounts[0].billId = "b1";
    expect(ctx._finDebtBill(g, g.accounts[0]).id).toBe("b1");
    expect(ctx._finDebtBill(g, g.accounts[1])).toBeNull(); // claimed by a1
  });
});

describe("F182 logged income links to the bank deposit", () => {
  const ctx: any = { _finIsUncat: (t: any) => !t.catId || t.catId === "misc-other" };
  load(ctx, [["app-part2.js", ["_finIncomeDeposit", "_finAdoptDeposit", "_finReconcileIncome"]]]);
  it("the manual row is replaced by the synced deposit; nothing counted twice", () => {
    const f: any = {
      incomeStreams: [{ id: "s1", name: "Paycheck", catId: "inc-salary" }],
      transactions: [
        { id: "m1", date: "2026-11-01", amount: 2500, accountId: null, notes: "Income payment", streamId: "s1", catId: "inc-salary" },
        { id: "sf-9", bankTxId: "9", date: "2026-11-03", amount: 2500, accountId: "chk", catId: "inc-other" },
        { id: "sf-8", bankTxId: "8", date: "2026-10-01", amount: 2500, accountId: "chk", catId: "inc-other" },
      ],
    };
    expect(ctx._finReconcileIncome(f)).toBe(1);
    expect(f.transactions.map((t: any) => t.id)).toEqual(["sf-9", "sf-8"]);
    expect(f.transactions[0]).toMatchObject({ streamId: "s1", catId: "inc-salary" });
    expect(f.transactions[1].streamId).toBeUndefined(); // a month away: not this payment
  });
});

describe("F65/F73 chat and coach trash leave prefs", () => {
  it("moves messages and trash with content-derived ids, idempotently", () => {
    const saves: string[] = [];
    const mk = () => ({ D: { prefs: { aiChat: { messages: [{ role: "user", content: "hi", ts: 1 }, { id: "m_x", role: "assistant", content: "yo", ts: 2 }] }, coach: { tz: "x", trash: [{ ent: "task", at: "2026-01-02", label: "A" }] } }, aiChat: [], coachTrash: [] }, save: (k: string) => saves.push(k) });
    const a: any = load(mk(), [["app-part2.js", ["_luHash", "_luMovePrefsLists"]]]);
    const b: any = load(mk(), [["app-part2.js", ["_luHash", "_luMovePrefsLists"]]]);
    expect(a._luMovePrefsLists()).toBe(true);
    b._luMovePrefsLists();
    expect(a.D.prefs.aiChat).toBeUndefined();
    expect(a.D.prefs.coach.trash).toBeUndefined();
    expect(a.D.prefs.coach.tz).toBe("x");
    expect(a.D.aiChat.map((m: any) => m.content)).toEqual(["hi", "yo"]);
    expect(a.D.aiChat.every((m: any) => typeof m.id === "string" && m.id)).toBe(true);
    expect(a.D.aiChat.map((m: any) => m.id)).toEqual(b.D.aiChat.map((m: any) => m.id)); // two devices agree
    expect(a.D.coachTrash[0].id).toBe(b.D.coachTrash[0].id);
    expect(a._luMovePrefsLists()).toBe(false);
    expect(saves).toContain("aiChat");
  });
});

describe("F92/F110 tasks: one Inbox rule, mine by account", () => {
  const ctx: any = { D: { creds: { userId: 7, userName: "New Name" }, prefs: { myNames: ["Old Name"] } }, save() {} };
  load(ctx, [["app-2-home-tasks.js", ["_taskIsInbox", "_myNames", "_isMineCreated", "_isAssignedElsewhere"]]]);
  it("Inbox reads external statuses too", () => {
    expect(ctx._taskIsInbox({ status: "Not Started" })).toBe(true);
    expect(ctx._taskIsInbox({ status: "To Do" })).toBe(true);
    expect(ctx._taskIsInbox({ status: "In Progress" })).toBe(false);
  });
  it("renaming yourself keeps your tasks yours", () => {
    expect(ctx._isMineCreated({ createdBy: "Old Name" })).toBe(true);
    expect(ctx._isMineCreated({ createdBy: "Someone" })).toBe(false);
    expect(ctx._isMineCreated({ createdById: 7, createdBy: "Someone" })).toBe(true);
    expect(ctx._isAssignedElsewhere({ assignedTo: "old name" })).toBe(false);
    expect(ctx._isAssignedElsewhere({ assignedTo: "Pat" })).toBe(true);
    expect(ctx._isAssignedElsewhere({ primaryAssigneeId: 7, assignedTo: "Pat" })).toBe(false);
  });
});

describe("F67 deleting a task or project cleans up references (and Undo restores)", () => {
  it("subtasks go, links drop, Undo puts all of it back", () => {
    const D: any = {
      tasks: [{ id: 1, title: "parent" }, { id: 2, title: "kid", parentTaskId: 1 }, { id: 3, title: "grandkid", parentTaskId: 2 }, { id: 4, title: "after", predecessorIds: [1, 9], projectId: 50 }],
      goals: [{ id: 10, linkedTaskIds: [1, 4] }], notes: [], programs: [{ id: 20, projectIds: [50, 51] }], clusters: [{ id: 30, projectIds: [50] }],
    };
    const _calEvents = [{ id: "e", _planned: true, linkedTaskId: 1 }];
    const ctx: any = { D, _calEvents, save() {}, _calPersist() {} };
    load(ctx, [["app-1-core.js", ["_luCascadeDelete"]]]);
    D.tasks.splice(0, 1); // the caller removes the item itself
    const c = ctx._luCascadeDelete("task", 1);
    expect(c.count).toBe(2);
    expect(D.tasks.map((t: any) => t.id)).toEqual([4]);
    expect(D.tasks[0].predecessorIds).toEqual([9]);
    expect(D.goals[0].linkedTaskIds).toEqual([4]);
    expect(_calEvents.length).toBe(0);
    c.undo();
    expect(D.tasks.map((t: any) => t.id).sort()).toEqual([2, 3, 4]);
    expect(D.tasks.find((t: any) => t.id === 4).predecessorIds).toEqual([1, 9]);
    expect(D.goals[0].linkedTaskIds).toEqual([1, 4]);
    expect(_calEvents.length).toBe(1);
    const p = ctx._luCascadeDelete("project", 50);
    expect(D.tasks.find((t: any) => t.id === 4).projectId).toBeNull();
    expect(D.programs[0].projectIds).toEqual([51]);
    expect(D.clusters[0].projectIds).toEqual([]);
    p.undo();
    expect(D.tasks.find((t: any) => t.id === 4).projectId).toBe(50);
    expect(D.programs[0].projectIds).toEqual([50, 51]);
  });
});

describe("F189 a debt with no payment means no debt-free date", () => {
  it("what-if keeps unpaid debts and says never", () => {
    const ctx: any = { _finDebtPayoff: () => [{ name: "Card", balance: 1000, pay: 100, apr: 0 }, { name: "Loan", balance: 500, pay: 0, apr: 10 }] };
    load(ctx, [["app-part2.js", ["_finSimulatePayoff"]]]);
    const r = ctx._finSimulatePayoff(0, "snowball");
    expect(r.never).toBe(false); // the card's $100 rolls onto the loan once the card clears
    ctx._finDebtPayoff = () => [{ name: "Loan", balance: 500, pay: 0, apr: 10 }];
    expect(ctx._finSimulatePayoff(0, "snowball")).toBeNull();
    const r2 = ctx._finSimulatePayoff(1, "snowball");
    expect(r2.never).toBe(true);
    expect(r2.left).toEqual(["Loan"]);
  });
});
