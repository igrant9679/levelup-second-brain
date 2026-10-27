/**
 * Audit 2, Phase 0 (build -253) — teammate access. OWNER = user 1. Teammates
 * are ordinary members unless the owner grants admin, and admin never reaches
 * the owner's data. ADMIN = a teammate the owner made admin; MEMBER = an
 * ordinary teammate (user 3).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { userAppData, users, tasksTable } from "../drizzle/schema";

const state = {
  appRow: null as any,
  tasks: [] as any[],
  updates: [] as Array<{ table: any; set: any }>,
  settings: new Map<string, string>(),
  userQueue: [] as any[][],
};
const ACCOUNTS: Record<number, any> = {
  1: { id: 1, openId: "owner-oid", role: "admin", name: "Owner" },
  2: { id: 2, openId: "email:admin@x", role: "admin", name: "Ada" },
  3: { id: 3, openId: "email:member@x", role: "user", name: "Max" },
};

/** Chainable drizzle stand-in: awaiting any chain resolves to `result`. */
function chain(result: any): any {
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return () => p;
    },
  });
  return p;
}
const resultFor = (t: any) => {
  if (t === users) return state.userQueue.length ? state.userQueue.shift() : [{ id: 1 }];
  if (t === userAppData) return state.appRow ? [state.appRow] : [];
  if (t === tasksTable) return state.tasks;
  return [];
};
const fakeDb: any = {
  select: () => ({ from: (t: any) => chain(resultFor(t)) }),
  update: (table: any) => ({ set: (s: any) => { state.updates.push({ table, set: s }); return chain([{ affectedRows: 1 }]); } }),
  insert: () => ({ values: () => ({ onDuplicateKeyUpdate: async ({ set }: any) => { state.updates.push({ table: userAppData, set }); } }) }),
  delete: () => chain([]),
  transaction: async (fn: any) => fn(fakeDb),
};

vi.mock("./db", () => ({
  getDb: vi.fn(async () => fakeDb),
  getUserById: vi.fn(async (id: number) => ACCOUNTS[id] ?? null),
  adminListAllUsers: vi.fn(async () => Object.values(ACCOUNTS).map((u: any) => ({ ...u, email: u.name + "@x", hasSmtp: false, lastSignedIn: null }))),
  deleteTeamMember: vi.fn(async () => {}),
  getTeamMembers: vi.fn(async () => []),
  getSystemSetting: vi.fn(async (k: string) => state.settings.get(k)),
  setSystemSetting: vi.fn(async (k: string, v: string) => { state.settings.set(k, v); }),
}));
// canOverride / ownerGuard reach the owner rule through this module; inside
// appData.ts the real isOwnerCtxUser runs (first user = 1 via the fake DB).
vi.mock("./routers/appData", async (orig) => ({ ...(await orig<any>()), isOwnerCtxUser: vi.fn(async (u: any) => u?.id === 1 || u?.openId === "owner-oid") }));

import { canOverride } from "./_core/access";
import { appDataRouter } from "./routers/appData";
import { teamRouter } from "./routers/team";
import { activityFeedRouter } from "./routers/activityFeed";
import { atlasRouter } from "./routers/atlas";
import { demoteInvitedAdminsOnce } from "./_core/roleMigration";
import { ENV } from "./_core/env";

const OWNER = ACCOUNTS[1], ADMIN = ACCOUNTS[2], MEMBER = ACCOUNTS[3];
const as = (router: any, user: any) => router.createCaller({ user, req: { headers: {} } } as any);

beforeEach(() => {
  state.appRow = null; state.tasks = []; state.updates = []; state.settings.clear(); state.userQueue = [];
});

describe("canOverride", () => {
  it("lets the owner act on anyone", async () => {
    expect(await canOverride(OWNER, 2)).toBe(true);
    expect(await canOverride(OWNER, 3)).toBe(true);
  });
  it("lets a granted admin act on members but never on the owner", async () => {
    expect(await canOverride(ADMIN, 3)).toBe(true);
    expect(await canOverride(ADMIN, 1)).toBe(false);
    expect(await canOverride(ADMIN, 999)).toBe(false); // unknown account → refuse
  });
  it("gives an ordinary member nothing over others", async () => {
    expect(await canOverride(MEMBER, 2)).toBe(false);
    expect(await canOverride(MEMBER, 1)).toBe(false);
  });
});

describe("cross-user tools", () => {
  it("bulk-deleting other people's tasks is owner only", async () => {
    const r: any = await as(appDataRouter, ADMIN).adminDeleteSharedTasks({});
    expect(r).toMatchObject({ ok: false, error: "Workspace owner only." });
    const o: any = await as(appDataRouter, OWNER).adminDeleteSharedTasks({});
    expect(o).toMatchObject({ ok: true, preview: true });
  });
  it("the other two cleanup tools are owner only", async () => {
    expect(await as(appDataRouter, ADMIN).adminRemoveNiftyDuplicates({})).toMatchObject({ ok: false, error: "Workspace owner only." });
    expect(await as(appDataRouter, ADMIN).backfillTeamVisibilityIds()).toMatchObject({ ok: false, error: "Workspace owner only." });
  });
  it("an admin cannot take over or delete the owner's items", async () => {
    const t: any = await as(appDataRouter, ADMIN).transferItemOwnership({ ownerUserId: 1, kind: "tasks", itemId: "5" });
    expect(t.ok).toBe(false);
    expect(String(t.error)).toMatch(/workspace owner/i);
    const r: any = await as(appDataRouter, ADMIN).transferReportOwnership({ ownerUserId: 1, reportId: "r1" });
    expect(String(r.error)).toMatch(/workspace owner/i);
    const d: any = await as(appDataRouter, ADMIN).deleteSharedItem({ ownerUserId: 1, kind: "tasks", itemId: "5" });
    expect(d).toMatchObject({ ok: false, error: "not authorized" });
  });
  it("an ordinary member cannot delete another member's items", async () => {
    const d: any = await as(appDataRouter, MEMBER).deleteSharedItem({ ownerUserId: 2, kind: "notes", itemId: "n1" });
    expect(d).toMatchObject({ ok: false, error: "not authorized" });
  });
  it("a granted admin can still manage a member's items", async () => {
    const d: any = await as(appDataRouter, ADMIN).deleteSharedItem({ ownerUserId: 3, kind: "tasks", itemId: "5" });
    expect(d).toMatchObject({ ok: true });
  });
});

describe("Atlas is the owner's only", () => {
  const snap = JSON.stringify({ departments: [{ members: [{ name: "Candidate", salaryK: 140 }] }] });
  it("a member's load gets no snapshot and their stale copy is cleared", async () => {
    state.appRow = { userId: 3, atlas: snap, prefs: "{}" };
    const r: any = await as(appDataRouter, MEMBER).load();
    expect(r.atlas).toBeNull();
    expect(state.updates.some((u) => u.table === userAppData && u.set.atlas === null)).toBe(true);
  });
  it("the owner still gets it", async () => {
    state.appRow = { userId: 1, atlas: snap, prefs: "{}" };
    const r: any = await as(appDataRouter, OWNER).load();
    expect(r.atlas.departments.length).toBe(1);
  });
  it("a member's save cannot write a snapshot back", async () => {
    await as(appDataRouter, MEMBER).save({ atlas: snap, prefs: "{}" } as any);
    expect(state.updates.every((u) => !("atlas" in u.set) || u.set.atlas === null)).toBe(true);
  });
  it("pulling from Atlas is owner only", async () => {
    await expect(as(atlasRouter, ADMIN).pull()).rejects.toThrow(/owner/i);
  });
});

describe("team roles", () => {
  it("only the owner grants admin, and never changes the owner", async () => {
    await expect(as(teamRouter, ADMIN).setRole({ userId: 3, role: "admin" })).rejects.toThrow(/owner/i);
    await expect(as(teamRouter, OWNER).setRole({ userId: 1, role: "user" })).rejects.toThrow(/owner keeps/i);
    const r: any = await as(teamRouter, OWNER).setRole({ userId: 3, role: "admin" });
    expect(r).toMatchObject({ ok: true, role: "admin" });
    expect(state.updates.some((u) => u.table === users && u.set.role === "admin")).toBe(true);
  });
  it("members cannot remove accounts; admins cannot remove the owner", async () => {
    await expect(as(teamRouter, MEMBER).deleteMember({ userId: 2 })).rejects.toThrow(/owner/i);
    await expect(as(teamRouter, ADMIN).deleteMember({ userId: 1 })).rejects.toThrow(/owner/i);
    await expect(as(teamRouter, OWNER).deleteMember({ userId: 3 })).resolves.toMatchObject({ success: true });
  });
  it("the member list marks the owner", async () => {
    const list: any[] = await as(teamRouter, MEMBER).listMembers();
    expect(list.find((u) => u.id === 1).owner).toBe(true);
    expect(list.filter((u) => u.owner).length).toBe(1);
  });
  it("the activity feed is owner only", async () => {
    await expect(as(activityFeedRouter, ADMIN).getTeamMembers()).rejects.toThrow(/owner/i);
    await expect(as(activityFeedRouter, OWNER).getTeamMembers()).resolves.toBeTruthy();
  });
});

describe("one-time role change", () => {
  it("turns every admin except the owner into a member, once", async () => {
    const prev = ENV.ownerOpenId;
    (ENV as any).ownerOpenId = "owner-oid";
    try {
      state.userQueue = [[{ id: 1 }], [{ id: 2 }, { id: 4 }]];
      const r = await demoteInvitedAdminsOnce();
      expect(r).toMatchObject({ done: true, demoted: [2, 4] });
      expect(state.updates.some((u) => u.table === users && u.set.role === "user")).toBe(true);
      const again = await demoteInvitedAdminsOnce();
      expect(again).toMatchObject({ done: false, reason: "already done" });
    } finally { (ENV as any).ownerOpenId = prev; }
  });
  it("does nothing without OWNER_OPEN_ID", async () => {
    const prev = ENV.ownerOpenId;
    (ENV as any).ownerOpenId = "";
    try {
      const r = await demoteInvitedAdminsOnce();
      expect(r.done).toBe(false);
      expect(state.updates.length).toBe(0);
    } finally { (ENV as any).ownerOpenId = prev; }
  });
});
