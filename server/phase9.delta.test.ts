/**
 * Build -262 (Audit 2 Phase 2b): the focus refresh downloads only what
 * changed. Runs the SHIPPED client pull (_luPullItems + _luKnownFor +
 * _luFromDelta + _luMerge3 from app-part2.js) in vm "devices" against the
 * real server delta (entityDelta), and checks every round that a device on
 * the delta path ends up exactly where a device on the old full download
 * (loadEntities) does.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null), adminListAllUsers: vi.fn(async () => []) }));
import { entityDelta, BLOB_LIST_KINDS, BLOB_OBJECT_KINDS } from "./routers/appData";

const SRC = fs.readFileSync(path.join(__dirname, "../client/public/js/app-part2.js"), "utf8").replace(/\r\n/g, "\n");
const START = SRC.indexOf("// ── Per-item sync for tasks / notes / ideas (Phase 1");
const END = SRC.indexOf("async function _pushKeyToServer(k){", START);
const CLIENT = SRC.slice(START, END);
const API = "this.__api={pull:_luPullItems,merge:_luMerge3,baseSet:_luBaseSet,itemsOf:_luItemsOf,fromItems:_luFromItems,reset:()=>{_luLastPull=0;}};";
const KEYS = ["tasks", "notes", "ideas", ...BLOB_LIST_KINDS, ...BLOB_OBJECT_KINDS];
const clone = (v: any) => JSON.parse(JSON.stringify(v));

/** The server's stored lists, as loadEntities returns them. */
let S: Record<string, any> = {};
function freshServer() {
  S = {};
  for (const k of KEYS) S[k] = (BLOB_OBJECT_KINDS as readonly string[]).includes(k) ? {} : [];
  S.tasks = [{ id: 1, title: "Ship it", status: "Not Started" }, { id: 2, title: "Call Sam", status: "Done" }, { id: 3, title: "Fix sink" }];
  S.notes = [{ id: 10, title: "Ideas", body: "x".repeat(5000) }, { id: 11, title: "Meeting", body: "agenda" }];
  S.projects = [{ id: 1, name: "Website" }, { id: 2, name: "Hiring" }];
  S.prefs = { dark: true, coach: { tz: "America/New_York" }, workspace: { pages: ["home", "tasks"] } };
}

function device(mode: "delta" | "full" | "old-server") {
  const ls = new Map<string, string>();
  const calls: Array<{ proc: string; bytes: number }> = [];
  const warns: string[] = [];
  const ctx: any = {
    D: {}, window: {}, setTimeout: () => 0, clearTimeout: () => {},
    localStorage: { getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null), setItem: (k: string, v: string) => { ls.set(k, String(v)); }, removeItem: (k: string) => ls.delete(k) },
    document: { addEventListener() {}, activeElement: null, visibilityState: "visible" },
    _serverSyncReady: true, _dirtyKeys: new Set(), _syncTimers: {},
    _safeOrigSave() {}, invalidateSearchIndex() {}, toast() {}, _pushKeyToServer() {},
    console: { ...console, warn: (...a: any[]) => { warns.push(a.join(" ")); } },
    _trpc: async (proc: string, input: any) => {
      let out: any;
      if (proc === "appData.loadEntities") out = clone(S);
      else if (proc === "appData.pullChanges") {
        if (mode !== "delta") throw new Error('No "mutation"-procedure on path "appData.pullChanges"');
        out = clone({ keys: entityDelta(clone(S), input.known || {}), updatedAt: null });
      } else throw new Error("unexpected " + proc);
      calls.push({ proc, bytes: JSON.stringify(out).length });
      return out;
    },
  };
  if (mode === "full") ctx.window._luDeltaOff = true;
  vm.createContext(ctx);
  vm.runInContext(CLIENT + "\n;" + API, ctx);
  const api = ctx.__api;
  return {
    ctx, calls, api, warns,
    /** loadServerData: take the server's copy and its base for every key */
    boot() {
      for (const k of KEYS) {
        const m = api.merge(k, api.itemsOf(k, clone(S[k])), api.itemsOf(k, ctx.D[k] === undefined ? undefined : ctx.D[k]), null);
        ctx.D[k] = api.fromItems(k, m.items); api.baseSet(k, m.base);
      }
    },
    async pull() { api.reset(); await api.pull(); if (warns.length) throw new Error(warns.join("; ")); if (!calls.length) throw new Error("no request made"); },
    state() { return JSON.parse(JSON.stringify(KEYS.map((k) => ctx.D[k]))); },
  };
}

describe("focus refresh sends only changes (-262)", () => {
  it("nothing changed on the server: every key comes back 'same', a tiny answer", async () => {
    freshServer();
    const A = device("delta"); A.boot();
    const before = A.state();
    await A.pull();
    expect(A.calls.map((c) => c.proc)).toEqual(["appData.pullChanges"]);
    expect(A.calls[0].bytes).toBeLessThan(800);
    expect(A.state()).toEqual(before);
  });

  it("changes made elsewhere arrive, and only those items are sent", async () => {
    freshServer();
    const A = device("delta"), F = device("full"); A.boot(); F.boot();
    S.tasks[0] = { ...S.tasks[0], status: "In Progress" };
    S.tasks.push({ id: 4, title: "New on phone" });
    S.notes = S.notes.filter((n: any) => n.id !== 11);
    S.projects.splice(0, 1);
    S.prefs = { ...S.prefs, dark: false };
    await A.pull(); await F.pull();
    expect(A.state()).toEqual(F.state());
    expect(A.ctx.D.tasks.map((t: any) => t.status || "")).toEqual(["In Progress", "Done", "", ""]);
    expect(A.ctx.D.notes.map((n: any) => n.id)).toEqual([10]);
    expect(A.ctx.D.prefs.dark).toBe(false);
    // the 5,000-character note did not travel again
    expect(A.calls[0].bytes).toBeLessThan(F.calls[0].bytes / 4);
    expect(A.calls[0].bytes).toBeLessThan(1500);
  });

  it("a list that isn't exactly as last synced comes back whole and merges as before", async () => {
    freshServer();
    const A = device("delta"), F = device("full"); A.boot(); F.boot();
    // e.g. a cache that lost an item: the old merge restores it from the server
    A.ctx.D.tasks.splice(1, 1); F.ctx.D.tasks.splice(1, 1);
    S.tasks[2] = { ...S.tasks[2], title: "Fix sink today" };
    await A.pull(); await F.pull();
    expect(A.state()).toEqual(F.state());
    expect(A.ctx.D.tasks.map((t: any) => t.id).sort()).toEqual([1, 2, 3]);
    expect(A.ctx.D.tasks.find((t: any) => t.id === 3).title).toBe("Fix sink today");
  });

  it("loose ids (no id / repeated id) are always sent whole", () => {
    const d = entityDelta({ projects: [{ id: 1, n: "a" }, { n: "no id" }] }, { projects: { "1": "x" } });
    expect(d.projects).toEqual({ full: [{ id: 1, n: "a" }, { n: "no id" }] });
    const d2 = entityDelta({ projects: [{ id: 1 }, { id: 1 }] }, { projects: { "1": "x" } });
    expect("full" in d2.projects).toBe(true);
  });

  it("a server without pullChanges (deploy skew) falls back to the full download", async () => {
    freshServer();
    const A = device("old-server"); A.boot();
    S.tasks[0] = { ...S.tasks[0], title: "Renamed" };
    await A.pull();
    expect(A.calls.map((c) => c.proc)).toEqual(["appData.loadEntities"]);
    expect(A.ctx.D.tasks[0].title).toBe("Renamed");
    expect(A.ctx.window._luDeltaOff).toBe(true);
  });

  it("200 random rounds of server edits: delta device == full-download device every round", async () => {
    freshServer();
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const A = device("delta"), F = device("full"); A.boot(); F.boot();
    let nextId = 100, deltaBytes = 0, fullBytes = 0;
    const lists = ["tasks", "notes", "ideas", "projects", "goals", "habits"];
    for (let round = 0; round < 200; round++) {
      const n = Math.floor(rnd() * 4);
      for (let j = 0; j < n; j++) {
        const r = rnd();
        if (r < 0.15) { S.prefs = { ...S.prefs, ["k" + Math.floor(rnd() * 6)]: rnd() < 0.2 ? undefined : Math.floor(rnd() * 9) }; continue; }
        const k = lists[Math.floor(rnd() * lists.length)];
        const arr = S[k];
        if (r < 0.45 || !arr.length) arr.splice(Math.floor(rnd() * (arr.length + 1)), 0, { id: nextId++, title: "t" + round });
        else if (r < 0.75) { const i = Math.floor(rnd() * arr.length); arr[i] = { ...arr[i], title: "e" + round, n: Math.floor(rnd() * 5) }; }
        else if (r < 0.9) arr.splice(Math.floor(rnd() * arr.length), 1);
        else { const i = Math.floor(rnd() * arr.length), x = arr.splice(i, 1)[0]; arr.splice(Math.floor(rnd() * (arr.length + 1)), 0, x); }
      }
      A.calls.length = 0; F.calls.length = 0;
      await A.pull(); await F.pull();
      deltaBytes += A.calls.reduce((s, c) => s + c.bytes, 0);
      fullBytes += F.calls.reduce((s, c) => s + c.bytes, 0);
      expect(A.state(), "round " + round).toEqual(F.state());
    }
    // tiny lists here, so the id order each changed key carries dominates;
    // with real lists (large notes) the saving is far bigger — see above
    expect(deltaBytes).toBeLessThan(fullBytes / 2);
  });
});
