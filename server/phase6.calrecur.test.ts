/**
 * Build -236: repeating calendar events. Runs the SHIPPED client code
 * (app-5-life.js) and the server's calRecur.ts on the same rows and requires
 * the same occurrences; checks the edit/delete scopes and the migration of
 * the old copy-per-date repeats.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { calOccurrencesBetween } from "./_core/calRecur";

const JS = path.join(__dirname, "../client/public/js");
const LIFE = fs.readFileSync(path.join(JS, "app-5-life.js"), "utf8").replace(/\r\n/g, "\n");
const CORE = fs.readFileSync(path.join(JS, "app-1-core.js"), "latin1").replace(/\r\n/g, "\n");
function grabFrom(src: string, name: string): string {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing " + name);
  const rest = src.slice(i + 1);
  const m = rest.match(/\n(?=(?:async )?function |const |let |var |\/\/|\/\*|try\{)/);
  return src.slice(i, m ? i + 1 + (m.index as number) : src.length);
}
function line(src: string, prefix: string): string {
  const i = src.indexOf(prefix);
  if (i < 0) throw new Error("missing " + prefix);
  return src.slice(i, src.indexOf("\n", i));
}
const CLIENT = [
  grabFrom(CORE, "_pd"), grabFrom(CORE, "_ymd"),
  line(LIFE, "const _CAL_FREQS="), line(LIFE, "const _calLastMemo="), line(LIFE, "const _CAL_DOW="), line(LIFE, "const _CAL_EV_FIELDS="),
  ...["_calDn", "_calYmdOf", "_calRule", "_calRuleHits", "_calRuleLast", "_calNaturalOn", "_calCountBefore", "_calOccurrence",
    "_calSeriesOn", "_calLocalOn", "_calLocalEventsOn", "_calLocalBetween", "_calResolve", "_calRuleText",
    "_calMigrateRecurrence", "_calApplyEdit", "_calApplyDelete"].map((n) => grabFrom(LIFE, n)),
].join("\n");

function device(rows: any[]) {
  const ctx: any = { console, fmtDate: (s: string) => s, D: { prefs: {} } };
  vm.createContext(ctx);
  vm.runInContext(CLIENT + "\nvar _calEvents=[];", ctx);
  ctx._calEvents = JSON.parse(JSON.stringify(rows));
  vm.runInContext("_calEvents=this._calEvents;", ctx);
  return ctx;
}
const clientBetween = (ctx: any, from: string, to: string) =>
  JSON.parse(JSON.stringify(ctx._calLocalBetween(from, to))).map((e: any) => `${e.dateStr} ${String(e.start || "").slice(0, 5)} ${e.title}`).sort();
const serverBetween = (rows: any[], from: string, to: string) =>
  calOccurrencesBetween(rows, from, to).map((o) => `${o.date} ${o.start} ${o.title}`).sort();

const ROWS = [
  { id: 1, title: "Standup", dateStr: "2026-10-26", start: "09:00", end: "09:15", hour: 9, endHour: 10, rrule: { freq: "weekly", interval: 1, byDay: [1, 2, 3, 4, 5] } },
  { id: 2, title: "1:1", dateStr: "2026-10-28", start: "14:00", end: "14:30", hour: 14, endHour: 15, rrule: { freq: "weekly", interval: 2 }, exdates: ["2026-11-11"] },
  { id: 3, title: "Rent", dateStr: "2026-01-31", start: "08:00", end: "08:30", hour: 8, endHour: 9, rrule: { freq: "monthly", interval: 1 } },
  { id: 4, title: "Gym", dateStr: "2026-10-27", start: "07:00", end: "08:00", hour: 7, endHour: 8, rrule: { freq: "daily", interval: 2, count: 5 },
    overrides: { "2026-10-29": { start: "18:00", end: "19:00", hour: 18, endHour: 19 }, "2026-10-31": { dateStr: "2026-11-01", start: "10:00", hour: 10, endHour: 11 } } },
  { id: 5, title: "Anniversary", dateStr: "2024-02-29", start: "19:00", hour: 19, endHour: 20, rrule: { freq: "yearly", interval: 1, until: "2030-12-31" } },
  { id: 6, title: "Dentist", dateStr: "2026-11-03", start: "10:00", hour: 10, endHour: 11 },
  { id: 7, title: "Quarterly", dateStr: "2026-08-15", start: "11:00", hour: 11, endHour: 12, rrule: { freq: "monthly", interval: 3, until: "2027-02-15" } },
];

describe("repeating events: client == server", () => {
  it("gives the same occurrences over three months", () => {
    const ctx = device(ROWS);
    const c = clientBetween(ctx, "2026-10-20", "2027-01-31");
    const s = serverBetween(ROWS, "2026-10-20", "2027-01-31");
    expect(c).toEqual(s);
    expect(c.length).toBeGreaterThan(80);
  });
  it("applies the rules correctly", () => {
    const s = serverBetween(ROWS, "2026-10-26", "2026-11-30");
    // weekdays only
    expect(s.filter((x) => x.endsWith("Standup") && x.startsWith("2026-10-31"))).toEqual([]);
    expect(s.filter((x) => x.endsWith("Standup")).length).toBe(26); // Mon 26 Oct … Mon 30 Nov
    // every 2 weeks, one deleted
    expect(s.filter((x) => x.endsWith("1:1"))).toEqual(["2026-10-28 14:00 1:1", "2026-11-25 14:00 1:1"]);
    // 31st → last day of shorter months
    expect(s.filter((x) => x.endsWith("Rent"))).toEqual(["2026-10-31 08:00 Rent", "2026-11-30 08:00 Rent"]);
    // count 5 every 2 days, one moved to the next day with a new time, one retimed
    expect(s.filter((x) => x.endsWith("Gym"))).toEqual(["2026-10-27 07:00 Gym", "2026-10-29 18:00 Gym", "2026-11-01 10:00 Gym", "2026-11-02 07:00 Gym", "2026-11-04 07:00 Gym"]);
    // Feb 29 → Feb 28 in other years
    expect(serverBetween(ROWS, "2027-02-01", "2027-03-05").filter((x) => x.endsWith("Anniversary"))).toEqual(["2027-02-28 19:00 Anniversary"]);
    expect(serverBetween(ROWS, "2028-02-01", "2028-03-05").filter((x) => x.endsWith("Anniversary"))).toEqual(["2028-02-29 19:00 Anniversary"]);
    // every 3 months until
    expect(serverBetween(ROWS, "2026-08-01", "2027-12-31").filter((x) => x.endsWith("Quarterly"))).toEqual(["2026-08-15 11:00 Quarterly", "2026-11-15 11:00 Quarterly", "2027-02-15 11:00 Quarterly"]);
  });
  it("opens one occurrence by its id", () => {
    const ctx = device(ROWS);
    const hit = ctx._calResolve("4~2026-10-31");
    expect(hit.occ).toBe("2026-10-31");
    expect(hit.ev.dateStr).toBe("2026-11-01");
    expect(hit.ev.start).toBe("10:00");
    expect(hit.row.id).toBe(4);
  });
});

describe("editing and deleting a repeating event", () => {
  it("this event: only that date changes", () => {
    const ctx = device(ROWS);
    const row = ctx._calEvents.find((e: any) => e.id === 1);
    ctx._calApplyEdit(row, "2026-10-28", { title: "Standup (late)", start: "10:00", hour: 10, endHour: 11, dateStr: "2026-10-28" }, ctx._calRule(row), "one");
    const s = clientBetween(ctx, "2026-10-27", "2026-10-29").filter((x: string) => x.includes("Standup"));
    expect(s).toEqual(["2026-10-27 09:00 Standup", "2026-10-28 10:00 Standup (late)", "2026-10-29 09:00 Standup"]);
  });
  it("this and following: splits the series, earlier dates untouched", () => {
    const ctx = device(ROWS);
    const row = ctx._calEvents.find((e: any) => e.id === 1);
    const nr = ctx._calApplyEdit(row, "2026-11-02", { title: "Standup v2", start: "08:30", hour: 8, endHour: 9, dateStr: "2026-11-02" }, { freq: "weekly", interval: 1, byDay: [1, 3] }, "following");
    ctx._calEvents.push(nr);
    const s = clientBetween(ctx, "2026-10-29", "2026-11-06").filter((x: string) => x.includes("Standup"));
    expect(s).toEqual(["2026-10-29 09:00 Standup", "2026-10-30 09:00 Standup", "2026-11-02 08:30 Standup v2", "2026-11-04 08:30 Standup v2"]);
    expect(serverBetween(JSON.parse(JSON.stringify(ctx._calEvents)), "2026-10-29", "2026-11-06").filter((x) => x.includes("Standup"))).toEqual(s);
  });
  it("this and following keeps the remaining count", () => {
    const ctx = device(ROWS);
    const row = ctx._calEvents.find((e: any) => e.id === 4);
    const nr = ctx._calApplyEdit(row, "2026-10-31", { title: "Gym", start: "07:00", hour: 7, endHour: 8, dateStr: "2026-10-31" }, ctx._calRule(row), "following");
    ctx._calEvents.push(nr);
    const gym = clientBetween(ctx, "2026-10-01", "2026-12-31").filter((x: string) => x.endsWith("Gym"));
    expect(gym.length).toBe(5);
  });
  it("all events: moving the date moves the series and its weekday", () => {
    const ctx = device(ROWS);
    const row = ctx._calEvents.find((e: any) => e.id === 2);
    ctx._calApplyEdit(row, "2026-11-25", { title: "1:1", start: "15:00", hour: 15, endHour: 16, dateStr: "2026-11-26" }, ctx._calRule(row), "all");
    expect(row.dateStr).toBe("2026-10-29");
    expect(clientBetween(ctx, "2026-10-26", "2026-12-31").filter((x: string) => x.endsWith("1:1"))).toEqual(["2026-10-29 15:00 1:1", "2026-11-26 15:00 1:1", "2026-12-10 15:00 1:1", "2026-12-24 15:00 1:1"]);
  });
  it("delete one / following / all", () => {
    const ctx = device(ROWS);
    const row = ctx._calEvents.find((e: any) => e.id === 1);
    expect(ctx._calApplyDelete(row, "2026-10-27", "one")).toBe(false);
    expect(ctx._calApplyDelete(row, "2026-11-02", "following")).toBe(false);
    expect(clientBetween(ctx, "2026-10-26", "2026-11-30").filter((x: string) => x.endsWith("Standup"))).toEqual(["2026-10-26 09:00 Standup", "2026-10-28 09:00 Standup", "2026-10-29 09:00 Standup", "2026-10-30 09:00 Standup"]);
    expect(ctx._calApplyDelete(row, "2026-10-26", "following")).toBe(true);
    expect(ctx._calApplyDelete(ctx._calEvents.find((e: any) => e.id === 6), null, "one")).toBe(true);
  });
});

describe("old repeats fold into one row", () => {
  it("daily copies → one counted series, with a deleted and a moved copy", () => {
    const base = { title: "Walk", start: "07:00", time: "7:00 AM", end: "7:30 AM", hour: 7, endHour: 8, color: "var(--ok)", repeat: "daily", recurId: 99 };
    const rows: any[] = [{ ...base, id: 100, dateStr: "2026-10-01" }];
    for (let i = 1; i < 14; i++) {
      if (i === 3) continue; // deleted
      const d = `2026-10-${String(1 + i).padStart(2, "0")}`;
      rows.push({ ...base, id: 100 + i, _recurIndex: i, dateStr: i === 5 ? "2026-10-20" : d, ...(i === 5 ? { hour: 12, endHour: 13 } : {}) });
    }
    rows.push({ id: 7, title: "Review", dateStr: "2026-10-05", hour: 10, endHour: 11, recurrence: "weekly" });
    rows.push({ id: 8, title: "Synced", dateStr: "2026-10-05", hour: 10, source: "microsoft", recurrence: "weekly" });
    const ctx = device(rows);
    expect(ctx._calMigrateRecurrence()).toBe(2);
    const walk = ctx._calEvents.filter((e: any) => e.title === "Walk");
    expect(walk.length).toBe(1);
    expect(walk[0].rrule).toEqual({ freq: "daily", interval: 1, count: 14 });
    expect(walk[0].exdates).toEqual(["2026-10-04"]);
    expect(walk[0].overrides["2026-10-06"]).toEqual({ hour: 12, endHour: 13, dateStr: "2026-10-20" });
    const dates = clientBetween(ctx, "2026-10-01", "2026-10-31").filter((x: string) => x.endsWith("Walk")).map((x: string) => x.slice(0, 10));
    expect(dates.length).toBe(13);
    expect(dates).toContain("2026-10-20");
    expect(dates).not.toContain("2026-10-04");
    expect(dates).not.toContain("2026-10-06");
    expect(ctx._calEvents.find((e: any) => e.id === 7).rrule).toEqual({ freq: "weekly", interval: 1, byDay: [1] });
    expect(ctx._calEvents.find((e: any) => e.id === 8).rrule).toBeUndefined();
    expect(ctx._calMigrateRecurrence()).toBe(0); // idempotent
  });
});
