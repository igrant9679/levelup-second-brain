/**
 * Audit 2, Phase 2 (build -261) — the PM calendar maths moved from day-by-day
 * Date loops to arithmetic on day numbers. This runs the SHIPPED helpers from
 * app-pm.js against the old loop versions (kept here verbatim as the
 * reference) over thousands of random dates, both calendars (Mon–Fri and
 * 7-day), and requires identical answers — plus a speed check.
 *
 * The second part loads every top-level function of app-pm.js and checks
 * pmCpm / pmEvm on a project worked out by hand, the per-tick memo (-261),
 * and that a 500-row WBS schedules + earns quickly (was ~0.5 s + ~2.6 s).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";
import * as acorn from "acorn";

const SRC = readFileSync(resolve(__dirname, "../client/public/js/app-pm.js"), "utf8");
const line = (re: RegExp) => { const m = SRC.match(re); if (!m) throw new Error("missing " + re); return m[0]; };
const block = (from: string, to: string) => { const a = SRC.indexOf(from), b = SRC.indexOf(to, a); if (a < 0 || b < 0) throw new Error("missing " + from); return SRC.slice(a, b); };
const NEW = [
  line(/^function _pmYmd\(d\)[^\n]*$/m),
  line(/^function _pmIsWork\(d,ww\)[^\n]*$/m),
  block("var _pmDnCache=", "function _pmWbsRecs"),
  line(/^function _pmPrevWork\(ymd,ww\)[^\n]*$/m),
].join("\n");

// the pre-261 implementations, verbatim
const OLD = `
function oYmd(d){if(!d)return '';var x=d instanceof Date?d:new Date(String(d).length<=10?String(d)+'T12:00:00':d);if(isNaN(x))return '';return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');}
function oIsWork(d,ww){var x=d.getDay();return ww||(x!==0&&x!==6);}
function oNextWork(ymd,ww){var d=new Date(ymd+'T12:00:00');while(!oIsWork(d,ww))d.setDate(d.getDate()+1);return oYmd(d);}
function oPrevWork(ymd,ww){var d=new Date(ymd+'T12:00:00');while(!oIsWork(d,ww))d.setDate(d.getDate()-1);return oYmd(d);}
function oAddWork(ymd,n,ww){var d=new Date(oNextWork(ymd,ww)+'T12:00:00');var step=n<0?-1:1;var left=Math.abs(n);while(left>0){d.setDate(d.getDate()+step);if(oIsWork(d,ww))left--;}return oYmd(d);}
function oWorkBetween(a,b,ww){if(a===b)return 0;var sign=b>a?1:-1;var d=new Date((sign>0?a:b)+'T12:00:00'),end=new Date((sign>0?b:a)+'T12:00:00');var n=0;while(d<end){if(oIsWork(d,ww))n++;d.setDate(d.getDate()+1);}return sign*n;}
`;
const ctx: any = {};
vm.createContext(ctx);
vm.runInContext(NEW + "\n" + OLD, ctx);

// deterministic pseudo-random dates 2019-01-01 … 2031-12-31
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
const day0 = Date.UTC(2019, 0, 1) / 864e5, span = Date.UTC(2031, 11, 31) / 864e5 - day0;
const randYmd = () => ctx._pmYmdOfDn(day0 + Math.floor(rnd() * span));

describe("PM calendar maths: arithmetic == the old day-by-day loops", () => {
  it("work days between two dates", () => {
    for (let i = 0; i < 1500; i++) {
      const a = randYmd(), b = rnd() < 0.5 ? randYmd() : ctx._pmYmdOfDn(ctx._pmDn(a) + Math.floor(rnd() * 40) - 20), ww = rnd() < 0.3;
      expect([a, b, ww, ctx._pmWorkBetween(a, b, ww)]).toEqual([a, b, ww, ctx.oWorkBetween(a, b, ww)]);
    }
  });
  it("adding work days (both directions)", () => {
    for (let i = 0; i < 4000; i++) {
      const a = randYmd(), n = Math.floor(rnd() * 400) - 200, ww = rnd() < 0.3;
      expect([a, n, ww, ctx._pmAddWork(a, n, ww)]).toEqual([a, n, ww, ctx.oAddWork(a, n, ww)]);
    }
  });
  it("next / previous work day", () => {
    for (let i = 0; i < 2000; i++) {
      const a = randYmd(), ww = rnd() < 0.3;
      expect(ctx._pmNextWork(a, ww)).toBe(ctx.oNextWork(a, ww));
      expect(ctx._pmPrevWork(a, ww)).toBe(ctx.oPrevWork(a, ww));
    }
  });
  it("is much faster on long spans", () => {
    const pairs = Array.from({ length: 800 }, () => [randYmd(), randYmd()]);
    let t = performance.now(); pairs.forEach(([a, b]) => ctx.oWorkBetween(a, b, false)); const old = performance.now() - t;
    t = performance.now(); pairs.forEach(([a, b]) => ctx._pmWorkBetween(a, b, false)); const neu = performance.now() - t;
    expect(neu * 20).toBeLessThan(old);
  });
});

// ── pmCpm / pmEvm with the real app-pm.js ───────────────────────────────────
function loadPm() {
  const ast: any = acorn.parse(SRC, { ecmaVersion: 2022 });
  const inert = (n: any) => !n || ["Literal", "ObjectExpression", "ArrayExpression", "FunctionExpression", "ArrowFunctionExpression", "UnaryExpression"].includes(n.type)
    || (n.type === "CallExpression" && SRC.slice(n.start, n.end) === "Object.create(null)");
  const parts: string[] = [];
  for (const s of ast.body) {
    if (s.type === "FunctionDeclaration") parts.push(SRC.slice(s.start, s.end));
    else if (s.type === "VariableDeclaration" && s.declarations.every((d: any) => inert(d.init) && d.id.name !== "PM")) parts.push(SRC.slice(s.start, s.end));
  }
  const c: any = {
    PM: { records: [], people: [] }, D: { tasks: [], externalTasks: [], timeEntries: [], projects: [{ id: 1, name: "P" }], atlas: null, creds: {} },
    _ymd: (d: Date) => { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); },
    _pd: (s: string) => (/^\d{4}-\d\d-\d\d$/.test(String(s)) ? new Date(s + "T00:00:00") : new Date(s)),
    _dayOf: (v: string) => String(v || "").slice(0, 10), _isExtDone: (s: string) => /done|complete/i.test(String(s || "")), _workspaceMembers: [],
    _trpc: async () => ({ id: Math.floor(Math.random() * 1e9) }), _pmToast: () => {}, setTimeout,
  };
  vm.createContext(c);
  vm.runInContext(parts.join("\n"), c);
  return c;
}
const wbs = (id: number, title: string, data: any, status = "") => ({ id, _lk: "l" + id, kind: "wbs", projectKey: "p:1", sortOrder: id, title, status, data });

describe("pmCpm / pmEvm on the shipped app-pm.js", () => {
  // A (2d) → B (3d, half done) → C (1d), project starts Mon 5 Jan 2026.
  const project = (ww: boolean) => [
    wbs(1, "A", { duration: 2, preds: [] }, "done"),
    wbs(2, "B", { duration: 3, pct: 50, preds: [{ id: 1, type: "FS", lag: 0 }] }),
    wbs(3, "C", { duration: 1, preds: [{ id: 2, type: "FS", lag: 0 }] }),
    { id: 10, _lk: "s", kind: "pmsettings", projectKey: "p:1", data: { startDate: "2026-01-05", workWeekends: ww } },
    { id: 11, _lk: "b", kind: "budgetline", projectKey: "p:1", data: { amount: 6000 } },
    { id: 12, _lk: "c", kind: "cost", projectKey: "p:1", data: { amount: 3000, date: "2026-01-07" } },
  ];
  it("schedules a chain on work days (and on every day when weekends count)", () => {
    const c = loadPm();
    c.PM.records = project(false);
    const r = c.pmCpm("p:1");
    expect(r.nodes.map((n: any) => [n.name, n.start, n.finish, n.critical])).toEqual([
      ["A", "2026-01-05", "2026-01-06", false], ["B", "2026-01-07", "2026-01-09", true], ["C", "2026-01-12", "2026-01-12", true]]);
    expect(r.finish).toBe("2026-01-12");
    c._pmMemoClear(); c.PM.records = project(true);
    expect(c.pmCpm("p:1").finish).toBe("2026-01-10");
  });
  it("earned value, earned schedule, and a weekend today counting to Friday", () => {
    const c = loadPm();
    c.PM.records = project(false);
    c._pmToday = () => "2026-01-08"; // Thursday
    // PV: A 2/2 + B 2/3 of 3 = 4 of 6 → 4000; EV: A 2 + B 1.5 = 3.5 of 6 → 3500
    let e = c.pmEvm("p:1");
    expect([e.bac, e.pv, e.ev, e.ac]).toEqual([6000, 4000, 3500, 3000]);
    expect(e.cpi).toBeCloseTo(3500 / 3000, 9); expect(e.spi).toBeCloseTo(0.875, 9);
    // ES: PV is 3000 at the end of day 2, 4000 at day 3 → 3.5; AT 4; PD 6 → forecast 7 work days → Tue 13 Jan
    expect([e.es, e.at, e.pd, e.spiT, e.forecastFinish]).toEqual([3.5, 4, 6, 0.875, "2026-01-13"]);
    c._pmMemoClear(); c._pmToday = () => "2026-01-10"; // Saturday → as Friday 9 Jan
    e = c.pmEvm("p:1");
    c._pmMemoClear(); c._pmToday = () => "2026-01-09";
    const fri = c.pmEvm("p:1");
    expect([e.pv, e.at, e.spiT]).toEqual([fri.pv, fri.at, fri.spiT]);
    expect(fri.pv).toBe(5000);
  });
  it("day offsets and date labels match the old Date-based helpers", () => {
    const c = loadPm(), y = new Date().getFullYear();
    const oAdd = (ymd: string, n: number) => { const d = new Date(ymd + "T12:00:00"); d.setDate(d.getDate() + n); return c._pmYmd(d); };
    const oDays = (a: string, b: string) => Math.round(((new Date(b + "T12:00:00") as any) - (new Date(a + "T12:00:00") as any)) / 86400000);
    const oDate = (ymd: string) => { const d = new Date(String(ymd).slice(0, 10) + "T12:00:00"); if (isNaN(+d)) return String(ymd);
      return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() !== y ? "numeric" : undefined }); };
    for (let i = 0; i < 1500; i++) {
      const a = randYmd(), b = randYmd(), n = Math.floor(rnd() * 900) - 450;
      expect([a, n, c._pmAddDays(a, n)]).toEqual([a, n, oAdd(a, n)]);
      expect([a, b, c._pmDays(a, b)]).toEqual([a, b, oDays(a, b)]);
      expect(c._pmDate(a)).toBe(oDate(a));
    }
    // around the DST changes, this year and next (labels drop the year only this year)
    ["2026-03-08", "2026-11-01", y + "-06-15", (y + 1) + "-01-02"].forEach((d) => { expect(c._pmDate(d)).toBe(oDate(d)); expect(c._pmAddDays(d, 1)).toBe(oAdd(d, 1)); });
    // not a plain day: same answer as before
    expect(c._pmDate("2026-01-05T10:00:00Z")).toBe(oDate("2026-01-05T10:00:00Z"));
    expect(c._pmDate("nope")).toBe("nope");
    expect(c._pmDays("2026-02-30", "2026-03-02")).toBe(oDays("2026-02-30", "2026-03-02"));
  });
  it("remembers results within a tick and forgets them on any PM write", async () => {
    const c = loadPm();
    c.PM.records = project(false);
    const a = c.pmCpm("p:1");
    expect(c.pmCpm("p:1")).toBe(a);
    const r = c.PM.records.find((x: any) => x.title === "B");
    r.data = Object.assign({}, r.data, { duration: 5 });
    c.pmPut(r);
    const b = c.pmCpm("p:1");
    expect(b).not.toBe(a);
    expect(b.finish).toBe("2026-01-14");
    expect(c.pmEvm("p:1")).toBe(c.pmEvm("p:1"));
    await new Promise((res) => setTimeout(res, 5)); // next tick clears it
    expect(c.pmCpm("p:1")).not.toBe(b);
  });
  it("a 500-row WBS schedules and earns in well under a second", () => {
    const c = loadPm(), recs: any[] = [], groupIds: number[] = [];
    let id = 1;
    for (let g = 0; g < 50; g++) {
      const sid = id++; groupIds.push(sid);
      recs.push(wbs(sid, "G" + g, { parentId: null, preds: g >= 5 ? [{ id: groupIds[g - 5], type: "FS", lag: 0 }] : [] }));
      let prev: number | null = null;
      for (let k = 0; k < 9; k++) { const lid = id++; recs.push(wbs(lid, "T" + lid, { parentId: "l" + sid, duration: 4 + (lid % 3), preds: prev ? [{ id: prev, type: "FS", lag: 0 }] : [] }, lid < 180 ? "done" : "")); prev = lid; }
    }
    recs.push({ id: id++, _lk: "s", kind: "pmsettings", projectKey: "p:1", data: { startDate: "2026-01-05" } });
    for (let b = 0; b < 10; b++) recs.push({ id: id++, _lk: "b" + b, kind: "budgetline", projectKey: "p:1", data: { amount: 10000, wbsKey: "wbs:" + groupIds[b] } });
    recs.push({ id: id++, _lk: "c", kind: "cost", projectKey: "p:1", data: { amount: 2500, date: "2026-02-02" } });
    c.PM.records = recs; c._pmToday = () => "2026-05-20";
    const t = performance.now();
    const r = c.pmCpm("p:1"), e = c.pmEvm("p:1");
    const ms = performance.now() - t;
    expect(r.nodes.length).toBe(500);
    expect(e.es).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1500); // -260 took ~3,100 ms on the same project
  });
});
