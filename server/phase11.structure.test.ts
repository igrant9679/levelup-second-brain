/**
 * Builds -267..-271 (Audit 2 Phase 5): the app's shape. Pages merged, tabs
 * grouped, one hand-off, one AI entry point. These guard what a DOM check
 * wouldn't notice: a new tab left out of every group is unreachable, and an
 * old route that stops resolving breaks links saved in people's data.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

const js = (f: string) => fs.readFileSync(path.join(__dirname, "../client/public/js", f), "latin1");
const html = fs.readFileSync(path.join(__dirname, "../client/index.html"), "utf8");
const pm = js("app-pm.js");
const part2 = js("app-part2.js");
const core = js("app-1-core.js");
const home = js("app-2-home-tasks.js");

function lift(src: string, marker: string, globals: Record<string, unknown> = {}) {
  const a = src.indexOf(marker);
  if (a < 0) throw new Error("not found: " + marker);
  let depth = 0, i = src.indexOf("{", marker.includes("=[") ? a + marker.length - 1 : a), open = src[i], close = open === "[" ? "]" : "}";
  if (marker.includes("=[")) { i = a + marker.length - 1; open = "["; close = "]"; }
  const start = i;
  for (; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) break;
  }
  const ctx = vm.createContext({ ...globals });
  return { text: src.slice(start, i + 1), run: (code: string) => vm.runInContext(code, ctx), ctx };
}
const arr = (src: string, name: string) => vm.runInNewContext("(" + lift(src, name + "=[").text + ")") as any[];

const groupFn = () => {
  const a = part2.indexOf("function _luGroupTabs(");
  const b = part2.indexOf("function _luAdvTabsOn(");
  return vm.runInNewContext("(" + part2.slice(a, b) + ")") as (g: any[], active: string, adv: string[], show: boolean) => any;
};

describe("grouped tabs", () => {
  const cases: [string, any[], any[]][] = [
    ["PM project", arr(pm, "var PM_TABS"), arr(pm, "var PM_TAB_GROUPS")],
    ["PM portfolio", arr(pm, "var PM_ALL_TABS"), arr(pm, "var PM_ALL_TAB_GROUPS")],
  ];
  it.each(cases)("%s: every tab is in exactly one group", (_n, tabs, groups) => {
    const grouped = groups.flatMap((g) => g.tabs).sort();
    expect(grouped).toEqual(tabs.map((t) => t.id).sort());
  });
  it("Money: every tab is in exactly one group", () => {
    const line = part2.split("\n").find((l) => l.includes("const tabs=[['overview','Overview']"))!;
    const ids = Array.from(line.matchAll(/\['([a-z]+)',/g)).map((m) => m[1]).sort();
    const grouped = arr(part2, "const _FIN_TAB_GROUPS").flatMap((g) => g.tabs).sort();
    expect(ids.length).toBe(11);
    expect(grouped).toEqual(ids);
  });
  const g = [{ id: "a", label: "A", tabs: ["one", "adv1"] }, { id: "b", label: "B", tabs: ["adv2"] }, { id: "c", label: "C", tabs: ["two", "three"] }];
  it("hides advanced tabs and any group left empty", () => {
    const r = groupFn()(g, "one", ["adv1", "adv2"], false);
    expect(r.current.id).toBe("a");
    expect(r.sub).toEqual(["one"]);
    expect(r.hidden).toBe(1);
    expect(r.groups.map((x: any) => x.id)).toEqual(["a", "c"]);
  });
  it("never hides the tab you are on, so a deep link can't land on nothing", () => {
    const r = groupFn()(g, "adv2", ["adv1", "adv2"], false);
    expect(r.current.id).toBe("b");
    expect(r.sub).toEqual(["adv2"]);
    expect(r.groups.map((x: any) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("shows everything when asked", () => {
    const r = groupFn()(g, "one", ["adv1", "adv2"], true);
    expect(r.sub).toEqual(["one", "adv1"]);
    expect(r.hidden).toBe(0);
  });
  it("a group click lands on a tab that is showing", () => {
    const r = groupFn()(g, "one", ["adv1"], false);
    expect(r.first({ tabs: ["adv1", "two"] })).toBe("two");
  });
});

describe("one sidebar entry for each merged area", () => {
  const sidebar = html.slice(html.indexOf('id="sb-tpl"'));
  it("Today replaces Home, Planner, Focus and Command Center", () => {
    expect(sidebar).toMatch(/data-n="home"[^\n]*<span class="l">Today<\/span>/);
    for (const gone of ["myday", "focus", "command", "programs"]) expect(sidebar).not.toContain(`class="si" data-n="${gone}"`);
  });
  it("the tours still have their target", () => {
    expect(sidebar).toMatch(/data-n="home" data-tour-id="nav-myday"/);
  });
  const pages = vm.runInNewContext("(" + lift(home, "const LU_PAGES=[").text + ")") as any[];
  it("merged views stay routable, can't be hidden, and aren't in the sidebar list", () => {
    for (const id of ["myday", "focus", "standup", "command", "programs"]) {
      const p = pages.find((x) => x.id === id);
      expect(p, id).toBeTruthy();
      expect(p.nav, id).toBe(false);
      expect(p.core, id).toBe(true);
    }
  });
  it("old Programs links land in the Portfolio", () => {
    expect(core).toMatch(/function nav\(s\)\{[\s\S]{0,200}if\(s==='programs'\)\{if\(typeof openPM==='function'\)\{openPM\('all','programs'\);return;\}/);
    expect(html).not.toContain('id="s-programs"');
    expect(pm).toContain('id="prog-main"');
  });
});

describe("one hand-off", () => {
  it("GTD's prompt() is gone and every task control uses handOff", () => {
    const fn = core.slice(core.indexOf("function delegateTask(id){"), core.indexOf("function delegateTask(id){") + 120);
    expect(fn).toContain("handOff(id)");
    expect(fn).not.toContain("prompt(");
    expect(pm).toContain("b.onclick=function(e){e.preventDefault();handOff(t.id);};");
  });
  it("puts a task in a teammate's LevelUp by user id, not by name", () => {
    const a = pm.indexOf("function _pmHandoffAssign(");
    const b = pm.indexOf("function _pmHandoffUnassign(");
    const c = pm.indexOf("async function pmDelegateDialog(");
    const ctx = vm.createContext({ _assigneeMembers: () => [{ userId: 42, name: "Sam" }, { userId: 43, name: "Sam" }] });
    vm.runInContext(pm.slice(a, c), ctx);
    const run = (code: string) => vm.runInContext(code, ctx);
    ctx.t = {}; ctx.d = {};
    run("_pmHandoffAssign(t,d,'u:43')");
    expect(ctx.t.assignees).toEqual([43]);
    expect(ctx.t.primaryAssigneeId).toBe(43);
    expect(ctx.d.assignedUserId).toBe(43);
    run("_pmHandoffUnassign(t,d)");
    expect(ctx.t.assignees).toEqual([]);
    expect(ctx.t.primaryAssigneeId).toBeNull();
    expect(b).toBeGreaterThan(a);
  });
  it("leaves someone who was already on the task when cancelled, and ignores non-members", () => {
    const a = pm.indexOf("function _pmHandoffAssign(");
    const c = pm.indexOf("async function pmDelegateDialog(");
    const ctx = vm.createContext({ _assigneeMembers: () => [{ userId: 42, name: "Sam" }] });
    vm.runInContext(pm.slice(a, c), ctx);
    ctx.t = { assignees: [42], assigneeNames: ["Sam"], primaryAssigneeId: 42 }; ctx.d = {};
    vm.runInContext("_pmHandoffAssign(t,d,'u:42');_pmHandoffUnassign(t,d)", ctx);
    expect(ctx.t.assignees).toEqual([42]);
    ctx.t = {}; ctx.d = {};
    vm.runInContext("_pmHandoffAssign(t,d,'c:9');_pmHandoffAssign(t,d,'u:999')", ctx);
    expect(ctx.t.assignees).toBeUndefined();
  });
});

describe("one AI entry point", () => {
  it("the topbar opens the assistant; there's no separate Ask overlay or menu", () => {
    expect(html).toMatch(/id="topbar-ask-btn" onclick="toggleAIPanel\(\)"/);
    expect(html).not.toContain("topbar-ai-menu");
    expect(core).not.toContain("ask-lu-ov");
    expect(html).toContain('id="ai-sources"');
  });
  it("sources are opened by type and id: nothing executable is saved in chat history", () => {
    const agent = js("app-agent.js");
    const a = agent.indexOf("_agentPush({role:'assistant',content:r.answer,sources:");
    expect(a).toBeGreaterThan(0);
    expect(agent.slice(a, agent.indexOf("\n", a))).not.toContain("openFn");
  });
});
