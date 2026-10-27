/**
 * Build -232 (Platform): per-item sync for the blob-stored lists (projects,
 * goals, …) and key-by-key sync for preferences. Runs the SHIPPED client
 * sync code from app-part2.js in two vm "devices" against the real server
 * logic (applyBlobChanges) on an in-memory user_app_data row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { userAppData } from "../drizzle/schema";

// ── in-memory DB: one user_app_data table ───────────────────────────────────
type Row = Record<string, any>;
let uad: Row[] = [];
function pairs(cond: any): Record<string, any> {
  const out: Record<string, any> = {}; let col: string | null = null;
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.name && n.table && n.columnType) { col = n.name; return; }
    if ("value" in n && "encoder" in n) { if (col) { out[col] = n.value; col = null; } return; }
    if (n.queryChunks) walk(n.queryChunks);
  };
  walk(cond); return out;
}
const match = (r: Row, p: Record<string, any>) => Object.entries(p).every(([k, v]) => String(r[k]) === String(v));
function selectQ(cols: any) {
  let cond: any = null;
  const q: any = {
    from() { return q; }, where(c: any) { cond = c; return q; }, orderBy() { return q; }, limit() { return q; },
    then(res: any, rej: any) {
      const p = cond ? pairs(cond) : {};
      let out = uad.filter((r) => match(r, p));
      if (cols) out = out.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries<any>(cols)) o[k] = r[c.name]; return o; });
      return Promise.resolve(out).then(res, rej);
    },
  };
  return q;
}
const fakeDb: any = {
  select: (cols?: any) => selectQ(cols),
  insert: () => ({
    values(v: any) {
      return {
        then: (a: any, b: any) => Promise.resolve().then(() => { uad.push({ ...v }); }).then(a, b),
        onDuplicateKeyUpdate: ({ set }: any) => Promise.resolve().then(() => { const ex = uad.find((r) => r.userId === v.userId); if (ex) Object.assign(ex, set); else uad.push({ ...v }); }),
      };
    },
  }),
  update: () => ({ set: (s: any) => ({ where: (c: any) => Promise.resolve().then(() => { const p = pairs(c); uad.filter((r) => match(r, p)).forEach((r) => Object.assign(r, s)); }) }) }),
  transaction: async (fn: any) => fn(fakeDb),
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), adminListAllUsers: vi.fn(async () => []) }));

import { applyBlobChanges, _itemHash } from "./routers/appData";

const U = 7;
const stored = (k: string) => { const r = uad.find((x) => x.userId === U); return r && r[k] != null ? JSON.parse(r[k]) : null; };
/** A server job (shared-item update, cron) rewriting the whole blob, as they do. */
const serverJobWrite = (k: string, v: any) => { const r = uad.find((x) => x.userId === U)!; r[k] = JSON.stringify(v); };

// ── the shipped client code ─────────────────────────────────────────────────
const SRC = fs.readFileSync(path.join(__dirname, "../client/public/js/app-part2.js"), "utf8").replace(/\r\n/g, "\n");
const START = SRC.indexOf("// ── Per-item sync for tasks / notes / ideas (Phase 1");
const END = SRC.indexOf("async function _pushKeyToServer(k){", START);
const CLIENT = SRC.slice(START, END);
const API = "this.__api={merge:_luMerge3,push:_luPushItems,baseSet:_luBaseSet,itemsOf:_luItemsOf,fromItems:_luFromItems,safe:_luItemsSafe};";

function device() {
  const ls = new Map<string, string>();
  const toasts: any[] = [];
  const ctx: any = {
    D: { projects: [], goals: [], prefs: {} },
    localStorage: { getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null), setItem: (k: string, v: string) => { ls.set(k, String(v)); }, removeItem: (k: string) => ls.delete(k) },
    window: {}, console, setTimeout: () => 0, clearTimeout: () => {},
    document: { addEventListener() {}, activeElement: null, visibilityState: "visible" },
    _serverSyncReady: true, _dirtyKeys: new Set(), _syncTimers: {},
    _safeOrigSave() {}, invalidateSearchIndex() {}, toast: (t: any) => toasts.push(t), _pushKeyToServer() {},
    _trpc: async (proc: string, input: any) => {
      if (proc === "appData.syncEntity") return { ok: true, ...(await applyBlobChanges(fakeDb, U, input.kind, input)) };
      throw new Error("unexpected " + proc);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CLIENT + "\n;" + API, ctx);
  const api = ctx.__api;
  return {
    ctx, toasts, api,
    /** what loadServerData / the focus refresh do for one key */
    async load(k: string) {
      const srv = stored(k);
      const m = api.merge(k, api.itemsOf(k, srv ?? (k === "prefs" ? {} : [])), api.itemsOf(k), null);
      ctx.D[k] = api.fromItems(k, m.items); api.baseSet(k, m.base);
      if (m.push) await api.push(k);
      return m;
    },
    push: (k: string) => api.push(k),
  };
}
const names = (arr: any[]) => arr.map((x) => x.name).sort();

beforeEach(() => { uad = []; });

describe("blob lists sync item by item", () => {
  it("adds, edits and deletes on two devices all survive", async () => {
    const A = device(), B = device();
    A.ctx.D.projects = [{ id: 1, name: "Website" }, { id: 2, name: "Hiring" }];
    await A.push("projects");
    await B.load("projects");
    B.ctx.D.projects.push({ id: 3, name: "Added on phone" });
    await B.push("projects");
    // the laptop never reloaded: edits 1, deletes 2 — before -232 its whole-list save erased project 3
    A.ctx.D.projects[0].name = "Website v2";
    A.ctx.D.projects.splice(1, 1);
    await A.push("projects");
    expect(names(stored("projects"))).toEqual(["Added on phone", "Website v2"]);
    await B.load("projects");
    expect(names(B.ctx.D.projects)).toEqual(["Added on phone", "Website v2"]);
  });

  it("a server job's edit survives a stale device saving another item", async () => {
    const A = device();
    A.ctx.D.projects = [{ id: 1, name: "Website", status: "Active" }, { id: 2, name: "Hiring", status: "Active" }];
    await A.push("projects");
    // a teammate's shared update rewrites the owner's blob server-side
    serverJobWrite("projects", [{ id: 1, name: "Website", status: "On Hold" }, { id: 2, name: "Hiring", status: "Active" }]);
    A.ctx.D.projects[1].status = "Done";
    await A.push("projects");
    expect(stored("projects")).toEqual([{ id: 1, name: "Website", status: "On Hold" }, { id: 2, name: "Hiring", status: "Done" }]);
  });

  it("the same project changed on both devices keeps the other device's copy and says so", async () => {
    const A = device(), B = device();
    A.ctx.D.goals = [{ id: 5, name: "Run 10k", pct: 10 }];
    await A.push("goals");
    await B.load("goals");
    A.ctx.D.goals[0].pct = 40; await A.push("goals");
    B.ctx.D.goals[0].pct = 20; await B.push("goals");
    expect(stored("goals")[0].pct).toBe(40);
    expect(B.ctx.D.goals[0].pct).toBe(40);
    expect(B.toasts[0].msg).toMatch(/1 goal had newer changes/);
  });

  it("keeps the device's order and slots in items added elsewhere", async () => {
    const A = device(), B = device();
    A.ctx.D.projects = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
    await A.push("projects");
    await B.load("projects");
    B.ctx.D.projects.unshift({ id: 9, name: "first" });
    await B.push("projects");
    A.ctx.D.projects.reverse(); await A.push("projects"); // A doesn't know 9 yet
    expect(stored("projects").map((p: any) => p.id)).toEqual([2, 1, 9]);
  });

  it("elements without an id are kept and make the device fall back to the whole-list save", async () => {
    const A = device();
    A.ctx.D.projects = [{ id: 1, name: "ok" }];
    await A.push("projects");
    serverJobWrite("projects", [{ id: 1, name: "ok" }, { name: "legacy, no id" }]);
    await A.load("projects");
    expect(A.ctx.D.projects).toEqual([{ id: 1, name: "ok" }, { name: "legacy, no id" }]);
    expect(A.api.safe("projects")).toBe(false);
    // and the server never loses the id-less element on a per-item change
    await applyBlobChanges(fakeDb, U, "projects", { upserts: [{ id: "1", raw: JSON.stringify({ id: 1, name: "edited" }) }], deletes: [], order: ["1"] });
    expect(stored("projects")).toEqual([{ id: 1, name: "edited" }, { name: "legacy, no id" }]);
  });
});

describe("preferences sync key by key", () => {
  it("two devices changing different settings both survive", async () => {
    const A = device(), B = device();
    A.ctx.D.prefs = { darkMode: false, accent: "#3B82F6", coach: { tz: "America/New_York" } };
    await A.push("prefs");
    await B.load("prefs");
    A.ctx.D.prefs.darkMode = true; await A.push("prefs");
    // B never reloaded — before -232 its whole-prefs save put darkMode back to false
    B.ctx.D.prefs.coach = { tz: "Asia/Tokyo" }; await B.push("prefs");
    expect(stored("prefs")).toEqual({ darkMode: true, accent: "#3B82F6", coach: { tz: "Asia/Tokyo" } });
  });

  it("a setting removed on one device is removed on the other at its next load", async () => {
    const A = device(), B = device();
    A.ctx.D.prefs = { workspace: { preset: "focused" }, darkMode: false };
    await A.push("prefs");
    await B.load("prefs");
    delete A.ctx.D.prefs.workspace; await A.push("prefs");
    expect(stored("prefs")).toEqual({ darkMode: false });
    await B.load("prefs");
    expect(B.ctx.D.prefs).toEqual({ darkMode: false });
  });

  it("a setting changed on both devices keeps the server's value, quietly", async () => {
    const A = device(), B = device();
    A.ctx.D.prefs = { accent: "blue" }; await A.push("prefs");
    await B.load("prefs");
    A.ctx.D.prefs.accent = "green"; await A.push("prefs");
    B.ctx.D.prefs.accent = "red"; await B.push("prefs");
    expect(B.ctx.D.prefs.accent).toBe("green");
    expect(B.toasts.length).toBe(0);
  });

  it("an empty preferences copy never wipes the server", async () => {
    const A = device();
    A.ctx.D.prefs = { a: 1, b: 2, c: 3, d: 4 }; await A.push("prefs");
    A.ctx.D.prefs = {}; await A.push("prefs");
    expect(stored("prefs")).toEqual({ a: 1, b: 2, c: 3, d: 4 });
  });

  it("hashes match on both sides", async () => {
    const A = device();
    A.ctx.D.prefs = { x: { y: [1, "two", null] } };
    await A.push("prefs");
    const r = await applyBlobChanges(fakeDb, U, "prefs", { upserts: [{ id: "x", raw: JSON.stringify({ id: "x", v: { y: [1, "two", null] } }), baseHash: _itemHash(JSON.stringify({ id: "x", v: { y: [1, "two", null] } })) }], deletes: [] });
    expect(r.conflicts).toEqual([]);
  });
});
