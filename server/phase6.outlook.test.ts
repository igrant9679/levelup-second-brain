/**
 * Build -237: two-way Outlook calendar. The SHIPPED client code (app-part2's
 * pull + push queue, app-5-life's calendar helpers) runs in a vm with a fake
 * server; the Graph mapping helpers are checked directly.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { graphWritable, ruleToGraph, graphEventBody, graphEventOut } from "./_core/outlookCalendar";

const JS = path.join(__dirname, "../client/public/js");
const read = (f: string, enc: BufferEncoding = "utf8") => fs.readFileSync(path.join(JS, f), enc).replace(/\r\n/g, "\n");
const CORE = read("app-1-core.js", "latin1"), LIFE = read("app-5-life.js"), P2 = read("app-part2.js");
function grab(src: string, name: string): string {
  let i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing " + name);
  if (src.slice(i - 6, i) === "async ") i -= 6;
  const rest = src.slice(i + 1);
  const m = rest.match(/\n(?=(?:async )?function |const |let |var |\/\/|\/\*|try\{|document\.|setInterval)/);
  return src.slice(i, m ? i + 1 + (m.index as number) : src.length);
}
const line = (src: string, p: string) => { const i = src.indexOf(p); if (i < 0) throw new Error("missing " + p); return src.slice(i, src.indexOf("\n", i)); };
const CLIENT = [
  grab(CORE, "_pd"), grab(CORE, "_ymd"),
  line(LIFE, "const _CAL_FREQS="), line(LIFE, "const _calLastMemo="), line(LIFE, "const _CAL_DOW="), line(LIFE, "const _CAL_EV_FIELDS="), line(LIFE, "const _calIsAllDay="),
  ...["_calDn", "_calYmdOf", "_calRule", "_calRuleHits", "_calRuleLast", "_calNaturalOn", "_calOccurrence", "_calSeriesOn", "_calLocalOn",
    "_calLocalEventsOn", "_calLocalBetween", "_calResolve", "_calApplyEdit", "_calEvMins", "_calMoveEvent", "_calAfterMove", "_calCanMove"].map((n) => grab(LIFE, n)),
  grab(P2, "_luHash"), line(P2, "let _calPushBusy="), line(P2, "let _calOutlookConnected="),
  ...["_calMsId", "_calPushQ", "_calSetPushQ", "_calQueuePush", "_calIsOutlook", "_calOutlookEditable", "_calRekey", "_calOutlookPayload",
    "_calPushPending", "_calOutlookReady", "syncOAuthCalendar"].map((n) => grab(P2, n)),
].join("\n");

type Call = { path: string; input: any };
function device(graph: any[], opts: { readOnly?: boolean } = {}) {
  const store: Record<string, string> = {};
  const calls: Call[] = [];
  const toasts: any[] = [];
  const ctx: any = {
    console, Intl, setTimeout: (f: any) => { ctx._later.push(f); return 0; }, _later: [] as any[],
    localStorage: { getItem: (k: string) => (k in store ? store[k] : null), setItem: (k: string, v: string) => { store[k] = String(v); }, removeItem: (k: string) => { delete store[k]; } },
    D: { prefs: {}, notes: [] as any[] }, curScreen: "home", window: {} as any,
    save: () => {}, toast: (t: any) => toasts.push(t), renderCal: () => {}, _calPersist: () => {},
    async _trpc(p: string, input: any) {
      calls.push({ path: p, input: JSON.parse(JSON.stringify(input ?? null)) });
      if (p === "oauthSync.syncCalendar") return { events: graph, window: { from: input.fromISO, to: input.toISO } };
      if (p === "oauthSync.status") return { microsoft: { connected: true } };
      if (p === "oauthSync.calendarWrite") {
        if (opts.readOnly && input.op !== "create") return { ok: false, readOnly: true, error: "has attendees" };
        if (input.op === "create") return { ok: true, id: "NEW-" + input.event.title, webLink: "https://outlook.office.com/x" };
        return { ok: true, id: input.extId };
      }
      throw new Error("unexpected " + p);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CLIENT + "\nvar _calEvents=[];", ctx);
  return { ctx, calls, toasts, store, run: (code: string) => vm.runInContext(code, ctx) };
}
const iso = (ymd: string, hm: string) => new Date(`${ymd}T${hm}:00`).toISOString();
const D1 = (() => { const d = new Date(); d.setDate(d.getDate() + 2); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; })();
const GRAPH = [
  { id: "AAA-dentist", title: "Dentist", start: iso(D1, "09:00"), end: iso(D1, "10:00"), location: "", notes: "", isAllDay: 0, editable: true },
  { id: "BBB-board", title: "Board meeting", start: iso(D1, "14:00"), end: iso(D1, "15:30"), location: "Room 1", notes: "", isAllDay: 0, editable: false, attendees: ["Pat"] },
];

describe("Graph mapping", () => {
  it("only organiser events with no attendees are writable", () => {
    expect(graphWritable({ isOrganizer: true, attendees: [] })).toBe(true);
    expect(graphWritable({ isOrganizer: true, attendees: [{ emailAddress: { address: "pat@x.com" } }] })).toBe(false);
    expect(graphWritable({ isOrganizer: false, attendees: [] })).toBe(false);
    expect(graphEventOut({ id: "1", start: { dateTime: "2026-10-28T13:00:00.0000000", timeZone: "UTC" }, end: { dateTime: "2026-10-28T14:00:00.0000000", timeZone: "UTC" }, isOrganizer: true }).start).toBe("2026-10-28T13:00:00.000Z");
  });
  it("maps repeat rules to Graph recurrence and never sends attendees", () => {
    expect(ruleToGraph({ freq: "weekly", interval: 2, byDay: [1, 3], count: 6, startDate: "2026-10-26" }, "America/New_York"))
      .toEqual({ pattern: { interval: 2, firstDayOfWeek: "sunday", type: "weekly", daysOfWeek: ["monday", "wednesday"] }, range: { startDate: "2026-10-26", recurrenceTimeZone: "America/New_York", type: "numbered", numberOfOccurrences: 6 } });
    expect(ruleToGraph({ freq: "monthly", startDate: "2026-01-31", until: "2026-12-31" }, "UTC").pattern).toMatchObject({ type: "absoluteMonthly", dayOfMonth: 31 });
    const b = graphEventBody({ title: "Focus", start: "2026-10-28T09:00:00", end: "2026-10-28T10:00:00" }, "America/New_York", true);
    expect(b).not.toHaveProperty("attendees");
    expect(b.start).toEqual({ dateTime: "2026-10-28T09:00:00", timeZone: "America/New_York" });
  });
});

describe("pull", () => {
  it("adds Outlook events on shared ids, merges duplicates, keeps note links", async () => {
    const d = device(GRAPH);
    // two older copies of the same event (random ids from two devices) + a note linked to one
    d.run(`_calEvents.push({id:0.123,source:'microsoft',extId:'AAA-dentist',title:'Dentist',dateStr:'${D1}',hour:9},{id:0.456,source:'microsoft',extId:'AAA-dentist',title:'Dentist',dateStr:'${D1}',hour:9});D.notes.push({id:1,meetings:[{id:0.123,title:'Dentist'}]});`);
    await d.ctx.syncOAuthCalendar("microsoft", { silent: true });
    const rows = JSON.parse(JSON.stringify(d.ctx._calEvents));
    expect(rows.length).toBe(2);
    const dent = rows.find((r: any) => r.extId === "AAA-dentist");
    expect(dent.id).toBe(d.ctx._calMsId("AAA-dentist"));
    expect(dent.editable).toBe(true);
    expect(rows.find((r: any) => r.extId === "BBB-board").editable).toBe(false);
    expect(d.ctx.D.notes[0].meetings[0].id).toBe(dent.id);
    // the window asked for: 7 days back → ~120 ahead
    const inp = d.calls.find((c) => c.path === "oauthSync.syncCalendar")!.input;
    expect((new Date(inp.toISO).getTime() - new Date(inp.fromISO).getTime()) / 86400000).toBeGreaterThan(120);
  });
  it("drops an event Outlook no longer returns, but never one still going out", async () => {
    const d = device([GRAPH[1]]);
    d.run(`_calEvents.push({id:_calMsId('AAA-dentist'),source:'microsoft',extId:'AAA-dentist',title:'Dentist',dateStr:'${D1}',hour:9,editable:true},{id:_calMsId('CCC'),source:'microsoft',extId:'CCC',title:'Moved here',dateStr:'${D1}',hour:11,editable:true});_calSetPushQ({[_calMsId('CCC')]:'update'});`);
    d.run("_calPushBusy=true"); // keep the queue from flushing during the pull
    await d.ctx.syncOAuthCalendar("microsoft", { silent: true });
    const titles = d.ctx._calEvents.map((r: any) => r.title).sort();
    expect(titles).toEqual(["Board meeting", "Moved here"]);
  });
});

describe("push", () => {
  it("a moved event goes back to Outlook with local wall-clock times", async () => {
    const d = device(GRAPH);
    await d.ctx.syncOAuthCalendar("microsoft", { silent: true });
    const id = d.ctx._calMsId("AAA-dentist");
    d.ctx._calMoveEvent(id, D1, 13 * 60 + 30, 14 * 60 + 30);
    d.ctx._calAfterMove(id);
    await d.ctx._calPushPending();
    const w = d.calls.filter((c) => c.path === "oauthSync.calendarWrite");
    expect(w.length).toBe(1);
    expect(w[0].input).toMatchObject({ op: "update", extId: "AAA-dentist", event: { start: `${D1}T13:30:00`, end: `${D1}T14:30:00`, isAllDay: false } });
    expect(d.ctx._calPushQ()).toEqual({});
  });
  it("a meeting with attendees cannot be moved here", async () => {
    const d = device(GRAPH);
    await d.ctx.syncOAuthCalendar("microsoft", { silent: true });
    const row = d.ctx._calEvents.find((r: any) => r.extId === "BBB-board");
    expect(d.ctx._calCanMove(row)).toBe(false);
    d.ctx._calAfterMove(row.id);
    expect(d.ctx._calPushQ()).toEqual({});
  });
  it("if Outlook refuses (attendees added there), the row turns read-only and the queue clears", async () => {
    const d = device(GRAPH, { readOnly: true });
    await d.ctx.syncOAuthCalendar("microsoft", { silent: true });
    const row = d.ctx._calEvents.find((r: any) => r.extId === "AAA-dentist");
    d.ctx._calQueuePush(row, "update");
    await d.ctx._calPushPending();
    expect(row.editable).toBe(false);
    expect(d.ctx._calPushQ()).toEqual({});
    expect(d.toasts.some((t) => t && t.title === "Outlook not updated")).toBe(true);
  });
  it("delete hides at once and removes after Outlook confirms", async () => {
    const d = device(GRAPH);
    await d.ctx.syncOAuthCalendar("microsoft", { silent: true });
    const row = d.ctx._calEvents.find((r: any) => r.extId === "AAA-dentist");
    d.run("_calPushBusy=true");
    d.ctx._calQueuePush(row, "delete");
    expect(d.ctx._calLocalEventsOn(d.ctx._pd(D1)).map((e: any) => e.title)).toEqual(["Board meeting"]);
    d.run("_calPushBusy=false");
    await d.ctx._calPushPending();
    expect(d.ctx._calEvents.some((r: any) => r.extId === "AAA-dentist")).toBe(false);
  });
  it("a new repeating event is created in Outlook as a series, then Outlook's occurrences replace it", async () => {
    const graph: any[] = [];
    const d = device(graph);
    d.run(`_calEvents.push({id:777,title:'Gym',dateStr:'${D1}',start:'07:00',end:'08:00',hour:7,endHour:8,rrule:{freq:'weekly',interval:1,byDay:[new Date(_calDn('${D1}')*86400000).getUTCDay()]},source:'microsoft',editable:true});`);
    d.ctx._calQueuePush(d.ctx._calEvents[0], "create");
    await d.ctx._calPushPending();
    const w = d.calls.find((c) => c.path === "oauthSync.calendarWrite")!.input;
    expect(w.op).toBe("create");
    expect(w.event.recurrence).toMatchObject({ freq: "weekly", interval: 1, startDate: D1 });
    expect(d.ctx._calEvents[0].extId).toBe("NEW-Gym");
    // Outlook now returns the occurrences of that series
    graph.push({ id: "occ1", seriesMasterId: "NEW-Gym", title: "Gym", start: iso(D1, "07:00"), end: iso(D1, "08:00"), isAllDay: 0, editable: true });
    await d.ctx.syncOAuthCalendar("microsoft", { silent: true });
    const rows = JSON.parse(JSON.stringify(d.ctx._calEvents));
    expect(rows.length).toBe(1);
    expect(rows[0].extId).toBe("occ1");
  });
});
