/**
 * F12 (audit 2026-10-25): display name and email are unverified and editable,
 * so they must never decide who sees or edits another member's item.
 * Access is authorized on numeric user ids only (assignees / primaryAssigneeId,
 * and for a legacy task/note with no id list the owner-save `assigneeId`
 * stamp).
 *
 * Cast: user 1 = workspace OWNER; user 2 = Ann, a member who owns the items;
 * user 3 = Mallory, a member who renamed herself "Pat Lee" (a teammate Ann
 * assigned work to by name before Pat had an account) and whose email was
 * changed to "quinn@team.test" (an assignment string on another item);
 * user 4 = Quinn, a real teammate assigned BY ID.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { tasksTable, notesTable, userAppData, users } from "../drizzle/schema";

// ── in-memory DB that understands eq / ne / and ─────────────────────────────
type Row = Record<string, any>;
const store = new Map<any, Row[]>();
function rows(t: any) { if (!store.has(t)) store.set(t, []); return store.get(t)!; }
type Cmp = { col: string; op: "eq" | "ne"; value: any };
/** Flatten a drizzle eq()/ne()/and() SQL tree into column comparisons. */
function comparisons(cond: any): Cmp[] {
  const out: Cmp[] = [];
  let col: string | null = null, op: "eq" | "ne" = "eq";
  const walk = (n: any) => {
    if (!n || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.name && n.table && n.columnType) { col = n.name; op = "eq"; return; }
    if (Array.isArray(n.value) && n.value.every((x: any) => typeof x === "string")) {
      const s = n.value.join("");
      if (s.includes("<>")) op = "ne"; else if (s.includes("=")) op = "eq";
      return;
    }
    if ("value" in n && "encoder" in n) { if (col) { out.push({ col, op, value: n.value }); col = null; } return; }
    if (n.queryChunks) walk(n.queryChunks);
  };
  walk(cond);
  return out;
}
const matches = (r: Row, cs: Cmp[]) => cs.every((c) => c.op === "eq" ? String(r[c.col]) === String(c.value) : (r[c.col] != null && String(r[c.col]) !== String(c.value)));
function selectQ(cols: any) {
  let t: any, cond: any = null, lim = Infinity;
  const q: any = {
    from(x: any) { t = x; return q; },
    where(c: any) { cond = c; return q; },
    orderBy() { return q; },
    limit(n: number) { lim = n; return q; },
    then(res: any, rej: any) {
      const cs = cond ? comparisons(cond) : [];
      let out = rows(t).filter((r) => matches(r, cs)).sort((a, b) => a.id - b.id).slice(0, lim);
      if (cols) out = out.map((r) => { const o: Row = {}; for (const [k, c] of Object.entries<any>(cols)) o[k] = r[c.name]; return o; });
      return Promise.resolve(out).then(res, rej);
    },
  };
  return q;
}
const fakeDb: any = {
  select: (cols?: any) => selectQ(cols),
  update: (t: any) => ({ set: (s: any) => ({ where: (c: any) => Promise.resolve().then(() => { const cs = comparisons(c); rows(t).filter((r) => matches(r, cs)).forEach((r) => Object.assign(r, s)); return [{ affectedRows: 1 }]; }) }) }),
  insert: (t: any) => ({
    values: (v: any) => {
      const list = Array.isArray(v) ? v : [v];
      const add = () => { for (const r of list) rows(t).push({ id: rows(t).length + 100, ...r }); };
      // userAppData upsert: never adds a row here (the test seeds them)
      return { then: (a: any, b: any) => Promise.resolve().then(add).then(a, b), onDuplicateKeyUpdate: () => Promise.resolve() };
    },
  }),
  delete: () => ({ where: () => Promise.resolve() }),
  transaction: async (fn: any) => fn(fakeDb),
};

const ACCOUNTS: Row[] = [
  { id: 1, openId: "owner-oid", role: "admin", name: "Owner", email: "owner@team.test" },
  { id: 2, openId: "email:ann@team.test", role: "user", name: "Ann", email: "ann@team.test" },
  { id: 3, openId: "email:quinn@team.test", role: "user", name: "Pat Lee", email: "quinn@team.test" },
  { id: 4, openId: "email:q4@team.test", role: "user", name: "Quinn", email: "q4@team.test" },
];
vi.mock("./db", () => ({
  getDb: vi.fn(async () => fakeDb),
  getUserById: vi.fn(async (id: number) => ACCOUNTS.find((u) => u.id === id) ?? null),
  adminListAllUsers: vi.fn(async () => ACCOUNTS.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, hasSmtp: false, lastSignedIn: null }))),
  getUserByEmail: vi.fn(async (e: string) => ACCOUNTS.find((u) => u.email === e) ?? undefined),
  updateUserName: vi.fn(async () => {}),
  updateUserEmail: vi.fn(async () => {}),
}));
// updateEmail re-issues the session cookie; no JWT secret in tests.
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: vi.fn(async () => "tok"), authenticateRequest: vi.fn() } }));
vi.mock("./routers/appData", async (orig) => ({ ...(await orig<any>()), isOwnerCtxUser: vi.fn(async (u: any) => u?.id === 1) }));

import * as dbMod from "./db";
import { appDataRouter, _taskAssignedTo, _idAssigned, _resolveUserIdMap, _invalidateUserIdMap, applyEntityChanges } from "./routers/appData";
import { emailAuthRouter } from "./routers/emailAuth";
import bcrypt from "bcryptjs";

const as = (router: any, user: any) => router.createCaller({ user, req: { headers: {} }, res: { cookie: vi.fn(), clearCookie: vi.fn() } } as any);
const OWNER = ACCOUNTS[0], ANN = ACCOUNTS[1], MALLORY = ACCOUNTS[2], QUINN = ACCOUNTS[3];

// Ann's items. "str" = assigned only by a string that now matches Mallory's
// (renamed) display name or (changed) email; "id3" = assigned to Mallory by
// id; "id4" = assigned to Quinn by id while its label names Mallory's email.
const blobItems = (kind: string) => [
  { id: kind + "-str", name: "By name", title: "By name", assignedTo: "Pat Lee", assignee: "pat lee" },
  { id: kind + "-mail", name: "By email", title: "By email", assignedTo: "quinn@team.test" },
  { id: kind + "-id3", name: "Mine by id", title: "Mine by id", assignees: [3], assigneeNames: ["Pat Lee"], primaryAssigneeId: 3, assignedTo: "Pat Lee" },
  { id: kind + "-id4", name: "Quinn's", title: "Quinn's", assignees: [4], assigneeNames: ["Quinn"], primaryAssigneeId: 4, assignedTo: "quinn@team.test" },
];
function seed() {
  store.clear();
  rows(users).push(...ACCOUNTS.map((u) => ({ ...u })));
  const t = (id: string, json: any, assigneeId: number | null = null) => ({ id: rows(tasksTable).length + 1, userId: 2, taskId: id, title: id, assignedTo: json.assignedTo ?? null, assigneeId, raw: JSON.stringify({ id, title: id, status: "Not Started", ...json }) });
  rows(tasksTable).push(
    t("t-str", { assignedTo: "Pat Lee" }),
    t("t-mail", { assignedTo: "quinn@team.test" }),
    t("t-id3", { assignees: [3], primaryAssigneeId: 3, assignedTo: "Pat Lee" }, 3),
    t("t-id4", { assignees: [4], primaryAssigneeId: 4, assignedTo: "quinn@team.test" }, 4),
    // legacy, string-only, stamped on Ann's own save while "Quinn" was unique
    t("t-legacy4", { assignedTo: "Quinn" }, 4),
    // the column says Mallory but the JSON's id list says Quinn — ids win
    t("t-stale", { assignees: [4] }, 3),
  );
  const n = (id: string, json: any, assigneeId: number | null = null) => ({ id: rows(notesTable).length + 1, userId: 2, noteId: id, title: id, assigneeId, raw: JSON.stringify({ id, title: id, body: "x", ...json }) });
  rows(notesTable).push(
    n("n-str", { assignedTo: "Pat Lee" }),
    n("n-mail", { assignedTo: "quinn@team.test" }),
    n("n-id3", { assignees: [3], primaryAssigneeId: 3 }),
  );
  const prefs = { savedReports: blobItems("rep") };
  rows(userAppData).push(
    { id: 1, userId: 2, projects: JSON.stringify(blobItems("proj")), programs: JSON.stringify(blobItems("prog")), mindmaps: JSON.stringify(blobItems("mm")), sheets: JSON.stringify(blobItems("sh")), decks: JSON.stringify(blobItems("dk")), prefs: JSON.stringify(prefs), finance: JSON.stringify({ share: { assignees: [4], assigneeNames: ["Quinn"], shareMode: "edit" }, _rev: 1 }) },
    { id: 2, userId: 3, projects: "[]", programs: "[]", mindmaps: "[]", sheets: "[]", decks: "[]", prefs: "{}", finance: null },
  );
}
beforeEach(() => { seed(); _invalidateUserIdMap(); });

const ids = (list: any[]) => list.map((x) => String(x.id)).sort();

describe("F12: a renamed member gets nothing from an assignment string", () => {
  it("tasks: only id-assigned tasks are shared with her", async () => {
    const r: any = await as(appDataRouter, MALLORY).sharedTasksForMe();
    expect(r.ok).toBe(true);
    expect(ids(r.tasks)).toEqual(["t-id3"]);
  });
  it("tasks: she cannot edit or change the status of string-assigned ones", async () => {
    for (const taskId of ["t-str", "t-mail", "t-legacy4", "t-stale"]) {
      expect(await as(appDataRouter, MALLORY).updateSharedTask({ ownerUserId: 2, taskId, patch: { title: "pwned" } })).toMatchObject({ ok: false, error: "not authorized" });
      expect(await as(appDataRouter, MALLORY).updateSharedTaskStatus({ ownerUserId: 2, taskId, status: "Done" })).toMatchObject({ ok: false, error: "not authorized" });
    }
    expect(rows(tasksTable).every((r) => r.title !== "pwned")).toBe(true);
  });
  it("notes: only id-assigned notes are shared, string ones can't be edited", async () => {
    const r: any = await as(appDataRouter, MALLORY).sharedNotesForMe();
    expect(ids(r.notes)).toEqual(["n-id3"]);
    for (const noteId of ["n-str", "n-mail"]) {
      expect(await as(appDataRouter, MALLORY).updateSharedNote({ ownerUserId: 2, noteId, patch: { title: "pwned" } })).toMatchObject({ ok: false, error: "not authorized" });
    }
  });
  it("projects, programs, mind maps, sheets, decks, reports: ids only", async () => {
    const me = as(appDataRouter, MALLORY);
    expect(ids(((await me.sharedProjectsForMe()) as any).projects)).toEqual(["proj-id3"]);
    expect(ids(((await me.sharedProgramsForMe()) as any).programs)).toEqual(["prog-id3"]);
    expect(ids(((await me.sharedMindMapsForMe()) as any).mindmaps)).toEqual(["mm-id3"]);
    expect(ids(((await me.sharedSheetsForMe()) as any).sheets)).toEqual(["sh-id3"]);
    expect(ids(((await me.sharedDecksForMe()) as any).decks)).toEqual(["dk-id3"]);
    expect(ids(((await me.sharedReportsForMe()) as any).reports)).toEqual(["rep-id3"]);
  });
  it("... and none of their string-assigned items can be written", async () => {
    const me = as(appDataRouter, MALLORY);
    for (const sfx of ["str", "mail", "id4"]) {
      expect(await me.updateSharedProject({ ownerUserId: 2, projectId: "proj-" + sfx, patch: { name: "pwned" } })).toMatchObject({ ok: false, error: "not authorized" });
      expect(await me.updateSharedProgram({ ownerUserId: 2, programId: "prog-" + sfx, patch: { name: "pwned" } })).toMatchObject({ ok: false, error: "not authorized" });
      expect(await me.updateSharedMindMap({ ownerUserId: 2, mindmapId: "mm-" + sfx, patch: { name: "pwned" } })).toMatchObject({ ok: false, error: "not authorized" });
      expect(await me.updateSharedSheet({ ownerUserId: 2, sheetId: "sh-" + sfx, patch: { title: "pwned" } })).toMatchObject({ ok: false, error: "not authorized" });
      expect(await me.updateSharedDeck({ ownerUserId: 2, deckId: "dk-" + sfx, patch: { title: "pwned" } })).toMatchObject({ ok: false, error: "not authorized" });
      expect(await me.updateSharedReport({ ownerUserId: 2, reportId: "rep-" + sfx, patch: { name: "pwned" } })).toMatchObject({ ok: false, error: "not authorized" });
    }
    expect(JSON.stringify(rows(userAppData)[0])).not.toContain("pwned");
  });
  it("Money: a budget shared with another id stays closed to her", async () => {
    const r: any = await as(appDataRouter, MALLORY).sharedFinanceForMe();
    expect(r.budgets).toEqual([]);
    expect(await as(appDataRouter, MALLORY).updateSharedFinance({ ownerUserId: 2, finance: "{}" })).toMatchObject({ ok: false, error: "not authorized" });
  });
  it("the access helpers never look at strings", () => {
    expect(_idAssigned({ assignedTo: "Pat Lee", assignee: "Pat Lee" }, 3)).toBe(false);
    expect(_idAssigned({ assignees: ["3"] }, 3)).toBe(true);
    expect(_idAssigned({ primaryAssigneeId: 3 }, 3)).toBe(true);
    expect(_taskAssignedTo({ raw: JSON.stringify({ assignedTo: "Pat Lee" }), assigneeId: null }, 3)).toBe(false);
    expect(_taskAssignedTo({ raw: "not json", assigneeId: 3 }, 3)).toBe(false);
  });
});

describe("F12: id-based assignment still works", () => {
  it("an id assignee sees and edits her item", async () => {
    const me = as(appDataRouter, MALLORY);
    expect(await me.updateSharedTask({ ownerUserId: 2, taskId: "t-id3", patch: { status: "In Progress" } })).toMatchObject({ ok: true });
    expect(await me.updateSharedTaskStatus({ ownerUserId: 2, taskId: "t-id3", status: "Done" })).toMatchObject({ ok: true });
    expect(await me.updateSharedProject({ ownerUserId: 2, projectId: "proj-id3", patch: { status: "Active" } })).toMatchObject({ ok: true });
    expect(await me.updateSharedSheet({ ownerUserId: 2, sheetId: "sh-id3", patch: { title: "Edited" } })).toMatchObject({ ok: true });
    expect(await me.updateSharedNote({ ownerUserId: 2, noteId: "n-id3", patch: { title: "Edited" } })).toMatchObject({ ok: true });
  });
  it("Quinn sees what is assigned to him by id, plus the owner-stamped legacy task — not the stale stamp's", async () => {
    const r: any = await as(appDataRouter, QUINN).sharedTasksForMe();
    expect(ids(r.tasks)).toEqual(["t-id4", "t-legacy4", "t-stale"]);
    expect(ids(((await as(appDataRouter, QUINN).sharedProjectsForMe()) as any).projects)).toEqual(["proj-id4"]);
    const f: any = await as(appDataRouter, QUINN).sharedFinanceForMe();
    expect(f.budgets.map((b: any) => b.ownerUserId)).toEqual([2]);
  });
  it("an assignee sending a bare name cannot move the access stamp", async () => {
    expect(await as(appDataRouter, MALLORY).updateSharedTask({ ownerUserId: 2, taskId: "t-id3", patch: { assignedTo: "Quinn" } })).toMatchObject({ ok: true });
    expect(rows(tasksTable).find((r) => r.taskId === "t-id3")!.assigneeId).toBe(3);
  });
});

describe("F12: the owner's own items are unaffected", () => {
  it("Ann still lists her delegated tasks and projects and can edit any of them", async () => {
    const me = as(appDataRouter, ANN);
    const r: any = await me.sharedTasksForMe();
    expect(ids(r.tasks)).toEqual(["t-id3", "t-id4", "t-legacy4", "t-stale"]); // stamped to someone else
    const p: any = await me.sharedProjectsForMe();
    expect(ids(p.projects)).toEqual(["proj-id3", "proj-id4", "proj-mail", "proj-str"]);
    for (const taskId of ["t-str", "t-mail", "t-id4"]) {
      expect(await me.updateSharedTask({ ownerUserId: 2, taskId, patch: { priority: "High" } })).toMatchObject({ ok: true });
    }
    expect(await me.updateSharedProject({ ownerUserId: 2, projectId: "proj-str", patch: { status: "Done" } })).toMatchObject({ ok: true });
    expect(await me.updateSharedNote({ ownerUserId: 2, noteId: "n-str", patch: { title: "Mine" } })).toMatchObject({ ok: true });
  });
  it("the workspace owner still sees every member's items", async () => {
    const r: any = await as(appDataRouter, OWNER).sharedTasksForMe();
    expect(r.tasks.filter((t: any) => t._sharedFromUserId === 2).length).toBe(6);
  });
  it("the owner's own save stamps ids first, and a legacy string only when it is unambiguous", async () => {
    await applyEntityChanges(fakeDb, 2, "tasks", {
      upserts: [
        { id: "s1", raw: JSON.stringify({ id: "s1", title: "s1", assignees: [4], primaryAssigneeId: 4, assignedTo: "Pat Lee" }) },
        { id: "s2", raw: JSON.stringify({ id: "s2", title: "s2", assignedTo: "Quinn" }) },
        { id: "s3", raw: JSON.stringify({ id: "s3", title: "s3", assignees: [], assignedTo: "Quinn" }) },
      ], deletes: [], order: [],
    } as any);
    const stamp = (id: string) => rows(tasksTable).find((r) => r.taskId === id)?.assigneeId ?? null;
    expect(stamp("s1")).toBe(4);   // the id, not the name in the label
    expect(stamp("s2")).toBe(4);   // Ann's legacy string, resolved on HER save
    expect(stamp("s3")).toBe(null); // an explicit empty id list wins over the label
  });
  it("a display name typed to equal another account's email resolves to nobody", async () => {
    ACCOUNTS.push({ id: 5, openId: "email:eve@team.test", role: "user", name: "q4@team.test", email: "eve@team.test" });
    try {
      _invalidateUserIdMap();
      const m = await _resolveUserIdMap();
      expect(m.get("q4@team.test")).toBeUndefined();
      expect(m.get("quinn")).toBe(4);
    } finally { ACCOUNTS.pop(); _invalidateUserIdMap(); }
  });
});

describe("F12: names and emails another account uses are refused", () => {
  const ctxUser = async (u: Row) => ({ ...u, passwordHash: await bcrypt.hash("pw", 4) });
  it("updateName refuses another account's name or email (any case), allows a fresh one", async () => {
    const me = as(emailAuthRouter, await ctxUser(MALLORY));
    await expect(me.updateName({ newName: "  quinn " })).rejects.toThrow(/already uses this name/);
    await expect(me.updateName({ newName: "ANN@team.test" })).rejects.toThrow(/already uses this name/);
    await expect(me.updateName({ newName: "Mallory" })).resolves.toMatchObject({ success: true });
    await expect(me.updateName({ newName: "pat lee" })).resolves.toMatchObject({ success: true }); // her own current name
    expect(vi.mocked(dbMod.updateUserName)).toHaveBeenCalledTimes(2);
  });
  it("updateEmail refuses another account's email case-insensitively", async () => {
    const me = as(emailAuthRouter, await ctxUser(MALLORY));
    await expect(me.updateEmail({ newEmail: "Q4@Team.Test", currentPassword: "pw" })).rejects.toThrow(/already in use/);
    await expect(me.updateEmail({ newEmail: "ann@team.test", currentPassword: "pw" })).rejects.toThrow(/already in use/);
    vi.mocked(dbMod.updateUserEmail).mockClear();
    await expect(me.updateEmail({ newEmail: "mallory@team.test", currentPassword: "pw" })).resolves.toMatchObject({ success: true });
    expect(vi.mocked(dbMod.updateUserEmail)).toHaveBeenCalledWith(3, "mallory@team.test");
  });
});
