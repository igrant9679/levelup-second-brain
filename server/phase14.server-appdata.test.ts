/**
 * Audit 2026-11-06 medium/low (server): appData.
 *  - aiChat / coachTrash are per-item synced lists (applyBlobChanges);
 *  - Money "share with everyone" no longer grants access (F33);
 *  - updateShared* read-modify-writes run in a transaction with FOR UPDATE (F61);
 *  - transferReportOwnership writes receiver first, in one transaction (F66);
 *  - shared*ForMe reuse parsed blobs for unchanged rows (F71) and log failures (F74);
 *  - load returns the entity tables when the user_app_data row is missing (F74).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { userAppData, tasksTable, notesTable, ideasTable } from "../drizzle/schema";

// ── in-memory DB: several tables, eq/and conditions, transactions with rollback ──
type Row = Record<string, any>;
const tables = new Map<any, Row[]>();
const rowsOf = (t: any) => { if (!tables.has(t)) tables.set(t, []); return tables.get(t)!; };
const log: string[] = [];
let failUpdateWhen: ((t: any, s: any, cond: any) => boolean) | null = null;
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
function selectQ(cols: any, inTx: boolean) {
  let t: any, cond: any = null, lim = Infinity, locked = false;
  const q: any = {
    from(x: any) { t = x; return q; }, where(c: any) { cond = c; return q; }, orderBy() { return q; },
    limit(n: number) { lim = n; return q; },
    for(mode: string) { locked = mode === "update"; return q; },
    then(res: any, rej: any) {
      const name = t === userAppData ? "uad" : t === tasksTable ? "tasks" : t === notesTable ? "notes" : "other";
      const colNames = cols ? Object.keys(cols).join(",") : "*";
      log.push(`select ${name} [${colNames}]${locked ? " FOR UPDATE" : ""}${inTx ? " (tx)" : ""}`);
      const p = cond ? pairs(cond) : {};
      let out = rowsOf(t).filter((r) => match(r, p)).slice(0, lim);
      if (cols) out = out.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries<any>(cols)) o[k] = c && c.name ? r[c.name] : undefined; return o; });
      return Promise.resolve(out).then(res, rej);
    },
  };
  return q;
}
function makeDb(inTx = false): any {
  return {
    select: (cols?: any) => selectQ(cols, inTx),
    insert: (t: any) => ({
      values(v: any) {
        const add = () => { rowsOf(t).push({ id: rowsOf(t).length + 1, ...v }); };
        return {
          then: (a: any, b: any) => Promise.resolve().then(add).then(a, b),
          onDuplicateKeyUpdate: ({ set }: any) => Promise.resolve().then(() => {
            const ex = rowsOf(t).find((r) => r.userId === v.userId);
            if (ex) Object.assign(ex, set); else add();
          }),
        };
      },
    }),
    update: (t: any) => ({ set: (s: any) => ({ where: (c: any) => Promise.resolve().then(() => {
      if (failUpdateWhen && failUpdateWhen(t, s, c)) throw new Error("disk full");
      const p = pairs(c);
      log.push(`update ${t === userAppData ? "uad" : "tbl"} ${JSON.stringify(p)} [${Object.keys(s).join(",")}]${inTx ? " (tx)" : ""}`);
      rowsOf(t).filter((r) => match(r, p)).forEach((r) => Object.assign(r, s));
    }) }) }),
    delete: () => ({ where: () => Promise.resolve() }),
    transaction: async (fn: any) => {
      // rollback on error: restore a deep snapshot
      const snap = new Map(Array.from(tables.entries()).map(([k, v]) => [k, JSON.parse(JSON.stringify(v))]));
      log.push("BEGIN");
      try { const r = await fn(makeDb(true)); log.push("COMMIT"); return r; }
      catch (e) { tables.clear(); snap.forEach((v, k) => tables.set(k, v)); log.push("ROLLBACK"); throw e; }
    },
  };
}
const fakeDb = makeDb();
const USERS = [
  { id: 1, name: "Owner", email: "o@x", role: "admin", openId: "owner-oid" },
  { id: 2, name: "Ann", email: "a@x", role: "user", openId: "email:a@x" },
  { id: 3, name: "Demo", email: "d@x", role: "user", openId: "email:d@x" },
];
vi.mock("./db", () => ({ getDb: vi.fn(async () => fakeDb), adminListAllUsers: vi.fn(async () => USERS.map((u) => ({ ...u, hasSmtp: false, lastSignedIn: null }))) }));
vi.mock("./routers/appData", async (orig) => ({ ...(await orig<any>()), isOwnerCtxUser: vi.fn(async (u: any) => u?.id === 1) }));

// Loaded from the test first so its lazy import of routers/appData sees the mock (as phase7.access does).
import { canOverride as _canOverride } from "./_core/access";
void _canOverride;
import { applyBlobChanges, appDataRouter, _itemHash, _allParsedBlobs, _clearBlobCache, BLOB_LIST_KINDS } from "./routers/appData";

const as = (u: any) => appDataRouter.createCaller({ user: u, req: { headers: {} }, res: { cookie() {} } } as any);
const uad = (userId: number) => rowsOf(userAppData).find((r) => r.userId === userId);

beforeEach(() => { tables.clear(); log.length = 0; failUpdateWhen = null; _clearBlobCache(); });

describe("aiChat / coachTrash lists", () => {
  for (const kind of ["aiChat", "coachTrash"] as const) {
    it(`${kind}: adds, edits and deletes round-trip through applyBlobChanges`, async () => {
      expect((BLOB_LIST_KINDS as readonly string[]).includes(kind)).toBe(true);
      rowsOf(userAppData).push({ id: 1, userId: 7 });
      const a = { id: "m1", text: "hello" }, b = { id: "m2", text: "world" };
      let r = await applyBlobChanges(fakeDb, 7, kind, { upserts: [{ id: "m1", raw: JSON.stringify(a) }, { id: "m2", raw: JSON.stringify(b) }], deletes: [] });
      expect(r.applied.map((x) => x.id)).toEqual(["m1", "m2"]);
      expect(JSON.parse(uad(7)![kind])).toEqual([a, b]);
      const a2 = { id: "m1", text: "hello again" };
      r = await applyBlobChanges(fakeDb, 7, kind, { upserts: [{ id: "m1", raw: JSON.stringify(a2), baseHash: _itemHash(JSON.stringify(a)) }], deletes: [{ id: "m2", baseHash: _itemHash(JSON.stringify(b)) }] });
      expect(r.conflicts).toEqual([]);
      expect(JSON.parse(uad(7)![kind])).toEqual([a2]);
      // a stale edit is refused and the stored copy comes back
      r = await applyBlobChanges(fakeDb, 7, kind, { upserts: [{ id: "m1", raw: JSON.stringify({ id: "m1", text: "stale" }), baseHash: _itemHash(JSON.stringify(a)) }], deletes: [] });
      expect(r.conflicts).toEqual([{ id: "m1", raw: JSON.stringify(a2) }]);
    });
  }
  it("save accepts and stores them, load and loadEntities return them", async () => {
    await as(USERS[1]).save({ aiChat: JSON.stringify([{ id: "c1", role: "user", text: "hi" }]), coachTrash: JSON.stringify([{ id: "t1" }]) });
    expect(JSON.parse(uad(2)!.aiChat)).toEqual([{ id: "c1", role: "user", text: "hi" }]);
    const l: any = await as(USERS[1]).load();
    expect(l.aiChat).toEqual([{ id: "c1", role: "user", text: "hi" }]);
    expect(l.coachTrash).toEqual([{ id: "t1" }]);
    const e: any = await as(USERS[1]).loadEntities();
    expect(e.aiChat).toEqual([{ id: "c1", role: "user", text: "hi" }]);
  });
});

describe("Money sharing (F33)", () => {
  it("shareAll no longer grants access; an explicit share still does", async () => {
    rowsOf(userAppData).push({ id: 1, userId: 1, finance: JSON.stringify({ _rev: 1, share: { shareAll: true, shareMode: "edit" } }) });
    rowsOf(userAppData).push({ id: 2, userId: 2, finance: JSON.stringify({ _rev: 1, share: { assignees: [3], shareMode: "view" } }) });
    const demo: any = await as(USERS[2]).sharedFinanceForMe();
    expect(demo.budgets.map((b: any) => b.ownerUserId)).toEqual([2]); // not the owner's shareAll budget
    const ann: any = await as(USERS[1]).sharedFinanceForMe();
    expect(ann.budgets).toEqual([]);
    const w: any = await as(USERS[2]).updateSharedFinance({ ownerUserId: 1, finance: JSON.stringify({ accounts: [] }), baseRev: 1 });
    expect(w).toMatchObject({ ok: false, error: "not authorized" });
  });
});

describe("shared edits are locked read-modify-writes (F61)", () => {
  it("updateSharedProject reads FOR UPDATE inside a transaction and writes before commit", async () => {
    rowsOf(userAppData).push({ id: 1, userId: 2, projects: JSON.stringify([{ id: "p1", name: "Old", assignees: [3] }]) });
    const r: any = await as(USERS[2]).updateSharedProject({ ownerUserId: 2, projectId: "p1", patch: { name: "New" } });
    expect(r).toEqual({ ok: true });
    const begin = log.indexOf("BEGIN");
    const lockAt = log.findIndex((l) => l.startsWith("select uad [v] FOR UPDATE (tx)"));
    const writeAt = log.findIndex((l) => l.startsWith("update uad") && l.includes("projects") && l.endsWith("(tx)"));
    const commit = log.indexOf("COMMIT");
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(begin < lockAt && lockAt < writeAt && writeAt < commit).toBe(true);
    expect(JSON.parse(uad(2)!.projects)[0].name).toBe("New");
  });
  for (const [proc, col, input] of [
    ["updateSharedProgram", "programs", { programId: "x", patch: { name: "N" } }],
    ["updateSharedMindMap", "mindmaps", { mindmapId: "x", patch: { name: "N" } }],
    ["updateSharedSheet", "sheets", { sheetId: "x", patch: { title: "N" } }],
    ["updateSharedDeck", "decks", { deckId: "x", patch: { title: "N" } }],
    ["updateSharedReport", "prefs", { reportId: "x", patch: { name: "N" } }],
  ] as const) {
    it(`${proc} locks the row too`, async () => {
      const v = col === "prefs" ? JSON.stringify({ savedReports: [{ id: "x", name: "O" }] }) : JSON.stringify([{ id: "x", name: "O", title: "O" }]);
      rowsOf(userAppData).push({ id: 1, userId: 2, [col]: v });
      const r: any = await (as(USERS[1]) as any)[proc]({ ownerUserId: 2, ...input });
      expect(r).toEqual({ ok: true });
      expect(log.some((l) => l === "select uad [v] FOR UPDATE (tx)")).toBe(true);
      expect(log.some((l) => l.startsWith("update uad") && l.includes(col) && l.includes("updatedAt") && l.endsWith("(tx)"))).toBe(true);
    });
  }
  it("updateSharedTask reads the task row FOR UPDATE in a transaction", async () => {
    rowsOf(tasksTable).push({ id: 9, userId: 2, taskId: "t1", raw: JSON.stringify({ id: "t1", title: "A", assignees: [3] }) });
    const r: any = await as(USERS[1]).updateSharedTask({ ownerUserId: 2, taskId: "t1", patch: { title: "B" } });
    expect(r).toEqual({ ok: true });
    expect(log.some((l) => l === "select tasks [*] FOR UPDATE (tx)")).toBe(true);
    expect(JSON.parse(rowsOf(tasksTable)[0].raw).title).toBe("B");
  });
});

describe("transferReportOwnership (F66)", () => {
  const seed = () => {
    rowsOf(userAppData).push({ id: 1, userId: 2, prefs: JSON.stringify({ savedReports: [{ id: "r1", name: "Q3" }] }) });
    rowsOf(userAppData).push({ id: 2, userId: 1, prefs: JSON.stringify({ savedReports: [] }) });
  };
  it("writes the receiver first, both inside one transaction", async () => {
    seed();
    const r: any = await as(USERS[0]).transferReportOwnership({ ownerUserId: 2, reportId: "r1" });
    expect(r.error ?? null).toBeNull(); expect(r).toMatchObject({ ok: true, newOwnerUserId: 1 });
    const writes = log.filter((l) => l.startsWith("update uad"));
    expect(writes[0]).toContain('"userId":1');
    expect(writes[1]).toContain('"userId":2');
    expect(writes.every((w) => w.endsWith("(tx)"))).toBe(true);
    expect(JSON.parse(uad(1)!.prefs).savedReports.map((x: any) => x.id)).toEqual(["r1"]);
    expect(JSON.parse(uad(2)!.prefs).savedReports).toEqual([]);
  });
  it("a failed second write loses nothing (the whole move rolls back)", async () => {
    seed();
    failUpdateWhen = (t, s, c) => t === userAppData && pairs(c).userId === 2;
    const r: any = await as(USERS[0]).transferReportOwnership({ ownerUserId: 2, reportId: "r1" });
    expect(r.ok).toBe(false);
    expect(JSON.parse(uad(2)!.prefs).savedReports.map((x: any) => x.id)).toEqual(["r1"]);
    expect(JSON.parse(uad(1)!.prefs).savedReports).toEqual([]);
  });
});

describe("shared readers (F71, F74)", () => {
  it("re-parse only rows whose stamp or length changed", async () => {
    const old = new Date(Date.now() - 60_000);
    rowsOf(userAppData).push({ id: 1, userId: 1, projects: JSON.stringify([{ id: "a" }]), updatedAt: old });
    rowsOf(userAppData).push({ id: 2, userId: 2, projects: JSON.stringify([{ id: "b" }]), updatedAt: old });
    // the fake can't compute LENGTH(); give the meta query what MySQL would return
    const realSelect = fakeDb.select;
    fakeDb.select = (cols?: any) => {
      const q = realSelect(cols);
      if (cols && cols.len) {
        const then = q.then;
        q.then = (res: any, rej: any) => then.call(q, (rows: any[]) => res(rows.map((r: any) => ({ ...r, len: Buffer.byteLength(uad(r.userId)!.projects) }))), rej);
      }
      return q;
    };
    try {
      let out = await _allParsedBlobs(fakeDb, "projects", []);
      expect(out.map((x) => x.value[0].id).sort()).toEqual(["a", "b"]);
      const fetchedFirst = log.filter((l) => l.includes("[userId,updatedAt,v]")).length;
      expect(fetchedFirst).toBe(1);
      log.length = 0;
      out = await _allParsedBlobs(fakeDb, "projects", []);
      expect(out.length).toBe(2);
      expect(log.filter((l) => l.includes("[userId,updatedAt,v]")).length).toBe(0); // nothing re-read
      // a write moves the stamp → only that row is fetched again
      uad(2)!.projects = JSON.stringify([{ id: "b2" }]);
      uad(2)!.updatedAt = new Date(Date.now() - 30_000);
      log.length = 0;
      out = await _allParsedBlobs(fakeDb, "projects", []);
      expect(out.find((x) => x.userId === 2)!.value[0].id).toBe("b2");
      expect(log.filter((l) => l.includes("[userId,updatedAt,v]")).length).toBe(1);
      // a write in the same second (stamp unchanged) but a different length is caught too
      uad(1)!.projects = JSON.stringify([{ id: "a-longer" }]);
      out = await _allParsedBlobs(fakeDb, "projects", []);
      expect(out.find((x) => x.userId === 1)!.value[0].id).toBe("a-longer");
    } finally { fakeDb.select = realSelect; }
  });
  it("a failing shared reader logs to the error log", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const realSelect = fakeDb.select;
    fakeDb.select = () => { throw new Error("boom"); };
    try {
      const r: any = await as(USERS[1]).sharedProjectsForMe();
      expect(r.ok).toBe(false);
      expect(spy.mock.calls.some((c) => String(c[0]).includes("shared projects"))).toBe(true);
    } finally { fakeDb.select = realSelect; spy.mockRestore(); }
  });
});

describe("load without a user_app_data row (F74)", () => {
  it("returns the task / note / idea tables instead of null", async () => {
    rowsOf(tasksTable).push({ id: 1, userId: 2, taskId: "t1", raw: JSON.stringify({ id: "t1", title: "Kept" }) });
    rowsOf(notesTable).push({ id: 1, userId: 2, noteId: "n1", raw: JSON.stringify({ id: "n1", title: "Note" }) });
    const r: any = await as(USERS[1]).load();
    expect(r).not.toBeNull();
    expect(r.tasks.map((t: any) => t.title)).toEqual(["Kept"]);
    expect(r.notes.map((t: any) => t.title)).toEqual(["Note"]);
    expect(r.ideas).toEqual([]);
    expect(r.projects).toBeNull();
  });
  it("still returns null for a brand-new account with nothing anywhere", async () => {
    expect(await as(USERS[2]).load()).toBeNull();
    void ideasTable;
  });
});
