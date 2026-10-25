/**
 * Phase 1 (build -226): per-item sync for tasks / notes / ideas.
 * An in-memory stand-in for the drizzle MySQL client runs the real
 * applyEntityChanges / writeEntityArray / readEntityArray code.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tasksTable, notesTable, ideasTable, userAppData } from "../drizzle/schema";

// ── in-memory DB ────────────────────────────────────────────────────────────
type Row = Record<string, any>;
const store = new Map<any, Row[]>();
let nextId = 1;
const tableName = (t: any) => (t === tasksTable ? "tasks" : t === notesTable ? "notes" : t === ideasTable ? "ideas" : t === userAppData ? "uad" : "?");
function rows(t: any) { if (!store.has(t)) store.set(t, []); return store.get(t)!; }

/** Pull {column: value} equality pairs out of a drizzle eq()/and() SQL tree. */
function pairs(cond: any): Record<string, any> {
  const out: Record<string, any> = {};
  let col: string | null = null;
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.constructor?.name?.includes("Column") || (n.name && n.table && n.columnType)) { col = n.name; return; }
    if ("value" in n && "encoder" in n) { if (col) { out[col] = n.value; col = null; } return; }
    if (n.queryChunks) walk(n.queryChunks);
  };
  walk(cond);
  return out;
}
const match = (r: Row, p: Record<string, any>) => Object.entries(p).every(([k, v]) => String(r[k]) === String(v));

function selectQ(cols: any) {
  let t: any, cond: any = null, lim = Infinity;
  const q: any = {
    from(x: any) { t = x; return q; },
    where(c: any) { cond = c; return q; },
    orderBy() { return q; },
    limit(n: number) { lim = n; return q; },
    then(res: any, rej: any) {
      try {
        const p = cond ? pairs(cond) : {};
        let out = rows(t).filter((r) => match(r, p)).sort((a, b) => a.id - b.id).slice(0, lim);
        if (cols) out = out.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries<any>(cols)) o[k] = r[c.name]; return o; });
        return Promise.resolve(out).then(res, rej);
      } catch (e) { return Promise.reject(e).then(res, rej); }
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
      const p: any = Promise.resolve().then(doInsert);
      p.onDuplicateKeyUpdate = ({ set }: any) => Promise.resolve().then(() => {
        const ex = rows(t).find((r) => r.userId === list[0].userId);
        if (ex) Object.assign(ex, set); else doInsert();
      });
      // don't double-insert when onDuplicateKeyUpdate is chained
      const plain = p;
      return Object.assign(Promise.resolve(), { then: (a: any, b: any) => plain.then(a, b), onDuplicateKeyUpdate: p.onDuplicateKeyUpdate });
    },
  }),
  update: (t: any) => ({ set: (s: any) => ({ where: (c: any) => Promise.resolve().then(() => { const p = pairs(c); rows(t).filter((r) => match(r, p)).forEach((r) => Object.assign(r, s)); }) }) }),
  delete: (t: any) => ({ where: (c: any) => Promise.resolve().then(() => { const p = pairs(c); store.set(t, rows(t).filter((r) => !match(r, p))); }) }),
  transaction: async (fn: any) => fn(fakeDb),
};

vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), adminListAllUsers: vi.fn(async () => []) }));

import { applyEntityChanges, writeEntityArray, readEntityArray, _itemHash } from "./routers/appData";
import { appDataRouter } from "./routers/appData";

const U = 7;
const H = (x: any) => _itemHash(JSON.stringify(x));
const raw = (x: any) => JSON.stringify(x);
const task = (id: number, title: string, extra: any = {}) => ({ id, title, status: "Not Started", ...extra });
async function seed(items: any[]) { await applyEntityChanges(fakeDb, U, "tasks", { upserts: items.map((t) => ({ id: String(t.id), raw: raw(t) })), deletes: [], order: items.map((t) => String(t.id)) }); }

beforeEach(() => { store.clear(); nextId = 1; });

describe("per-item sync", () => {
  it("a stale device's edit no longer erases items other devices added", async () => {
    const t1 = task(1, "A"), t2 = task(2, "B");
    await seed([t1, t2]);
    // Device B adds task 3.
    await applyEntityChanges(fakeDb, U, "tasks", { upserts: [{ id: "3", raw: raw(task(3, "From phone")) }], deletes: [] });
    // Device A (never saw task 3) edits task 1.
    const t1b = { ...t1, title: "A edited" };
    const r = await applyEntityChanges(fakeDb, U, "tasks", { upserts: [{ id: "1", raw: raw(t1b), baseHash: H(t1) }], deletes: [] });
    expect(r.conflicts).toEqual([]);
    const all = await readEntityArray(fakeDb, U, "tasks");
    expect(all.map((t) => t.title).sort()).toEqual(["A edited", "B", "From phone"]);
  });

  it("refuses to overwrite an item another device changed since this one saw it", async () => {
    const t1 = task(1, "A");
    await seed([t1]);
    const fromPhone = { ...t1, title: "Phone wins" };
    await applyEntityChanges(fakeDb, U, "tasks", { upserts: [{ id: "1", raw: raw(fromPhone), baseHash: H(t1) }], deletes: [] });
    const fromLaptop = { ...t1, title: "Laptop late" };
    const r = await applyEntityChanges(fakeDb, U, "tasks", { upserts: [{ id: "1", raw: raw(fromLaptop), baseHash: H(t1) }], deletes: [] });
    expect(r.conflicts).toEqual([{ id: "1", raw: raw(fromPhone) }]);
    expect((await readEntityArray(fakeDb, U, "tasks"))[0].title).toBe("Phone wins");
  });

  it("an identical write is not a conflict", async () => {
    const t1 = task(1, "A");
    await seed([t1]);
    const r = await applyEntityChanges(fakeDb, U, "tasks", { upserts: [{ id: "1", raw: raw(t1), baseHash: "stale" }], deletes: [] });
    expect(r.conflicts).toEqual([]);
  });

  it("deletes are explicit, and refused when the item changed elsewhere", async () => {
    const t1 = task(1, "A"), t2 = task(2, "B");
    await seed([t1, t2]);
    const t2b = { ...t2, title: "B changed on phone" };
    await applyEntityChanges(fakeDb, U, "tasks", { upserts: [{ id: "2", raw: raw(t2b), baseHash: H(t2) }], deletes: [] });
    const r = await applyEntityChanges(fakeDb, U, "tasks", { upserts: [], deletes: [{ id: "1", baseHash: H(t1) }, { id: "2", baseHash: H(t2) }] });
    expect(r.deleted).toEqual(["1"]);
    expect(r.conflicts.map((c) => c.id)).toEqual(["2"]);
    expect((await readEntityArray(fakeDb, U, "tasks")).map((t) => t.id)).toEqual([2]);
  });

  it("keeps the list order the device sent", async () => {
    await seed([task(1, "A"), task(2, "B"), task(3, "C")]);
    await applyEntityChanges(fakeDb, U, "tasks", { upserts: [{ id: "4", raw: raw(task(4, "New on top")) }], deletes: [], order: ["4", "1", "2", "3"] });
    expect((await readEntityArray(fakeDb, U, "tasks")).map((t) => t.id)).toEqual([4, 1, 2, 3]);
  });

  it("server jobs write only what they changed, and never drop items they did not see", async () => {
    await seed([task(1, "A"), task(2, "B")]);
    const before = rows(tasksTable).map((r) => ({ ...r }));
    const list = await readEntityArray(fakeDb, U, "tasks");
    // a device adds task 3 after the job read the list
    await applyEntityChanges(fakeDb, U, "tasks", { upserts: [{ id: "3", raw: raw(task(3, "Device")) }], deletes: [] });
    list[0].title = "A by automation";
    await writeEntityArray(fakeDb, U, "tasks", list);
    const after = await readEntityArray(fakeDb, U, "tasks");
    // the job never saw task 3 — it must survive the job's write
    expect(after.map((t) => t.title).sort()).toEqual(["A by automation", "B", "Device"]);
    expect(rows(tasksTable).find((r) => r.taskId === "2")!.id).toBe(before.find((r) => r.taskId === "2")!.id); // untouched rows keep their identity
    // an explicit delete still works
    await writeEntityArray(fakeDb, U, "tasks", after.filter((t) => t.id !== 2), { deleteIds: ["2"] });
    expect((await readEntityArray(fakeDb, U, "tasks")).map((t) => t.id).sort()).toEqual([1, 3]);
  });
});

describe("legacy full-array save", () => {
  it("refuses an empty list replacing several items, atomically", async () => {
    await seed([1, 2, 3, 4, 5, 6].map((i) => task(i, "T" + i)));
    const caller = appDataRouter.createCaller({ user: { id: U, role: "user" } } as any);
    await expect(caller.save({ tasks: "[]" })).rejects.toThrow(/Refused to replace 6 tasks with 0/);
    expect((await readEntityArray(fakeDb, U, "tasks")).length).toBe(6);
  });
  it("still accepts a normal full save from an older client", async () => {
    await seed([task(1, "A"), task(2, "B")]);
    const caller = appDataRouter.createCaller({ user: { id: U, role: "user" } } as any);
    await caller.save({ tasks: raw([task(2, "B"), task(1, "A2"), task(5, "E")]) });
    expect((await readEntityArray(fakeDb, U, "tasks")).map((t) => t.title)).toEqual(["B", "A2", "E"]);
  });
});
