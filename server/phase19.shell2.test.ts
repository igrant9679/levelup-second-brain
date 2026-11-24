/**
 * Build -294: six more pieces of the frame.
 *
 *   1  a browser that has never opened LevelUp starts in the device's light or
 *      dark setting; a stored choice always wins
 *   2  swipe a task on a phone: right = complete / reopen, left = snooze, both
 *      with Undo
 *   3  one offer per device to install LevelUp as an app
 *   4  a search box in Settings
 *   5  outlines where panels used to say "Loading…"
 *   6  every toast is also written into a live region for screen readers
 *
 * As in phase18: the SHIPPED client code, run in a vm. What needs a real page
 * (touch events, the search box's keyboard, the browser's install event) was
 * driven in headless Chrome when the build was made — see CLAUDE.md, -294.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

const read = (rel: string, enc: BufferEncoding = "utf8") => fs.readFileSync(path.join(__dirname, "..", rel), enc).replace(/\r\n/g, "\n");
const shell = read("client/public/js/app-shell.js");
const core = read("client/public/js/app-1-core.js", "latin1");
const tasksJs = read("client/public/js/app-2-home-tasks.js");
const part2 = read("client/public/js/app-part2.js");
const indexHtml = read("client/index.html");
const BUNDLE_DIR = path.join(__dirname, "..", "client", "public", "js");

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

/** The shell bundle in a sandbox, its wiring switched off. */
function shellCtx(extra: any = {}) {
  const toasts: any[] = [];
  const calls: string[] = [];
  const ctx: any = {
    console, JSON, Object, Array, String, Math, Date, Number, setTimeout: (f: any) => { f(); return 0; }, clearTimeout: () => {},
    D: { prefs: {}, tasks: [], notes: [], projects: [] },
    LU_PAGES: [], luPageOn: () => true, luPageDef: () => null, save: () => {},
    toast: (o: any) => { toasts.push(o); },
    curScreen: "tasks",
    _serverSyncReady: true,
    localStorage: { getItem: () => null, setItem: () => {} },
    document: { body: { getAttribute: () => null, classList: { contains: () => false } }, getElementById: () => null, querySelectorAll: () => [] },
    _luShellWired: true, _luShell2Wired: true,
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(shell, ctx);
  ctx._toasts = toasts; ctx._calls = calls;
  return ctx;
}

// ── 1. the first-time theme ────────────────────────────────────────────────
describe("the first-time theme follows the device (-294)", () => {
  const firstPrefs = (media: ((q: string) => { matches: boolean }) | null | "throws") => {
    const ctx: any = { JSON, window: {} as any };
    if (media === "throws") ctx.window.matchMedia = () => { throw new Error("no"); };
    else if (media) ctx.window.matchMedia = media;
    vm.runInNewContext(lift(core, "_luDeviceLight") + "\n" + lift(core, "_luFirstPrefs") + "\nthis.out=_luFirstPrefs();", ctx);
    return JSON.parse(ctx.out);
  };
  it("a light device starts light, a dark one dark", () => {
    expect(firstPrefs((q) => ({ matches: q === "(prefers-color-scheme: light)" }))).toEqual({ darkMode: false, compact: false, accent: "#3B82F6" });
    expect(firstPrefs(() => ({ matches: false }))).toEqual({ darkMode: true, compact: false, accent: "#3B82F6" });
  });
  it("a browser that cannot say stays on the dark default", () => {
    expect(firstPrefs(null).darkMode).toBe(true);
    expect(firstPrefs("throws").darkMode).toBe(true);
  });
  it("is only the fallback for a browser with nothing stored", () => {
    expect(core).toContain("prefs: JSON.parse(localStorage.getItem('lu_prefs') || _luFirstPrefs()),");
    expect(core).not.toContain(`'{"darkMode":true,"compact":false,"accent":"#3B82F6"}'`);
  });
  it("the start-up script applies the same rule before any bundle loads", () => {
    const at = indexHtml.indexOf("var lite=p?p.darkMode===false:");
    expect(at).toBeGreaterThan(0);
    expect(indexHtml.slice(at, at + 160)).toContain("(prefers-color-scheme: light)");
    expect(at).toBeLessThan(indexHtml.indexOf("/js/app-1-core.js"));
    // a stored choice is read first: p ? stored : device
    expect(indexHtml.slice(at - 400, at)).toContain("localStorage.getItem('lu_prefs')");
  });
  it("the browser guards still run on the dark default", () => {
    expect(read("scripts/lib/headless.mjs")).toMatch(/setEmulatedMedia', \{ features: \[\{ name: 'prefers-color-scheme', value: 'dark' \}\] \}/);
  });
});

// ── 2. swipe a task ────────────────────────────────────────────────────────
describe("swiping a task (-294)", () => {
  const ctxWith = (tasks: any[]) => {
    const calls: string[] = [];
    const c = shellCtx({
      toggleTask: (id: any) => { calls.push("toggle:" + id); const t = c.D.tasks.find((x: any) => x.id === id); t.status = t.status === "Done" ? "Not Started" : "Done"; },
      snoozeTask: (id: any) => { calls.push("snooze:" + id); },
      setTaskStatus: (t: any, st: string) => { calls.push("set:" + t.id + ":" + st); t.status = st; },
      renderScreen: () => {},
      renderCurrentTaskView: () => {},
    });
    c.D.tasks = tasks;
    return { c, calls };
  };
  it("needs a real pull: about a third of the row, never less than 72px or more than 130px", () => {
    const c = shellCtx();
    expect(c._luSwipeThreshold(100)).toBe(72);
    expect(Math.round(c._luSwipeThreshold(300))).toBe(102);
    expect(c._luSwipeThreshold(900)).toBe(130);
  });
  it("says what letting go will do", () => {
    const c = shellCtx();
    expect(c._luSwipeLabel("r", { status: "Not Started" })).toContain("Done");
    expect(c._luSwipeLabel("r", { status: "Done" })).toContain("Reopen");
    expect(c._luSwipeLabel("l", { status: "Not Started" })).toContain("Tomorrow");
  });
  it("right completes the task and offers Undo, which puts it back", () => {
    const { c, calls } = ctxWith([{ id: 7, title: "Call the bank", status: "Not Started" }]);
    c._luSwipeAct(7, "r");
    expect(calls).toEqual(["toggle:7"]);
    expect(c.D.tasks[0].status).toBe("Done");
    const t = c._toasts[0];
    expect(t.title).toBe("Task completed"); expect(t.msg).toBe("Call the bank");
    expect(t.actions.map((a: any) => a.label)).toEqual(["Undo"]);
    t.actions[0].onClick();
    expect(c.D.tasks[0].status).toBe("Not Started");
    t.actions[0].onClick();                                   // a second press does nothing
    expect(calls).toEqual(["toggle:7", "set:7:Not Started"]);
  });
  it("Undo gives a task back the status it had, not just “not done”", () => {
    const { c } = ctxWith([{ id: 8, title: "Draft the plan", status: "In Progress" }]);
    c._luSwipeAct(8, "r");
    expect(c.D.tasks[0].status).toBe("Done");
    c._toasts[0].actions[0].onClick();
    expect(c.D.tasks[0].status).toBe("In Progress");
    const again = ctxWith([{ id: 9, title: "Old", status: "Done" }]);
    again.c._luSwipeAct(9, "r");                              // reopened…
    again.c._toasts[0].actions[0].onClick();                  // …and Undo completes it again
    expect(again.c.D.tasks[0].status).toBe("Done");
  });
  it("right on a completed task reopens it", () => {
    const { c } = ctxWith([{ id: "a1", title: "Old", status: "Done" }]);
    c._luSwipeAct("a1", "r");
    expect(c.D.tasks[0].status).toBe("Not Started");
    expect(c._toasts[0].title).toBe("Task reopened");
  });
  it("a repeating task is completed without an Undo button (its next copy would stay behind)", () => {
    const { c } = ctxWith([{ id: 3, title: "Weekly report", status: "Not Started", recurring: "Weekly" }]);
    c._luSwipeAct(3, "r");
    expect(c.D.tasks[0].status).toBe("Done");
    expect(c._toasts[0].actions).toBeUndefined();
  });
  it("left snoozes, and a swipe on a task that is gone does nothing", () => {
    const { c, calls } = ctxWith([{ id: 7, title: "x", status: "Not Started" }]);
    c._luSwipeAct(7, "l");
    c._luSwipeAct(99, "r"); c._luSwipeAct(99, "l");
    expect(calls).toEqual(["snooze:7"]);
  });
  it("only on the Tasks page, never while selecting several, never from a control or the drag handle", () => {
    const row = { id: "row", closest: (s: string) => (s === "#tasks-list" ? {} : null) };
    const el = (inControl: boolean) => ({ closest: (s: string) => (s.startsWith("button,") ? (inControl ? {} : null) : s.startsWith(".tlc[data-task-id]") ? row : null) });
    expect(shellCtx()._luSwipeRow(el(false))).toBe(row);
    expect(shellCtx()._luSwipeRow(el(true))).toBeNull();
    expect(shellCtx({ curScreen: "home" })._luSwipeRow(el(false))).toBeNull();
    expect(shellCtx({ _bulkMode: true })._luSwipeRow(el(false))).toBeNull();
    // rows from other tools carry data-ext-id, not data-task-id: the selector never matches them
    expect(lift(shell, "_luSwipeRow")).toContain(".tlc[data-task-id],.cl-task-row[data-task-id]");
  });
  it("snoozing (from anywhere) can be undone: the due date, the snooze and My Day come back", () => {
    const toasts: any[] = []; const saves: string[] = [];
    const D = { tasks: [{ id: 5, title: "Pay rent", due: "2026-11-20", myDay: true }] as any[] };
    const ctx: any = {
      D, Date, toast: (o: any) => toasts.push(o), save: (k: string) => saves.push(k), invalidateSearchIndex: () => {},
      renderScreen: () => {}, renderCurrentTaskView: () => {}, curScreen: "tasks",
      _ymd: (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"),
    };
    vm.runInNewContext(lift(tasksJs, "snoozeTask") + "\nsnoozeTask(5);", ctx);
    const t = D.tasks[0];
    expect(t.myDay).toBe(false); expect(t.snoozeUntil).toMatch(/^\d{4}-\d\d-\d\d$/); expect(t.due).toBe("2026-11-20");
    expect(toasts[0].title).toMatch(/^Snoozed until tomorrow/);
    expect(toasts[0].actions[0].label).toBe("Undo");
    toasts[0].actions[0].onClick();
    expect(t).toEqual({ id: 5, title: "Pay rent", due: "2026-11-20", myDay: true });   // snoozeUntil is gone, not left as undefined
    expect(saves).toEqual(["tasks", "tasks"]);
  });
});

// ── 3. install ─────────────────────────────────────────────────────────────
describe("installing LevelUp as an app (-294)", () => {
  const c = shellCtx();
  it("offers the browser's own dialog where there is one, the Home Screen steps on an iPhone, nothing once installed", () => {
    expect(c._luInstallMode(false, true, false)).toBe("prompt");
    expect(c._luInstallMode(false, true, true)).toBe("prompt");
    expect(c._luInstallMode(false, false, true)).toBe("ios");
    expect(c._luInstallMode(false, false, false)).toBe("none");
    expect(c._luInstallMode(true, true, true)).toBe("none");
  });
  it("asks by itself once: from the second visit, signed in, and never again", () => {
    expect(c._luInstallDue("prompt", null, 2, true)).toBe(true);
    expect(c._luInstallDue("ios", null, 5, true)).toBe(true);
    expect(c._luInstallDue("prompt", null, 1, true)).toBe(false);          // first visit
    expect(c._luInstallDue("prompt", null, 2, false)).toBe(false);         // the sign-in page
    expect(c._luInstallDue("prompt", "1763900000000", 9, true)).toBe(false); // already asked
    expect(c._luInstallDue("none", null, 9, true)).toBe(false);
  });
  it("the page keeps the browser's install event from the very start", () => {
    const at = indexHtml.indexOf("addEventListener('beforeinstallprompt'");
    expect(at).toBeGreaterThan(0);
    expect(indexHtml.slice(at, at + 120)).toContain("window._luInstallEvt=e");
    expect(at).toBeLessThan(indexHtml.indexOf("/js/app-1-core.js"));
  });
  it("with nothing to install, the command still explains instead of failing", () => {
    const k = shellCtx({ navigator: { userAgent: "Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0", platform: "Linux", maxTouchPoints: 0 } });
    expect(k.luInstallMode()).toBe("none");
    k.luInstall();
    expect(k._toasts[0].title).toMatch(/browser.s menu/);
    const ios = shellCtx({ navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1", platform: "iPhone", maxTouchPoints: 5, standalone: false } });
    expect(ios.luInstallMode()).toBe("ios");
    ios.luInstall();
    expect(ios._toasts[0].msg).toContain("Add to Home Screen");
    const onHome = shellCtx({ navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1", platform: "iPhone", maxTouchPoints: 5, standalone: true } });
    expect(onHome.luInstallMode()).toBe("none");
  });
});

// ── 4. settings search ─────────────────────────────────────────────────────
describe("settings search (-294)", () => {
  const c = shellCtx();
  const E = (sec: string, secLabel: string, label: string, kind: string, extra = "") => ({ sec, secLabel, label, kind, el: null, lab: label.toLowerCase(), hay: (label + " " + extra).toLowerCase() });
  const index = [
    E("sp-3", "Notifications", "Notifications", "sec", c._LU_SET_WORDS["sp-3"]),
    E("sp-3", "Notifications", "Daily Digest", "row", "Morning summary of tasks, habits, and goals for the day"),
    E("sp-3", "Notifications", "Daily Digest Time", "row", "When the digest is sent"),
    E("sp-0", "Profile", "Profile", "sec", c._LU_SET_WORDS["sp-0"]),
    E("sp-0", "Profile", "Time Zone", "row", "Time Zone — Select —"),
    E("sp-2", "Appearance", "Appearance", "sec", c._LU_SET_WORDS["sp-2"]),
    E("sp-14", "Bank Connections", "Bank Connections", "sec", c._LU_SET_WORDS["sp-14"]),
    E("sp-10", "Backup", "Download everything", "button"),
  ];
  const labels = (q: string, max?: number) => Array.from(c._luSetSearch(index, q, max)).map((e: any) => e.label + "@" + e.sec);
  it("finds a setting by its name, best match first", () => {
    expect(labels("digest")).toEqual(["Daily Digest@sp-3", "Daily Digest Time@sp-3", "Notifications@sp-3"]);
    expect(labels("daily digest time")[0]).toBe("Daily Digest Time@sp-3");
    expect(labels("Time Zone")[0]).toBe("Time Zone@sp-0");
  });
  it("finds a section by an everyday word, including panels that fill in only when opened", () => {
    expect(labels("theme")).toEqual(["Appearance@sp-2"]);
    expect(labels("dark mode")).toEqual(["Appearance@sp-2"]);
    expect(labels("simplefin")).toEqual(["Bank Connections@sp-14"]);
    expect(labels("password")).toEqual(["Profile@sp-0"]);
  });
  it("every word must match; one letter is not a search; the list is capped", () => {
    expect(labels("digest zebra")).toEqual([]);
    expect(labels("d")).toEqual([]);
    expect(labels("   ")).toEqual([]);
    expect(labels("di", 1).length).toBe(1);
  });
  it("has everyday words for every section in the Settings menu", () => {
    const ids = Array.from(lift(part2, "renderSettingsHTML").matchAll(/\{ic:'[^']+',lb:'[^']+',id:'(sp-\d+)'\}/g)).map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(16);
    for (const id of ids) expect(typeof c._LU_SET_WORDS[id], id).toBe("string");
  });
  it("reads the menu the way it is written", () => {
    // _luSetSections depends on this exact shape of the menu's click handler
    expect(lift(part2, "renderSettingsHTML")).toContain(`onclick="showSetTab(this,'\${_jsAttr(n.id)}')"`);
    expect(lift(shell, "_luSetSections")).toContain("showSetTab\\(this,'([^']+)'\\)");
  });
});

// ── 5. loading outlines ────────────────────────────────────────────────────
describe("loading outlines (-294)", () => {
  it("no panel is left saying only “Loading…”", () => {
    const left: string[] = [];
    for (const f of fs.readdirSync(BUNDLE_DIR).filter((x) => x.endsWith(".js"))) {
      const s = fs.readFileSync(path.join(BUNDLE_DIR, f), "latin1");
      const re = />Loading( [A-Za-z' ]{2,40})?(\xe2\x80\xa6|\.\.\.)<\/(div|p|span|b)>|\.(innerHTML|textContent)\s*=\s*'Loading(\xe2\x80\xa6|\.\.\.)'/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) left.push(f + ":" + s.slice(0, m.index).split("\n").length);
    }
    expect(left).toEqual([]);
  });
  it("the outline is named for screen readers and stands still for people who asked for less motion", () => {
    expect(part2).toContain('<span class="lu-skel" role="status" aria-label="Loading"><i></i><i></i><i></i></span>');
    const css = lift(shell, "_luShell2CSS");
    expect(css).toContain(".lu-skel i{");
    expect(css).toContain("@media (prefers-reduced-motion:reduce){.lu-skel i{animation:none");
  });
});

// ── 6. announcements ───────────────────────────────────────────────────────
describe("toasts are announced (-294)", () => {
  const c = shellCtx();
  it("says the title, the second line, and that an action is on offer", () => {
    expect(c._luToastSpeech({ title: "Task deleted", msg: "“Beta”", actions: [{ label: "Undo" }] })).toBe("Task deleted. “Beta”. Undo available");
    expect(c._luToastSpeech({ title: "Saved the note" })).toBe("Saved the note");
    expect(c._luToastSpeech({ msg: "Only a message." })).toBe("Only a message");
    expect(c._luToastSpeech({ title: "Install LevelUp", msg: "In its own window.", actions: [{ label: "Install" }, { label: "Not now" }] })).toBe("Install LevelUp. In its own window. Install, Not now available");
    expect(c._luToastSpeech(null)).toBe("");
    expect(c._luToastSpeech({})).toBe("");
  });
  it("is wired to every toast: polite for news, assertive for errors", () => {
    const wiring = shell.slice(shell.indexOf("/* ── wiring (-294)"));
    expect(wiring).toContain("window._showRichToast=function(opts){");
    expect(wiring).toContain("luAnnounce(say,opts&&opts.type==='error')");
    const init = lift(shell, "_luLiveInit");
    expect(init).toContain("mk('lu-live-polite','status','polite')");
    expect(init).toContain("mk('lu-live-alert','alert','assertive')");
    // toast() must still go through the function the wiring replaces
    expect(lift(core, "toast")).toContain("return _showRichToast(opts);");
  });
});

describe("the -294 code can't stop the app starting", () => {
  it("still loads last and only wraps what earlier bundles made", () => {
    const names = Array.from(indexHtml.matchAll(/'\/js\/(app-[a-z0-9-]+\.js)'/g)).map((m) => m[1]);
    expect(names[names.length - 1]).toBe("app-shell.js");
    const wiring = shell.slice(shell.indexOf("/* ── wiring (-294)"));
    for (const fn of ["_luSwipeInit", "_luSetWatch", "_luInstallInit", "_luShell2CSS", "_luLiveInit"]) expect(wiring).toContain("try{" + fn + "();}catch");
  });
});
