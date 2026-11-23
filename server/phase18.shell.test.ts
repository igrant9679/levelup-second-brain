/**
 * Builds -291..-293: the frame around the app.
 *
 *   -291  no font request to another site; an outline of the app while it loads
 *   -292  pinned pages, the phone tab bar, first-run messages, the get-started
 *         list, and the end of the one-time example-task seeder
 *   -293  ONE focus timer (the Planner's bar and the Focus page are two views
 *         of it) and ONE timeline of every project
 *
 * These run the SHIPPED client code in a vm, the same way phase14 / phase16 do
 * (there is no DOM library here; what needs a real page is in the browser
 * guards: check:screens, check:a11y, check:assistant).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

const read = (rel: string, enc: BufferEncoding = "utf8") => fs.readFileSync(path.join(__dirname, "..", rel), enc).replace(/\r\n/g, "\n");
const shell = read("client/public/js/app-shell.js");
const review = read("client/public/js/app-6-review.js");
const tasksJs = read("client/public/js/app-2-home-tasks.js");
const workJs = read("client/public/js/app-4-work.js");
const part2 = read("client/public/js/app-part2.js");
const indexHtml = read("client/index.html");

function lift(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found`);
  let depth = 0;
  for (let i = src.indexOf("{", start); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error(`could not read ${name}`);
}

// ── pinned pages, tab bar, get started ──────────────────────────────────────
const PAGES = [
  { id: "home", label: "Today", nav: true, core: true },
  { id: "tasks", label: "Tasks", nav: true },
  { id: "projects", label: "Projects", nav: true },
  { id: "atlas", label: "Atlas", nav: true },
  { id: "notes", label: "Notes", nav: true },
  { id: "calendar", label: "Calendar", nav: true },
  { id: "goals", label: "Goals", nav: true },
  { id: "money", label: "Money", nav: true },
  { id: "programs", label: "Programs", nav: false, core: true },
  { id: "myweek", label: "My Week", nav: false, core: true },
];
function shellCtx(opts: { prefs?: any; off?: string[]; atlas?: string | null; data?: any; ready?: boolean } = {}) {
  const saves: string[] = [];
  const ctx: any = {
    console, JSON, Object, Array, String, Math, Date, setTimeout,
    D: { prefs: opts.prefs ?? {}, tasks: [], notes: [], projects: [], ...(opts.data || {}) },
    LU_PAGES: PAGES,
    luPageOn: (id: string) => !(opts.off || []).includes(id),
    luPageDef: (id: string) => PAGES.find((p) => p.id === id) || null,
    save: (k: string) => { saves.push(k); },
    toast: () => {},
    curScreen: "tasks",
    _calEvents: opts.data?.cal ?? [],
    _serverSyncReady: opts.ready ?? true,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: {
      body: { getAttribute: (k: string) => (k === "data-ws-atlas" ? (opts.atlas ?? null) : null), classList: { contains: () => false } },
      getElementById: () => null, querySelectorAll: () => [],
    },
    _luShellWired: true,          // the wiring (DOM listeners, wrappers) is not what is tested here
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(shell, ctx);
  ctx._saves = saves;
  return ctx;
}

describe("pinned pages (-292)", () => {
  it("shows only pins that can be shown, once each, in the stored order — and never writes while reading", () => {
    const c = shellCtx({ prefs: { pinnedPages: ["notes", "nope", "tasks", "notes", 7, "programs", "money"] }, off: ["money"] });
    expect(Array.from(c.luPinnedPages())).toEqual(["notes", "tasks"]);
    expect(c._saves).toEqual([]);
    expect(c.D.prefs.pinnedPages.length).toBe(7);               // the stored list is untouched
  });
  it("Atlas can be pinned only in the workspace that has it", () => {
    expect(Array.from(shellCtx({ prefs: { pinnedPages: ["atlas"] }, atlas: "0" }).luPinnedPages())).toEqual([]);
    expect(Array.from(shellCtx({ prefs: { pinnedPages: ["atlas"] }, atlas: "1" }).luPinnedPages())).toEqual(["atlas"]);
    expect(Array.from(shellCtx({ prefs: { pinnedPages: ["atlas"] } }).luPinnedPages())).toEqual(["atlas"]);
  });
  it("pins and unpins, keeps prefs sparse, and can pin a page that has no sidebar entry", () => {
    const c = shellCtx();
    c.luPinToggle("notes"); c.luPinToggle("myweek");
    expect(Array.from(c.D.prefs.pinnedPages)).toEqual(["notes", "myweek"]);
    c.luPinToggle("unknown-page");
    expect(Array.from(c.D.prefs.pinnedPages)).toEqual(["notes", "myweek"]);
    c.luPinToggle("notes"); c.luPinToggle("myweek");
    expect("pinnedPages" in c.D.prefs).toBe(false);             // nothing pinned = nothing stored
    expect(c._saves.every((k: string) => k === "prefs")).toBe(true);
  });
  it("moves a pin up and down, and stops at the ends", () => {
    const c = shellCtx({ prefs: { pinnedPages: ["tasks", "notes", "goals"] } });
    c.luPinMove("goals", -1);
    expect(Array.from(c.D.prefs.pinnedPages)).toEqual(["tasks", "goals", "notes"]);
    c.luPinMove("tasks", -1);                                    // already first
    expect(Array.from(c.D.prefs.pinnedPages)).toEqual(["tasks", "goals", "notes"]);
    c.luPinMove("tasks", 1);
    expect(Array.from(c.D.prefs.pinnedPages)).toEqual(["goals", "tasks", "notes"]);
  });
});

describe("the phone tab bar (-292)", () => {
  it("is Today, Tasks, Notes, Calendar when nothing is pinned", () => {
    expect(Array.from(shellCtx().luTabPages())).toEqual(["home", "tasks", "notes", "calendar"]);
  });
  it("puts pinned pages first and tops up with the defaults, four at most", () => {
    expect(Array.from(shellCtx({ prefs: { pinnedPages: ["money", "goals"] } }).luTabPages())).toEqual(["money", "goals", "home", "tasks"]);
    expect(Array.from(shellCtx({ prefs: { pinnedPages: ["money", "goals", "notes", "tasks", "calendar"] } }).luTabPages())).toEqual(["money", "goals", "notes", "tasks"]);
  });
  it("never offers a page that is switched off", () => {
    expect(Array.from(shellCtx({ off: ["notes", "calendar"] }).luTabPages())).toEqual(["home", "tasks", "projects", "goals"]);
  });
});

describe("the get-started list (-292)", () => {
  it("waits for the server's answer, so a returning account on a new device never sees it", () => {
    expect(shellCtx({ ready: false })._luStartWanted()).toBe(false);
    expect(shellCtx({ ready: true })._luStartWanted()).toBe(true);
  });
  it("ticks each basic off from the workspace's own data and goes away when all four are done", () => {
    const c = shellCtx({ data: { tasks: [{ id: 1 }], notes: [{ id: 1 }] } });
    const done = Object.fromEntries(c._luStartSteps().map((s: any) => [s.k, s.done]));
    expect(done).toMatchObject({ task: true, note: true, project: false, calendar: false });
    expect(c._luStartWanted()).toBe(true);
    const all = shellCtx({ data: { tasks: [{ id: 1 }], notes: [{ id: 1 }], projects: [{ id: 1 }], cal: [{ id: 1 }] } });
    expect(all._luStartWanted()).toBe(false);
  });
  it("stays out of an established workspace, and stays hidden once hidden", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ id: i }));
    expect(shellCtx({ data: { tasks: many } })._luStartWanted()).toBe(false);          // lots of tasks, no projects
    expect(shellCtx({ prefs: { startCard: { off: true } } })._luStartWanted()).toBe(false);
    const c = shellCtx();
    c.document.getElementById = () => null;
    c.luStartHide();
    expect(c.D.prefs.startCard.off).toBe(true);
    expect(c._luStartWanted()).toBe(false);
  });
  it("offers Invite a teammate to an owner or admin only", () => {
    const keys = (me: any) => { const c = shellCtx(); c._luMe = me; return c._luStartSteps().map((s: any) => s.k); };
    expect(keys({ isOwner: true })).toContain("invite");
    expect(keys({ role: "admin" })).toContain("invite");
    expect(keys({ role: "user" })).not.toContain("invite");
    expect(keys(null)).not.toContain("invite");
  });
});

// ── first-run messages ──────────────────────────────────────────────────────
describe("first-run messages (-292)", () => {
  const run = (src: string, fn: string, D: any) => {
    const ctx: any = { D, renderEmptyState: (o: any) => "ES:" + o.title + "|" + o.ctaFn };
    vm.runInNewContext(lift(src, fn) + `\nthis.out=${fn}();`, ctx);
    return ctx.out as string;
  };
  it("Tasks: a workspace with no tasks is told what a task is; one with tasks keeps its filter messages", () => {
    expect(run(tasksJs, "_luTasksEmpty", { tasks: [] })).toBe("ES:No tasks yet|openFA('task')");
    expect(run(tasksJs, "_luTasksEmpty", { tasks: [{ id: 1 }] })).toBe("");
    expect(run(tasksJs, "_luTasksEmpty", {})).toBe("ES:No tasks yet|openFA('task')");
  });
  it("Projects and Pipeline: the same", () => {
    expect(run(workJs, "_luProjectsEmpty", { projects: [] })).toBe("ES:No projects yet|openFA('project')");
    expect(run(workJs, "_luProjectsEmpty", { projects: [{ id: 1 }] })).toContain("No projects match your filters.");
    expect(run(workJs, "_luPipeEmpty", { opportunities: [] })).toBe("ES:No opportunities yet|_newOpportunity()");
    expect(run(workJs, "_luPipeEmpty", { opportunities: [{ id: 1 }] })).toBe("");
  });
  it("signing in no longer adds example tasks to the account", () => {
    const fn = lift(part2, "doLoginSuccess");
    expect(fn).not.toMatch(/exampleIds|D\.tasks\.push/);
    expect(fn).toContain("lu_examples_seeded_v1");               // the flag other code reads is still set
  });
});

// ── the page itself ─────────────────────────────────────────────────────────
describe("the page (-291, -292)", () => {
  it("loads nothing from another site when it opens", () => {
    const beforeLoader = indexHtml.slice(0, indexHtml.indexOf("var APP_BUILD="));
    expect(beforeLoader).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    expect(beforeLoader).not.toMatch(/<(script|link)[^>]+(src|href)="https?:\/\//i);
    expect(part2).not.toMatch(/fonts\.googleapis/);              // the note PDF export
  });
  it("shows an outline of the app to a browser that was signed in, and the plain state to everyone else", () => {
    expect(indexHtml).toContain('id="lu-boot-skel"');
    expect(indexHtml).toContain('id="lu-boot-plain"');
    const script = indexHtml.slice(indexHtml.indexOf("Runs before any app script"), indexHtml.indexOf('<div id="login-form-wrapper"'));
    const body = script.slice(script.indexOf("(function(){"), script.lastIndexOf("</script>"));
    const boot = (store: Record<string, string>, search = "") => {
      const els: any = { "lu-boot-plain": { style: { display: "flex" } }, "lu-boot-skel": { style: { display: "none" } }, "lu-boot-status": { textContent: "" } };
      const cls: string[] = [];
      vm.runInNewContext(body, {
        JSON, Date, localStorage: { getItem: (k: string) => (k in store ? store[k] : null) }, location: { search },
        document: { getElementById: (id: string) => els[id], body: { classList: { add: (c: string) => cls.push(c) } }, documentElement: { style: {} } },
      });
      return { skel: els["lu-boot-skel"].style.display, plain: els["lu-boot-plain"].style.display, cls };
    };
    const session = JSON.stringify({ memberId: 5, expires: Date.now() + 60000 });
    expect(boot({})).toMatchObject({ skel: "none", plain: "flex" });
    expect(boot({ lu_session: session })).toMatchObject({ skel: "flex", plain: "none" });
    expect(boot({ lu_session: JSON.stringify({ memberId: 5, expires: Date.now() - 1 }) }).skel).toBe("none");   // an old sign-in
    expect(boot({ lu_session: session }, "?reset_token=abc").skel).toBe("none");                                   // links with their own page
    expect(boot({ lu_session: session }, "?signup=abc").skel).toBe("none");
    expect(boot({ lu_session: "{broken" }).skel).toBe("none");                                                     // never throws
    expect(boot({ lu_prefs: JSON.stringify({ darkMode: false }) }).cls).toEqual(["light-mode"]);                   // no dark flash for light theme
    expect(boot({ lu_prefs: JSON.stringify({ darkMode: true }) }).cls).toEqual([]);
  });
  it("loads app-shell.js last", () => {
    const loader = indexHtml.slice(indexHtml.indexOf("['/js/vendor/purify.min.js'"));
    const list = loader.slice(0, loader.indexOf("]"));
    expect(list.trim().endsWith("'/js/app-shell.js'")).toBe(true);
  });
});

// ── one focus timer ─────────────────────────────────────────────────────────
describe("the focus timer: one timer, two views (-293)", () => {
  const block = review.slice(review.indexOf("// ====== THE FOCUS TIMER"), review.indexOf("function getWeekDates("));
  let ctx: any, toasts: any[], saves: string[], store: Record<string, string>;
  const boot = (tasks: any[] = [{ id: 7, title: "Write the report", status: "In Progress" }, { id: "ext-9", title: "Imported", status: "Not Started" }]) => {
    toasts = []; saves = []; store = {};
    ctx = {
      console, JSON, Object, Array, String, Math, parseInt,
      D: { prefs: {}, tasks },
      save: (k: string) => saves.push(k),
      toast: (t: any) => toasts.push(t),
      toggleTask: () => {},
      _ymd: (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"),
      localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } },
      document: { getElementById: () => null },
      curScreen: "myday",
      renderFocus: () => {},
      setInterval: (f: any, ms: number) => setInterval(f, ms),
      clearInterval: (id: any) => clearInterval(id),
      setTimeout: (f: any, ms: number) => setTimeout(f, ms),
    };
    Object.defineProperty(ctx, "Date", { get: () => Date });       // the faked clock
    vm.createContext(ctx);
    vm.runInContext(block + "\nthis.st=()=>({len:_focusLen,left:_focusSecsLeft,running:_focusRunning,brk:_focusBreak,session:_focusSession,task:_focusTaskId,mode:_focusMode(),sessions:_focusSessions});", ctx);
  };
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 23, 10, 0, 0)); boot(); });
  afterEach(() => { vi.useRealTimers(); });

  it("the Planner's buttons and the Focus page's buttons drive the same clock", () => {
    ctx.pomoToggle();                                             // started from Today > Do
    vi.advanceTimersByTime(60_000);
    expect(ctx.st()).toMatchObject({ running: true, left: 24 * 60 });
    ctx.toggleFocusTimer();                                       // paused from the Focus page
    expect(ctx.st().running).toBe(false);
    vi.advanceTimersByTime(600_000);
    expect(ctx.st().left).toBe(24 * 60);                          // a paused timer does not run on
    ctx.focusToggle();
    vi.advanceTimersByTime(60_000);
    expect(ctx.st()).toMatchObject({ running: true, left: 23 * 60 });
    ctx.pomoReset();
    expect(ctx.st()).toMatchObject({ running: false, left: 25 * 60 });
  });

  it("a finished focus session is recorded once: today's minutes, the hour, the task's time and the session list", () => {
    ctx.pomoSelectTask(7);
    ctx.focusToggle();
    vi.advanceTimersByTime(25 * 60_000 + 2000);
    const day = "2026-11-23";
    expect(ctx.D.prefs.focusLog[day]).toBe(25);
    expect(ctx.D.prefs.focusByHour[10]).toBe(25);
    expect(ctx.D.tasks[0].timeSpent).toBe(25);
    expect(ctx.st().sessions).toHaveLength(1);
    expect(ctx.st().sessions[0]).toMatchObject({ date: day, mins: 25, taskId: 7, taskTitle: "Write the report" });
    expect(JSON.parse(store.lu_focus_sessions)).toHaveLength(1);
    expect(saves.filter((k) => k === "prefs")).toHaveLength(1);
    vi.advanceTimersByTime(5 * 60_000);                           // nothing more is logged while it sits there
    expect(ctx.D.prefs.focusLog[day]).toBe(25);
    // the task is offered for completion, never marked done
    expect(ctx.D.tasks[0].status).toBe("In Progress");
    expect(toasts.some((t) => t && t.title && /Session done on/.test(t.title))).toBe(true);
  });

  it("queues a break that is not counted, then goes back to 25 minutes of focus", () => {
    ctx.focusToggle();
    vi.advanceTimersByTime(25 * 60_000 + 2000);
    expect(ctx.st()).toMatchObject({ brk: true, len: 5 * 60, left: 5 * 60, running: false, session: 2, mode: "b5" });
    ctx.focusToggle();
    vi.advanceTimersByTime(5 * 60_000 + 2000);
    expect(ctx.st()).toMatchObject({ brk: false, len: 25 * 60, running: false, mode: "f25" });
    expect(ctx.D.prefs.focusLog["2026-11-23"]).toBe(25);          // the break added nothing
    expect(ctx.st().sessions).toHaveLength(1);
  });

  it("gives a long break after every fourth session", () => {
    for (let i = 0; i < 4; i++) {
      ctx.focusSetMode("f25"); ctx.focusToggle();
      vi.advanceTimersByTime(25 * 60_000 + 2000);
      if (i < 3) expect(ctx.st()).toMatchObject({ mode: "b5", session: i + 2 });
    }
    expect(ctx.st()).toMatchObject({ mode: "b15", session: 1 });
    expect(ctx.D.prefs.focusLog["2026-11-23"]).toBe(100);
  });

  it("records the length that was chosen, and a short timer chosen as focus is focus", () => {
    ctx.pomoSetMode("f50"); ctx.focusToggle();
    vi.advanceTimersByTime(50 * 60_000 + 2000);
    expect(ctx.D.prefs.focusLog["2026-11-23"]).toBe(50);
    ctx.focusSetMode("f15"); ctx.focusToggle();
    vi.advanceTimersByTime(15 * 60_000 + 2000);
    expect(ctx.D.prefs.focusLog["2026-11-23"]).toBe(65);
    ctx.focusSetMode("b15"); ctx.focusToggle();                   // the same length as a break adds nothing
    vi.advanceTimersByTime(15 * 60_000 + 2000);
    expect(ctx.D.prefs.focusLog["2026-11-23"]).toBe(65);
    ctx.pomoSetMode("5");                                         // the old select values still mean what they meant
    expect(ctx.st().mode).toBe("b5");
    ctx.pomoSetMode("25");
    expect(ctx.st().mode).toBe("f25");
  });

  it("works with a task whose id is text, and with no task at all", () => {
    ctx.focusSelectTask("ext-9"); ctx.focusToggle();
    vi.advanceTimersByTime(25 * 60_000 + 2000);
    expect(ctx.D.tasks[1].timeSpent).toBe(25);
    ctx.focusSelectTask(null); ctx.focusSetMode("f25"); ctx.focusToggle();
    vi.advanceTimersByTime(25 * 60_000 + 2000);
    expect(ctx.st().sessions[1]).toMatchObject({ taskId: null, taskTitle: "Free focus" });
    expect(ctx.D.prefs.focusLog["2026-11-23"]).toBe(50);
  });

  it("keeps time by the clock, so a tab that slept still finishes on time", () => {
    ctx.focusToggle();
    vi.setSystemTime(new Date(2026, 10, 23, 10, 24, 59));          // the tab was asleep for 25 minutes
    vi.advanceTimersByTime(2000);
    expect(ctx.st().brk).toBe(true);
    expect(ctx.D.prefs.focusLog["2026-11-23"]).toBe(25);
  });

  it("there is one countdown in the file, and no second set of timer state", () => {
    expect(review.match(/setInterval\(/g)?.length ?? 0).toBeGreaterThan(0);
    expect(review).not.toMatch(/_pomo(Secs|Total|Running|Interval|TaskId)\b/);
    expect((review.match(/let _focusLen=/g) || []).length).toBe(1);
  });
});

// ── one timeline of every project ───────────────────────────────────────────
describe("one timeline of every project (-293)", () => {
  it("Portfolio > Programs links to it instead of drawing its own copy", () => {
    const programs = workJs.slice(workJs.indexOf("const empty=programs.length?''"), workJs.indexOf("// ─── Portfolio Timeline"));
    expect(programs).toContain("_luTimelineMoved()");
    expect(programs).not.toContain("_renderPortfolioTimeline(");
    const callers = workJs.match(/_renderPortfolioTimeline\(/g) || [];
    expect(callers.length).toBe(2);                               // its definition + the Projects page
  });
  it("remembers which of the two settings was last used, and falls back to one bar per project", () => {
    const mode = (v: string | null, throws = false) => {
      const ctx: any = { localStorage: { getItem: () => { if (throws) throw new Error("blocked"); return v; } } };
      vm.runInNewContext(lift(workJs, "_luProjTlMode") + "\nthis.out=_luProjTlMode();", ctx);
      return ctx.out;
    };
    expect(mode(null)).toBe("bars");
    expect(mode("tasks")).toBe("tasks");
    expect(mode("anything-else")).toBe("bars");
    expect(mode(null, true)).toBe("bars");
  });
  it("a project on the timeline opens that project's own schedule", () => {
    const calls: any[] = [];
    const ctx: any = { D: { projects: [{ id: 3 }, { id: 4, archived: true }] }, luPageOn: () => true, openPM: (k: string, t: string) => calls.push([k, t]), openProjectDetail: (id: number) => calls.push(["drawer", id]) };
    vm.runInNewContext(lift(workJs, "openProject") + "\nopenProject(3,'schedule');openProject(3);openProject(4,'schedule');", ctx);
    expect(calls).toEqual([["p:3", "schedule"], ["p:3", "overview"], ["drawer", 4]]);
  });
});
