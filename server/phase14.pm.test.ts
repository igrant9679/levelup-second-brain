/**
 * Audit 1 medium/low leftovers, PM side (build -275):
 *  F28c per-delegation reply cap        F62  nudges claimed through the send ledger
 *  F63  version check + server appends  F64  changedSince cursor = server time
 *  F212 labor cost from all-time totals F217 delegate update email to the owner
 *  F218 reply classification slips      F219 one "Undo build" after replacing a WBS
 *  F220 template milestones + dates     F221 0-day rows, loop counts, weekend dues, DoD codes
 *  F223 server-assigned RAID/CR numbers, decidedAt, baseline ids, write-back undo
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";
import * as acorn from "acorn";
import { coachMessages, pmPeople, pmRecords, timeEntries, userAppData, users } from "../drizzle/schema";

// ── an in-memory stand-in for the tables these paths touch ────────────────
const st: any = {};
function reset() {
  Object.assign(st, {
    recs: [] as any[], people: [{ id: 3, name: "Dana Lopez", email: "dana@x.test" }], prefs: JSON.stringify({ coach: { tz: "America/New_York" } }),
    coachQueue: [] as any[][], inserted: [] as any[], ledger: new Set<string>(), updates: [] as any[], time: [] as any[], sendDelay: 0, sendOk: true, sent: [] as any[], aiPrompts: [] as string[], ai: "{}",
  });
}
reset();
function chain(result: () => any): any {
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve().then(result).then(res, rej);
      return () => p;
    },
  });
  return p;
}
const rowsFor = (t: any) => t === pmRecords ? st.recs : t === pmPeople ? st.people : t === userAppData ? [{ prefs: st.prefs, contacts: "[]" }]
  : t === users ? [{ id: 1, name: "Owner", email: "owner@x.test" }] : t === coachMessages ? (st.coachQueue.shift() || []) : t === timeEntries ? st.time : [];
const fakeDb: any = {
  select: () => ({ from: (t: any) => chain(() => rowsFor(t)) }),
  update: (t: any) => ({ set: (v: any) => chain(() => { if (t === pmRecords && st.recs[0]) { st.updates.push(v); Object.assign(st.recs[0], v); } return [{ affectedRows: 1 }]; }) }),
  insert: (t: any) => ({ values: (v: any) => { st.inserted.push({ t, v }); return Promise.resolve([{ insertId: 99 }]); } }),
  execute: async (q: any) => {
    const chunks = (q?.queryChunks || []) as any[];
    const text = chunks.map((c: any) => (c && Array.isArray(c.value) ? c.value.join("") : "?")).join("");
    const params = chunks.filter((c: any) => !(c && Array.isArray(c.value)));
    const key = params.join("|");
    if (/INSERT IGNORE INTO send_ledger/i.test(text)) { if (st.ledger.has(key)) return [{ affectedRows: 0 }]; st.ledger.add(key); return [{ affectedRows: 1 }]; }
    if (/DELETE FROM send_ledger/i.test(text)) { st.ledger.delete(key); return [{ affectedRows: 1 }]; }
    return [[]];
  },
  transaction: async (fn: any) => fn(fakeDb),
};
vi.mock("./db", () => ({ getDb: async () => fakeDb }));
vi.mock("./_core/sendEmail", () => ({ sendEmail: vi.fn(async (p: any) => { if (st.sendDelay) await new Promise((r) => setTimeout(r, st.sendDelay)); st.sent.push(p); return st.sendOk; }) }));
vi.mock("./_core/workspaceAI", () => ({ callWorkspaceAI: vi.fn(async (o: any) => { st.aiPrompts.push(o.systemPrompt); return st.ai; }) }));
vi.mock("./_core/quota", () => ({ trySpendQuota: vi.fn(async () => true), spendQuota: vi.fn(async () => undefined) }));
const coachMock = vi.hoisted(() => ({ pushCoachMessage: vi.fn(async () => false), emailDelegateUpdate: vi.fn(async () => true) }));
vi.mock("./_core/coachCron", () => coachMock);
vi.mock("./_core/coachReplies", () => ({ getReplyInboxAddress: async () => "inbox@x.test" }));

import { classifyReplyFallback, mutateDelegation, prevWorkDay, processDelegateReply, processDelegationNudges, pmToken } from "./_core/pmDelegation";
import { pmRouter } from "./routers/pm";
import { timeEntriesRouter } from "./routers/timeEntries";

const dlg = (over: any = {}) => ({ id: 7, userId: 1, kind: "delegation", status: "open", projectKey: "p:1", refType: "task", refId: "55", title: "SOW", deletedAt: null, updatedAt: new Date(),
  data: JSON.stringify({ personKey: "p:3", taskTitle: "SOW", followUp: "2026-11-10", autoNudge: true, ...over }) });

beforeEach(() => { reset(); coachMock.pushCoachMessage.mockClear(); coachMock.emailDelegateUpdate.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe("F218 reading a reply without AI", () => {
  const s = (t: string) => classifyReplyFallback(t).status;
  it("negations are not 'done'", () => {
    expect(s("I can't get it done by Friday")).toBe("blocked");
    expect(s("It won't be done until Monday")).toBe("at_risk");
    expect(s("Not done yet, will have it Friday")).toBe("on_track");
    expect(s("Sorry, couldn’t finish it")).toBe("blocked");
    expect(s("Done — sent it over")).toBe("done");
  });
  it("the work day before a date", () => {
    expect(prevWorkDay("2026-11-13")).toBe("2026-11-12"); // Fri → Thu
    expect(prevWorkDay("2026-11-16")).toBe("2026-11-13"); // Mon → Fri
  });
});

describe("F62 automatic follow-ups are claimed once", () => {
  it("cron + Run now at the same moment send ONE email; a failed send is released", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-10T15:00:00Z")); // Tue 10:00 New York
    st.recs = [dlg()]; st.sendDelay = 30;
    await Promise.all([processDelegationNudges(), processDelegationNudges(1)]);
    expect(st.sent.length).toBe(1);
    expect(Array.from(st.ledger)).toEqual(["1|pmnudge:7|2026-11-10|2026-11-10"]);
    // a send that fails gives the claim back so a later pass can retry
    reset(); st.recs = [dlg()]; st.sendOk = false;
    await processDelegationNudges();
    expect(st.sent.length).toBe(1);
    expect(st.ledger.size).toBe(0);
  });
});

describe("F63 server writes append to the current row", () => {
  it("mutateDelegation re-reads, appends and bumps _rev", async () => {
    st.recs = [dlg({ note: "owner edit saved meanwhile", updates: [{ at: "a", by: "owner", text: "x" }], _rev: 4 })];
    await mutateDelegation(fakeDb, 7, (_r, d) => { d.updates = [...(d.updates || []), { at: "b", by: "delegate", text: "y" }]; });
    const d = JSON.parse(st.recs[0].data);
    expect(d.note).toBe("owner edit saved meanwhile");
    expect(d.updates.map((u: any) => u.text)).toEqual(["x", "y"]);
    expect(d._rev).toBe(5);
  });
  it("recordUpsert refuses a stale baseRev and returns the stored record", async () => {
    st.recs = [dlg({ _rev: 3, note: "from the server" })];
    const pm = pmRouter.createCaller({ user: { id: 1 } } as any);
    const r: any = await pm.recordUpsert({ id: 7, projectKey: "p:1", kind: "delegation", data: { note: "stale client copy" }, baseRev: 2 });
    expect(r.conflict).toBe(true);
    expect(r.data.note).toBe("from the server");
    expect(st.updates.length).toBe(0);
    const ok: any = await pm.recordUpsert({ id: 7, projectKey: "p:1", kind: "delegation", data: { note: "current client copy" }, baseRev: 3 });
    expect(ok.conflict).toBeUndefined();
    expect(JSON.parse(st.recs[0].data)).toEqual({ note: "current client copy", _rev: 4 });
  });
});

describe("F223 numbers and decisions on the server", () => {
  it("a new RAID item gets max+1; a taken hint is replaced, a free one kept", async () => {
    st.recs = [{ id: 1, data: JSON.stringify({ no: 1 }) }, { id: 2, data: JSON.stringify({ no: 2 }) }];
    const pm = pmRouter.createCaller({ user: { id: 1 } } as any);
    const noOf = () => JSON.parse(st.inserted[st.inserted.length - 1].v.data).no;
    await pm.recordUpsert({ projectKey: "p:1", kind: "risk", title: "R", data: {} }); expect(noOf()).toBe(3);
    await pm.recordUpsert({ projectKey: "p:1", kind: "risk", title: "R", data: { no: 2 } }); expect(noOf()).toBe(3);
    await pm.recordUpsert({ projectKey: "p:1", kind: "risk", title: "R", data: { no: 9 } }); expect(noOf()).toBe(9);
  });
  it("a change request back at 'proposed' loses decidedAt", async () => {
    st.recs = [{ id: 1, kind: 'change', data: '{}' }];
    const pm = pmRouter.createCaller({ user: { id: 1 } } as any);
    await pm.recordUpsert({ projectKey: "p:1", kind: "change", title: "CR", status: "proposed", data: { decidedAt: "2026-11-01" } });
    expect(JSON.parse(st.inserted[0].v.data).decidedAt).toBeUndefined();
  });
});

describe("F64 changedSince uses the server's clock", () => {
  it("returns the server time as the next cursor and includes rows AT the cursor", async () => {
    const since = "2026-11-07T10:00:00.000Z";
    st.recs = [{ ...dlg(), id: 1, updatedAt: new Date(since) }, { ...dlg(), id: 2, updatedAt: new Date("2026-11-07T09:59:59.000Z") }];
    const r: any = await pmRouter.createCaller({ user: { id: 1 } } as any).changedSince({ since });
    expect(r.rows.map((x: any) => x.id)).toEqual([1]);
    expect(Math.abs(Date.parse(r.at) - Date.now())).toBeLessThan(5000);
  });
});

describe("F212 tracked time over all time", () => {
  it("timeEntries.totalsForTasks sums per task", async () => {
    st.time = [{ taskId: 5, source: "local", mins: "90" }];
    const te = timeEntriesRouter.createCaller({ user: { id: 1 } } as any);
    expect(await te.totalsForTasks({ taskIds: ["5"] })).toEqual([{ taskId: "5", source: "local", mins: 90 }]);
    expect(await te.totalsForTasks({ taskIds: [] })).toEqual([]);
  });
});

describe("F218 / F28c / F217 delegate replies", () => {
  const reply = (text = "on track for Friday") => processDelegateReply({ ref: { id: 7, token: pmToken(1, 7) }, from: "dana@x.test", text, messageId: "<m" + Math.random() + "@x>" });
  it("'today' is the owner's day; an ETA moves the follow-up to the work day before", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-07T03:00:00Z")); // Fri 6 Nov, 22:00 New York
    st.recs = [dlg()]; st.coachQueue = [[], []];
    st.ai = JSON.stringify({ status: "on_track", eta: "2026-11-13", summary: "Friday" });
    const r = await reply();
    expect(r.ok).toBe(true);
    expect(st.aiPrompts[0]).toContain("Today is 2026-11-06");
    const d = JSON.parse(st.recs[0].data);
    expect(d.expectedBy).toBe("2026-11-13");
    expect(d.followUp).toBe("2026-11-12");
    expect(st.recs[0].status).toBe("on_track");
    expect(coachMock.emailDelegateUpdate).toHaveBeenCalledTimes(1); // F217
  });
  it("a cancelled delegation logs the reply but keeps its status and proposes nothing", async () => {
    st.recs = [{ ...dlg(), status: "cancelled" }]; st.coachQueue = [[], []];
    st.ai = JSON.stringify({ status: "done", eta: null, summary: "done" });
    await reply("done!");
    expect(st.recs[0].status).toBe("cancelled");
    expect(JSON.parse(st.recs[0].data).updates.length).toBe(1);
    const msg = st.inserted.find((x: any) => x.t === coachMessages).v;
    expect(msg.actions).toBeNull();
  });
  it("at most 10 replies per delegation per hour", async () => {
    st.recs = [dlg()]; st.coachQueue = [[], Array.from({ length: 10 }, (_, i) => ({ id: i }))];
    const r = await reply();
    expect(r.ok).toBe(false);
    expect(r.skip).toMatch(/hourly reply cap/);
    expect(st.aiPrompts.length).toBe(0);
  });
});

// ── the shipped client (app-pm.js) ─────────────────────────────────────────
const SRC = readFileSync(resolve(__dirname, "../client/public/js/app-pm.js"), "utf8");
function loadPm(over: any = {}) {
  const ast: any = acorn.parse(SRC, { ecmaVersion: 2022 });
  const inert = (n: any) => !n || ["Literal", "ObjectExpression", "ArrayExpression", "FunctionExpression", "ArrowFunctionExpression", "UnaryExpression"].includes(n.type)
    || (n.type === "CallExpression" && SRC.slice(n.start, n.end) === "Object.create(null)");
  const parts: string[] = [];
  for (const s of ast.body) {
    if (s.type === "FunctionDeclaration") parts.push(SRC.slice(s.start, s.end));
    else if (s.type === "VariableDeclaration" && s.declarations.every((d: any) => inert(d.init) && d.id.name !== "PM")) parts.push(SRC.slice(s.start, s.end));
  }
  const c: any = {
    PM: { records: [], people: [], loaded: true, at: null }, D: { tasks: [], externalTasks: [], timeEntries: [], projects: [{ id: 1, name: "P" }], atlas: null, creds: {} },
    _ymd: (d: Date) => { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
    _pd: (s: string) => (/^\d{4}-\d\d-\d\d$/.test(String(s)) ? new Date(s + "T00:00:00") : new Date(s)),
    _dayOf: (v: string) => String(v || "").slice(0, 10), _isExtDone: (s: string) => /done|complete/i.test(String(s || "")), _workspaceMembers: [],
    calls: [] as any[], toasts: [] as any[], saves: [] as string[],
    setTimeout, document: { getElementById: () => null }, window: {}, confirm: () => true,
    save: (k: string) => c.saves.push(k),
  };
  c._trpc = async (proc: string, input: any) => { c.calls.push({ proc, input }); return c.reply ? c.reply(proc, input) : { id: Math.floor(Math.random() * 1e9) }; };
  c.toast = (o: any) => c.toasts.push(o);
  vm.createContext(c);
  vm.runInContext(parts.join("\n"), c);
  c.pmRender = () => {}; c._pmToast = (m: string) => c.toasts.push(m);
  Object.assign(c, over);
  return c;
}

describe("client: F63 version check", () => {
  it("pmPut sends the rev it is based on and adopts the stored record on a conflict", async () => {
    const c = loadPm();
    const rec = c._pmTagRec({ id: 7, kind: "delegation", projectKey: "p:1", title: "SOW", status: "open", data: { followUp: "2026-11-10", _rev: 4 } });
    c.PM.records = [rec];
    c.reply = (proc: string, inp: any) => (proc === "pm.recordUpsert" ? { id: 7, kind: "delegation", projectKey: "p:1", title: "SOW", status: "done", data: { followUp: "2026-11-10", _rev: 5, updates: [{ text: "done" }] }, conflict: true } : {});
    rec.data = Object.assign({}, rec.data, { followUp: "2026-11-20" });
    await c.pmPut(rec);
    expect(c.calls[0].input.baseRev).toBe(4);
    expect(c.PM.records[0].status).toBe("done");
    expect(c.PM.records[0].data.followUp).toBe("2026-11-10");
    expect(c.PM.records[0]._rev).toBe(5);
    expect(c.toasts.some((t: any) => /Changed elsewhere/.test(String(t)))).toBe(true);
  });
});

describe("client: F64 refresh cursor", () => {
  it("asks from the server's cursor minus 10 s and keeps the server's next cursor", async () => {
    const c = loadPm();
    c.PM.at = "2026-11-07T10:00:00.000Z";
    c.reply = () => ({ at: "2026-11-07T10:05:00.000Z", rows: [{ id: 1, kind: "risk", data: { _rev: 1 } }, { id: 1, kind: "risk", data: { _rev: 1 } }] });
    await c.pmRefreshChanged();
    expect(c.calls[0].input.since).toBe("2026-11-07T09:59:50.000Z");
    expect(c.PM.at).toBe("2026-11-07T10:05:00.000Z");
    expect(c.PM.records.length).toBe(1);
  });
});

describe("client: F212 labor cost", () => {
  it("uses the server's all-time totals, else the 90-day entries", async () => {
    const c = loadPm();
    c.D.tasks = [{ id: 5, projectId: 1, title: "T" }];
    c.D.timeEntries = [{ taskId: 5, durationMins: 60 }];
    c.PM.records = [{ id: 1, _lk: "s", kind: "pmsettings", projectKey: "p:1", data: { laborFromTime: true, myRate: 100 } }];
    expect(c._pmLaborCost("p:1").hours).toBe(1);
    c._pmState = { proj: "x" };
    c.reply = (proc: string) => (proc === "timeEntries.totalsForTasks" ? [{ taskId: "5", source: "local", mins: 600 }] : {});
    c._pmLaborRefresh("p:1");
    await new Promise((r) => setTimeout(r, 10));
    expect(c.calls.find((x: any) => x.proc === "timeEntries.totalsForTasks").input).toEqual({ taskIds: ["5"] });
    expect(c._pmLaborCost("p:1")).toEqual({ cost: 1000, hours: 10 });
  });
});

describe("client: F219 replacing a WBS", () => {
  it("one 'Undo build' removes the new rows and brings the old ones back", async () => {
    const c = loadPm();
    c.PM.records = [{ id: 1, _lk: "id1", kind: "wbs", projectKey: "p:1", title: "Old A", data: {} }, { id: 2, _lk: "id2", kind: "wbs", projectKey: "p:1", title: "Old B", data: {} }];
    let nid = 100;
    c.reply = (proc: string, inp: any) => (proc === "pm.recordUpsertMany" ? inp.records.map((r: any) => ({ ...r, id: r.id || nid++, data: { ...r.data, _rev: 1 } })) : {});
    await c._pmWbsCreate("p:1", [{ title: "New X" }, { title: "New Y" }]);
    const undoToasts = c.toasts.filter((t: any) => t && t.actions);
    expect(undoToasts.length).toBe(1);
    expect(undoToasts[0].actions[0].label).toBe("Undo build");
    expect(c.PM.records.map((r: any) => r.title).sort()).toEqual(["New X", "New Y"]);
    await undoToasts[0].actions[0].onClick();
    expect(c.PM.records.map((r: any) => r.title).sort()).toEqual(["Old A", "Old B"]);
    expect(c.calls.filter((x: any) => x.proc === "pm.recordDelete").map((x: any) => x.input.ids)).toEqual([[1, 2], [100, 101]]);
    expect(c.calls.find((x: any) => x.proc === "pm.recordRestore").input.ids).toEqual([1, 2]);
  });
});

describe("client: F220 templates", () => {
  it("no task starts before its predecessor ends (onboarding)", () => {
    const c = loadPm();
    const tasks = [{ t: "Kick-off", d: 0, dur: 1 }, { t: "Scope", d: 1, dur: 3, pred: [0] }, { t: "Sign SOW", d: 4, dur: 3, pred: [1] }, { t: "Access", d: 5, dur: 3, pred: [2] }, { t: "Billing", d: 5, dur: 2, pred: [2] }, { t: "Plan", d: 8, dur: 2, pred: [3] }, { t: "Done", d: 10, dur: 0, pred: [4, 5], ms: true }];
    const off = c._pmTemplateOffsets(tasks);
    expect(off).toEqual([0, 1, 4, 7, 7, 10, 12]);
    tasks.forEach((x: any, i: number) => (x.pred || []).forEach((p: number) => expect(off[i]).toBeGreaterThanOrEqual(off[p] + (tasks[p].ms ? 0 : Math.max(1, tasks[p].dur)))));
  });
  it("a template milestone is a tagged task only, not also a milestone record", () => {
    const a = SRC.indexOf("async function pmCreateFromTemplate("), b = SRC.indexOf("function pmSaveAsTemplate", a);
    expect(SRC.slice(a, b)).not.toMatch(/kind:'milestone'/);
  });
});

describe("client: F221 scheduling details", () => {
  it("a 0-day row stays 0 days (as a milestone); missing stays 1", () => {
    const c = loadPm();
    expect(c._pmRowDur({ duration: 0 })).toBe(0);
    expect(c._pmRowDur({})).toBe(1);
    expect(c._pmRowDur({ duration: 3 })).toBe(3);
  });
  it("loop counts only rows ON the loop, not those downstream", () => {
    const c = loadPm();
    const w = (id: number, preds: number[]) => ({ id, _lk: "l" + id, kind: "wbs", projectKey: "p:1", sortOrder: id, title: "R" + id, data: { duration: 1, preds: preds.map((p) => ({ id: p, type: "FS", lag: 0 })) } });
    c.PM.records = [w(1, [2]), w(2, [1]), w(3, [2]), w(4, [3]), { id: 9, _lk: "s", kind: "pmsettings", projectKey: "p:1", data: { startDate: "2026-01-05" } }];
    expect(c.pmCpm("p:1").cycles).toBe(2);
  });
  it("a Saturday due date finishes on the Friday", () => {
    const c = loadPm();
    c.D.tasks = [{ id: 1, projectId: 1, title: "A", startDate: "2026-11-02", due: "2026-11-07" }, { id: 2, projectId: 1, title: "B", due: "2026-11-14" }];
    const n = c.pmCpm("p:1").nodes;
    expect(n.find((x: any) => x.name === "A").finish).toBe("2026-11-06");
    expect(n.find((x: any) => x.name === "B").finish).toBe("2026-11-13");
  });
  it("DoD event codes go A…Z, AA, AB", () => {
    const c = loadPm();
    expect([1, 26, 27, 28, 52, 53].map(c._pmAlpha)).toEqual(["A", "Z", "AA", "AB", "AZ", "BA"]);
  });
});

describe("client: F223", () => {
  it("'Write dates to tasks' can be undone, leaving later edits alone", () => {
    const c = loadPm();
    c.D.tasks = [{ id: 1, startDate: "2026-11-02", due: "2026-11-03" }, { id: 2, startDate: "2026-11-04", due: "2026-11-05" }];
    const snap = [{ id: 1, startDate: "2026-11-02", due: "2026-11-03", s: "2026-11-09", f: "2026-11-10" }, { id: 2, startDate: "2026-11-04", due: "2026-11-05", s: "2026-11-11", f: "2026-11-12" }];
    c.D.tasks[0].startDate = "2026-11-09"; c.D.tasks[0].due = "2026-11-10";
    c.D.tasks[1].startDate = "2026-11-11"; c.D.tasks[1].due = "2026-11-20"; // edited since
    c.D.tasks = c.D.tasks.map((t: any) => ({ ...t })); // replaced by a reload
    c._pmWriteBackUndo(snap);
    expect(c.D.tasks[0]).toMatchObject({ startDate: "2026-11-02", due: "2026-11-03" });
    expect(c.D.tasks[1]).toMatchObject({ startDate: "2026-11-04", due: "2026-11-20" });
  });
  it("the client no longer computes RAID / CR numbers; baselines are kept by their saved id", () => {
    expect(SRC).not.toMatch(/nd\.no=1\+/);
    expect(SRC).not.toMatch(/baselineLk:rec\._lk\}/);
  });
});
