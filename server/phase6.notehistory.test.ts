/**
 * Build -241: note history on the server. An in-memory stand-in for the
 * drizzle client runs the real applyEntityChanges + noteVersions router:
 * edits keep the copy from before each editing session (not one per
 * autosave), tag/pin changes keep nothing, deletes go to the Trash, and old
 * in-note copies moved up from two devices are stored once.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { notesTable, userAppData, noteVersions } from "../drizzle/schema";

type Row = Record<string, any>;
const store = new Map<any, Row[]>();
let nextId = 1;
function rows(t: any) { if (!store.has(t)) store.set(t, []); return store.get(t)!; }
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
const same = (a: any, b: any) => (a instanceof Date || b instanceof Date) ? new Date(a).getTime() === new Date(b).getTime() : String(a) === String(b);
const match = (r: Row, p: Record<string, any>) => Object.entries(p).every(([k, v]) => same(r[k], v));
function selectQ(cols: any) {
  let t: any, cond: any = null, lim = Infinity, newest = false;
  const q: any = {
    from(x: any) { t = x; return q; },
    where(c: any) { cond = c; return q; },
    orderBy() { newest = t === noteVersions; return q; },
    limit(n: number) { lim = n; return q; },
    then(res: any, rej: any) {
      try {
        const p = cond ? pairs(cond) : {};
        let out = rows(t).filter((r) => match(r, p));
        out = newest ? out.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime() || b.id - a.id) : out.sort((a, b) => a.id - b.id);
        out = out.slice(0, lim);
        if (cols) out = out.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries<any>(cols)) o[k] = r[c.name]; return o; });
        return Promise.resolve(out).then(res, rej);
      } catch (e) { return Promise.reject(e).then(res, rej); }
    },
  };
  return q;
}
const stamp = (t: any, r: Row) => { if (t === notesTable) r.syncedAt = new Date(); return r; };
const fakeDb: any = {
  select: (cols?: any) => selectQ(cols),
  insert: (t: any) => ({
    values(v: any) {
      const list = Array.isArray(v) ? v : [v];
      const doInsert = () => { for (const r of list) rows(t).push(stamp(t, { id: nextId++, savedAt: t === noteVersions ? new Date() : undefined, ...r })); };
      const p: any = Promise.resolve().then(doInsert);
      const upsert = ({ set }: any) => Promise.resolve().then(() => {
        const ex = rows(t).find((r) => r.userId === list[0].userId);
        if (ex) Object.assign(ex, set); else doInsert();
      });
      return Object.assign(Promise.resolve(), { then: (a: any, b: any) => p.then(a, b), onDuplicateKeyUpdate: upsert });
    },
  }),
  update: (t: any) => ({ set: (s: any) => ({ where: (c: any) => Promise.resolve().then(() => { const p = pairs(c); rows(t).filter((r) => match(r, p)).forEach((r) => stamp(t, Object.assign(r, s))); }) }) }),
  delete: (t: any) => ({ where: (c: any) => Promise.resolve().then(() => { const p = pairs(c); store.set(t, rows(t).filter((r) => !match(r, p))); }) }),
  transaction: async (fn: any) => fn(fakeDb),
};
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), adminListAllUsers: vi.fn(async () => []) }));

import { applyEntityChanges, _itemHash } from "./routers/appData";
import { noteVersionsRouter } from "./routers/noteVersions";
import { recordNoteVersion } from "./_core/noteVersions";

const U = 9;
const raw = (x: any) => JSON.stringify(x);
const H = (x: any) => _itemHash(raw(x));
const note = (id: number, title: string, bodyHtml: string, extra: any = {}) => ({ id, title, bodyHtml, body: bodyHtml.replace(/<[^>]+>/g, ""), ...extra });
const caller = noteVersionsRouter.createCaller({ user: { id: U, role: "user", name: "Owner" } } as any);
const T0 = new Date("2026-10-27T15:00:00.000Z").getTime();
const at = (min: number) => vi.setSystemTime(new Date(T0 + min * 60000));
async function put(n: any, base?: any) {
  return applyEntityChanges(fakeDb, U, "notes", { upserts: [{ id: String(n.id), raw: raw(n), baseHash: base ? H(base) : null }], deletes: [] });
}
const history = () => rows(noteVersions).filter((r) => r.kind !== "deleted").map((r) => r.bodyHtml);

beforeEach(() => { store.clear(); nextId = 1; vi.useFakeTimers(); at(0); });
afterEach(() => { vi.useRealTimers(); });

describe("note history on the server", () => {
  it("keeps the copy from before each editing session, not one per autosave", async () => {
    let n = note(1, "Plan", "<p>v1</p>");
    await put(n);
    // a burst of autosaves over three minutes, a few seconds apart
    let prev = n;
    for (let i = 2; i <= 6; i++) { at(i * 0.5); const next = note(1, "Plan", `<p>v${i}</p>`); await put(next, prev); prev = next; }
    expect(history()).toEqual(["<p>v1</p>"]);
    // a pause of 5 minutes, then a new session: the end of the last one is kept
    at(8);
    const v7 = note(1, "Plan", "<p>v7</p>");
    await put(v7, prev);
    expect(history()).toEqual(["<p>v1</p>", "<p>v6</p>"]);
    // a long session without pauses keeps a copy every 10 minutes
    prev = v7;
    for (let m = 8.5, i = 8; m <= 19; m += 0.5, i++) { at(m); const next = note(1, "Plan", `<p>v${i}</p>`); await put(next, prev); prev = next; }
    expect(history().length).toBe(3);
  });

  it("a tag, pin or folder change keeps nothing", async () => {
    const n = note(2, "Ideas", "<p>x</p>");
    await put(n);
    at(30);
    const pinned = { ...n, pinned: true, tags: ["a"] };
    await put(pinned, n);
    expect(rows(noteVersions)).toEqual([]);
  });

  it("lists, opens and returns versions for the owner only", async () => {
    const n = note(3, "Doc", "<p>first</p>");
    await put(n);
    at(15);
    await put(note(3, "Doc", "<p>second</p>"), n);
    const list = await caller.list({ noteId: "3" });
    expect(list.length).toBe(1);
    expect(list[0].kind).toBe("edit");
    const v = await caller.get({ id: list[0].id });
    expect(v?.bodyHtml).toBe("<p>first</p>");
    const other = noteVersionsRouter.createCaller({ user: { id: 99, role: "user" } } as any);
    expect(await other.get({ id: list[0].id })).toBeNull();
    expect(await other.list({ noteId: "3" })).toEqual([]);
  });

  it("a deleted note goes to the Trash with everything needed to bring it back", async () => {
    const n = note(4, "Gone", "<p>keep me</p>", { tags: ["x"], folderId: 2 });
    await put(n);
    await applyEntityChanges(fakeDb, U, "notes", { upserts: [], deletes: [{ id: "4", baseHash: H(n) }] });
    const trash = await caller.trash();
    expect(trash.map((t: any) => t.title)).toEqual(["Gone"]);
    const v = await caller.get({ id: trash[0].id });
    expect(JSON.parse(v!.raw!)).toEqual(n);
    // brought back (same id) → no longer in the Trash
    await put(n);
    expect(await caller.trash()).toEqual([]);
  });

  it("copies moved up from n.versions are stored once, even from two devices", async () => {
    const items = [{ noteId: "5", versions: [
      { title: "T", body: "old", bodyHtml: "", savedAt: "2026-09-01T10:00:00.123Z" },
      { title: "T", body: "older conflict", bodyHtml: "<p>older conflict</p>", savedAt: "2026-09-02T11:00:00.000Z", from: "Your version on this device", conflict: true },
    ] }];
    const a = await caller.importLegacy({ items });
    const b = await caller.importLegacy({ items });
    expect(a.written).toBe(2);
    expect(b.written).toBe(0);
    const list = await caller.list({ noteId: "5" });
    expect(list.map((v: any) => v.kind).sort()).toEqual(["conflict", "legacy"]);
    expect(list.find((v: any) => v.kind === "conflict")!.label).toBe("Your version on this device");
  });

  it("a copy identical to the newest one is not stored again; a restore always is", async () => {
    await recordNoteVersion(fakeDb, U, { noteId: "6", kind: "restore", title: "R", bodyHtml: "<p>a</p>", body: "a" });
    await recordNoteVersion(fakeDb, U, { noteId: "6", kind: "restore", title: "R", bodyHtml: "<p>a</p>", body: "a" });
    await recordNoteVersion(fakeDb, U, { noteId: "6", kind: "restore", title: "R", bodyHtml: "<p>b</p>", body: "b" });
    expect(rows(noteVersions).map((r) => r.body)).toEqual(["a", "b"]);
  });

  it("a history failure never fails the sync", async () => {
    const n = note(7, "Safe", "<p>1</p>");
    await put(n);
    at(20);
    const realInsert = fakeDb.insert;
    fakeDb.insert = (t: any) => (t === noteVersions ? { values: () => Promise.reject(new Error("no table")) } : realInsert(t));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await put(note(7, "Safe", "<p>2</p>"), n);
    fakeDb.insert = realInsert;
    warn.mockRestore();
    expect(r.conflicts).toEqual([]);
    expect(JSON.parse(rows(notesTable)[0].raw).bodyHtml).toBe("<p>2</p>");
  });
});
