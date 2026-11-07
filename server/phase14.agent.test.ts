/**
 * Audit 1 medium/low leftovers, assistant + coach client (build -275):
 *  F30  full autonomy deletes only exact targets      F65  transcript in D.aiChat; claims fail closed
 *  F73  coach trash in D.coachTrash                    F195 own budget unless the shared one is on screen
 *  F217 owed coach/delegate messages delivered whatever their age; polling with open delegations
 *  F225 unparseable dates refused                      F226 field-level undo by id
 * The agent cases run in scripts/check-ai-agent.mjs (the shipped app-agent.js in a
 * vm with a fake workspace); this runs it and checks those cases, plus the
 * coach-side pieces of app-coach.js.
 */
import { describe, expect, it } from "vitest";
import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";

const ROOT = resolve(__dirname, "..");
const COACH = readFileSync(resolve(ROOT, "client/public/js/app-coach.js"), "utf8");
const AGENT = readFileSync(resolve(ROOT, "client/public/js/app-agent.js"), "utf8");
const fn = (src: string, name: string) => { const a = src.indexOf("function " + name + "("); if (a < 0) throw new Error("missing " + name); const b = src.indexOf("\n}", a); return src.slice(a, b + 2); };

describe("app-agent.js in check-ai-agent", () => {
  it("F30 / F65 / F225 / F226 / F195 cases pass", () => {
    const out = execFileSync(process.execPath, [resolve(ROOT, "scripts/check-ai-agent.mjs")], { encoding: "utf8", timeout: 120000 });
    for (const id of ["F30", "F65", "F225", "F226", "F195"]) {
      const lines = out.split(/\r?\n/).filter((l) => l.includes(" " + id + ":"));
      expect([id, lines.length > 0]).toEqual([id, true]);
      expect(lines.filter((l) => l.startsWith("FAIL"))).toEqual([]);
    }
    expect(out).toContain("AI agent holds.");
  }, 130000);
  it("F65: app-agent never writes the transcript into prefs", () => {
    expect(AGENT).not.toMatch(/D\.prefs\.aiChat/);
  });
});

describe("app-coach.js", () => {
  it("F73: the trash lives in D.coachTrash with ids and caps, never in prefs", () => {
    expect(COACH).not.toMatch(/\.trash\.(unshift|push|splice)|c\.trash\s*=/);
    const a = COACH.indexOf("(function(){\r\n  if(typeof _agentDelete!=='function')return;");
    const b = COACH.indexOf("})();", a);
    const wrap = COACH.slice(a, b + 5);
    const saves: string[] = [];
    const ctx: any = {
      D: { prefs: { coach: {} }, tasks: [{ id: 1, title: "Big task", body: "x".repeat(10) }, { id: 2, title: "Huge", body: "y".repeat(70000) }] },
      save: (k: string) => saves.push(k), JSON, Math, Date, String,
      _agentFind: (list: any[], id: any) => ({ item: list.find((x) => String(x.id) === String(id)) }),
      _coachListFor: (ent: string) => (ent === "task" ? [ctx.D.tasks, "title", "tasks"] : null),
      COACH_TRASH_MAX: 25, COACH_TRASH_ITEM_MAX: 60000,
    };
    ctx.window = ctx;
    ctx._agentDelete = (x: any) => { ctx.D.tasks = ctx.D.tasks.filter((t: any) => String(t.id) !== String(x.id)); return { ok: true, summary: "Deleted" }; };
    vm.createContext(ctx);
    vm.runInContext(fn(COACH, "_coachTrash") + "\n" + fn(COACH, "_coachTrashSave") + "\n" + wrap, ctx);
    ctx._agentDelete({ entity: "task", id: 1 });
    ctx._agentDelete({ entity: "task", id: 2 }); // over 60 KB → not kept
    expect(ctx.D.coachTrash.length).toBe(1);
    expect(ctx.D.coachTrash[0]).toMatchObject({ ent: "task", label: "Big task" });
    expect(ctx.D.coachTrash[0].id).toMatch(/^ct_/);
    expect(saves).toContain("coachTrash");
    expect(saves).not.toContain("prefs");
    expect(ctx.D.prefs.coach.trash).toBeUndefined();
    for (let i = 0; i < 30; i++) { ctx.D.tasks.push({ id: 100 + i, title: "t" + i }); ctx._agentDelete({ entity: "task", id: 100 + i }); }
    expect(ctx.D.coachTrash.length).toBe(25);
  });
  it("F217: unread or still-pending messages are owed whatever their age; settled old ones are not", () => {
    const ctx: any = { Date, _pd: (v: any) => new Date(v) }; vm.createContext(ctx);
    vm.runInContext(fn(COACH, "_coachOwed"), ctx);
    const old = new Date(Date.now() - 10 * 86400e3).toISOString();
    expect(ctx._coachOwed({ createdAt: old, status: "read", applyState: "pending", kind: "delegate" })).toBe(true);
    expect(ctx._coachOwed({ createdAt: old, status: "new", applyState: "none" })).toBe(true);
    expect(ctx._coachOwed({ createdAt: old, status: "read", applyState: "applied" })).toBe(false);
    expect(ctx._coachOwed({ createdAt: new Date().toISOString(), status: "read", applyState: "none" })).toBe(true);
  });
  it("F217: polls while a delegation is open even with check-ins off", () => {
    const ctx: any = { D: { prefs: {}, tasks: [{ id: 1, delegatedTo: "Dana", status: "Not Started" }] }, _coachCheckins: () => ({ enabled: false }) };
    vm.createContext(ctx);
    vm.runInContext(fn(COACH, "_coachShouldPoll") + "\n" + fn(COACH, "_coachHasOpenDelegations"), ctx);
    expect(ctx._coachShouldPoll()).toBe(true);
    ctx.D.tasks[0].status = "Done";
    expect(ctx._coachShouldPoll()).toBe(false);
    ctx.PM = { loaded: true }; ctx.pmRecs = () => [{ status: "open" }];
    expect(ctx._coachShouldPoll()).toBe(true);
  });
  it("F27: a remember from a reply/delegate message is never applied on its own", () => {
    const a = COACH.indexOf("async function _coachDeliver("), b = COACH.indexOf("\n}", a);
    const body = COACH.slice(a, b);
    expect(body).toMatch(/msg\.kind==='reply'\|\|msg\.kind==='delegate'\)\?safe\.filter\(function\(a\)\{return a\.tool==='remember'/);
    expect(body).toMatch(/pending:mem\.map/);
  });
});
