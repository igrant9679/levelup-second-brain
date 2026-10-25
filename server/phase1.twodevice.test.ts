/**
 * Phase 1 gate: two devices editing the same account.
 * Runs the SHIPPED client sync code (extracted from client/public/js/app-part2.js)
 * in two isolated vm contexts — device A and device B — both talking to the
 * real server logic (applyEntityChanges / readEntityArray) on an in-memory DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { tasksTable, notesTable, ideasTable, userAppData } from "../drizzle/schema";

// ── in-memory DB (same stand-in as phase1.sync.test.ts) ─────────────────────
type Row = Record<string, any>;
const store = new Map<any, Row[]>();
let nextId = 1;
function rows(t: any) { if (!store.has(t)) store.set(t, []); return store.get(t)!; }
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
  let t: any, cond: any = null, lim = Infinity;
  const q: any = {
    from(x: any) { t = x; return q; }, where(c: any) { cond = c; return q; }, orderBy() { return q; }, limit(n: number) { lim = n; return q; },
    then(res: any, rej: any) {
      const p = cond ? pairs(cond) : {};
      let out = rows(t).filter((r) => match(r, p)).sort((a, b) => a.id - b.id).slice(0, lim);
      if (cols) out = out.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries<any>(cols)) o[k] = r[c.name]; return o; });
      return Promise.resolve(out).then(res, rej);
    },
  };
  return q;
}
const fakeDb: any = {
  select: (cols?: any) => selectQ(cols),
  insert: (t: any) => ({
    values(v: any) {
      const list = Array.isArray(v) ? v : [v];
      const doInsert = () => { for (const r of list) rows(t).push({ id: nextId++, ...r }); };
      return {
        then: (a: any, b: any) => Promise.resolve().then(doInsert).then(a, b),
        onDuplicateKeyUpdate: ({ set }: any) => Promise.resolve().then(() => { const ex = rows(t).find((r) => r.userId === list[0].userId); if (ex) Object.assign(ex, set); else doInsert(); }),
      };
    },
  }),
  update: (t: any) => ({ set: (s: any) => ({ where: (c: any) => Promise.resolve().then(() => { const p = pairs(c); rows(t).filter((r) => match(r, p)).forEach((r) => Object.assign(r, s)); }) }) }),
  delete: (t: any) => ({ where: (c: any) => Promise.resolve().then(() => { const p = pairs(c); store.set(t, rows(t).filter((r) => !match(r, p))); }) }),
  transaction: async (fn: any) => fn(fakeDb),
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), adminListAllUsers: vi.fn(async () => []) }));

import { applyEntityChanges, readEntityArray } from "./routers/appData";

// ── the shipped client code ─────────────────────────────────────────────────
const SRC = fs.readFileSync(path.join(__dirname, "../client/public/js/app-part2.js"), "utf8").replace(/\r\n/g, "\n");
const START = SRC.indexOf("// ── Per-item sync for tasks / notes / ideas (Phase 1");
const END = SRC.indexOf("async function _pushKeyToServer(k){", START);
const CLIENT = SRC.slice(START, END);

const U = 7;
function device(name: string) {
  const ls = new Map<string, string>();
  const toasts: any[] = [];
  const ctx: any = {
    D: { tasks: [], notes: [], ideas: [] },
    localStorage: { getItem: (k: string) => (ls.has(k) ? ls.get(k)! : null), setItem: (k: string, v: string) => { ls.set(k, String(v)); }, removeItem: (k: string) => ls.delete(k) },
    window: {}, console, setTimeout: () => 0, clearTimeout: () => {},
    document: { addEventListener() {}, activeElement: null, visibilityState: "visible" },
    _serverSyncReady: true, _dirtyKeys: new Set(), _syncTimers: {},
    _safeOrigSave() {}, invalidateSearchIndex() {}, toast: (t: any) => toasts.push(t),
    _pushKeyToServer() {},
    _trpc: async (proc: string, input: any) => {
      if (proc === "appData.syncEntity") return { ok: true, ...(await applyEntityChanges(fakeDb, U, input.kind, input)) };
      if (proc === "appData.loadEntities") return { tasks: await readEntityArray(fakeDb, U, "tasks"), notes: await readEntityArray(fakeDb, U, "notes"), ideas: await readEntityArray(fakeDb, U, "ideas") };
      throw new Error("unexpected " + proc);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(CLIENT + "\n;this.__api={merge:_luMerge3,push:_luPushItems,baseGet:_luBaseGet,baseSet:_luBaseSet,hash:_luHash};", ctx);
  const api = ctx.__api;
  return {
    name, ctx, toasts, ls,
    /** what loadServerData does for one key */
    async load(k: string) {
      const srv = await readEntityArray(fakeDb, U, k as any);
      const m = api.merge(k, srv, ctx.D[k], () => true);
      ctx.D[k] = m.items; api.baseSet(k, m.base);
      if (m.push) await api.push(k);
      return m;
    },
    push: (k: string) => api.push(k),
    /** simulate a reload: memory comes back from this device's cache */
    reload(k: string, cache: any[]) { ctx.D[k] = JSON.parse(JSON.stringify(cache)); delete ctx.__api; vm.runInContext("this.__api={merge:_luMerge3,push:_luPushItems,baseGet:_luBaseGet,baseSet:_luBaseSet,hash:_luHash};", ctx); },
  };
}
const titles = (arr: any[]) => arr.map((x) => x.title).sort();
const server = (k: string) => readEntityArray(fakeDb, U, k as any);

beforeEach(() => { store.clear(); nextId = 1; });

describe("two devices, one account", () => {
  it("adds, edits and deletes on two devices all survive", async () => {
    const A = device("laptop"), B = device("phone");
    A.ctx.D.tasks = [{ id: 1, title: "Plan" }, { id: 2, title: "Call" }];
    await A.push("tasks");
    await B.load("tasks");
    B.ctx.D.tasks.unshift({ id: 3, title: "Added on phone" });
    await B.push("tasks");
    // the laptop never reloaded: it edits task 1 and deletes task 2
    A.ctx.D.tasks[0].title = "Plan (edited on laptop)";
    A.ctx.D.tasks.splice(1, 1);
    await A.push("tasks");
    expect(titles(await server("tasks"))).toEqual(["Added on phone", "Plan (edited on laptop)"]);
    // and the phone picks it all up without bringing task 2 back
    await B.load("tasks");
    expect(titles(B.ctx.D.tasks)).toEqual(["Added on phone", "Plan (edited on laptop)"]);
  });

  it("the same note edited on both devices keeps both versions", async () => {
    const A = device("laptop"), B = device("phone");
    A.ctx.D.notes = [{ id: 10, title: "Meeting", body: "v1" }];
    await A.push("notes");
    await B.load("notes");
    A.ctx.D.notes[0].body = "laptop text";
    await A.push("notes");
    B.ctx.D.notes[0].body = "phone text";
    await B.push("notes"); // conflicts: the laptop got there first
    const phoneCopy = B.ctx.D.notes[0];
    expect(phoneCopy.body).toBe("laptop text");
    expect(phoneCopy.versions.at(-1)).toMatchObject({ body: "phone text", conflict: true });
    expect(B.toasts.length).toBe(1);
    await B.push("notes"); // the merged history goes up
    const onServer = (await server("notes"))[0];
    expect(onServer.body).toBe("laptop text");
    expect(onServer.versions.at(-1).body).toBe("phone text");
  });

  it("an offline edit survives the next launch", async () => {
    const A = device("ipad"), B = device("phone");
    A.ctx.D.tasks = [{ id: 1, title: "Groceries" }, { id: 2, title: "Gym" }];
    await A.push("tasks");
    await B.load("tasks");
    // iPad offline: edits task 1, app closed before the push
    A.ctx.D.tasks[0].title = "Groceries + milk";
    const cache = JSON.parse(JSON.stringify(A.ctx.D.tasks));
    // meanwhile the phone edits task 2
    B.ctx.D.tasks[1].title = "Gym 6pm";
    await B.push("tasks");
    // iPad relaunches online
    A.reload("tasks", cache);
    await A.load("tasks");
    expect(titles(await server("tasks"))).toEqual(["Groceries + milk", "Gym 6pm"]);
  });

  it("a stale or failed local cache never deletes items on the server", async () => {
    const A = device("iphone");
    A.ctx.D.notes = [1, 2, 3, 4].map((i) => ({ id: i, title: "N" + i }));
    await A.push("notes");
    // the cache lost two notes (quota) — at load they come back from the server
    A.reload("notes", A.ctx.D.notes.slice(0, 2));
    await A.load("notes");
    expect(A.ctx.D.notes.length).toBe(4);
    // an empty in-memory list is never pushed as "delete everything"
    A.ctx.D.notes = [];
    await A.push("notes");
    expect((await server("notes")).length).toBe(4);
  });

  it("a device keeps its own order and slots in items added elsewhere", async () => {
    const A = device("laptop"), B = device("phone");
    A.ctx.D.tasks = [{ id: 1, title: "a" }, { id: 2, title: "b" }, { id: 3, title: "c" }];
    await A.push("tasks");
    await B.load("tasks");
    B.ctx.D.tasks.splice(1, 0, { id: 9, title: "new after a" });
    await B.push("tasks");
    await A.load("tasks");
    expect(A.ctx.D.tasks.map((t: any) => t.id)).toEqual([1, 9, 2, 3]);
  });
});
