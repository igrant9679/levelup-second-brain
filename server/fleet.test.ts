/**
 * The Fleet (build -295): the hand-off state machine both sides are held to, the key Mission Control
 * uses, its REST door (on a real express server and port), and the app's procedures.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const settings = new Map<string, string>();
vi.mock("./db", () => ({
  getDb: vi.fn(async () => null),
  getUserById: vi.fn(async (id: number) => (id === 1 ? { id: 1, openId: "owner-oid", role: "admin", name: "Owner" } : id === 3 ? { id: 3, openId: "m", role: "user", name: "Max" } : null)),
  getSystemSetting: vi.fn(async (k: string) => settings.get(k)),
  setSystemSetting: vi.fn(async (k: string, v: string) => { settings.set(k, v); }),
}));
vi.mock("./routers/appData", async (orig) => ({ ...(await orig<any>()), isOwnerCtxUser: vi.fn(async (u: any) => u?.id === 1) }));

import { fleetTransition, newFleetRow, makeFleetKey, parseFleetKey, keyMatches, cleanOutbox, type FleetState } from "./_core/fleet";
import { _setFleetStoreForTests, type FleetStore, type Shaped } from "./_core/fleetStore";
import { registerFleetRoutes } from "./_core/fleetApi";
import { fleetRouter } from "./routers/fleet";
import { _resetRateLimits } from "./_core/rateLimit";

/** In-memory store with the same contract as the database one. */
function memoryStore(): FleetStore & { rows: Map<number, any>; out: Map<number, any> } {
  const rows = new Map<number, any>();
  const out = new Map<number, any>();
  let next = 1;
  const shape = (r: any): Shaped => ({ ...JSON.parse(JSON.stringify(r)) });
  return {
    rows, out,
    async list(userId) { return [...rows.values()].filter((r) => r.userId === userId).map(shape); },
    async get(userId, id) { const r = rows.get(id); return r && r.userId === userId ? shape(r) : null; },
    async insert(userId, row) { const id = next++; rows.set(id, { ...row, id, userId, updatedAt: new Date().toISOString() }); return shape(rows.get(id)); },
    async mutate(userId, id, fn) {
      const r = rows.get(id);
      if (!r || r.userId !== userId) return { error: "No such hand-off" };
      const o = fn(shape(r));
      if ("error" in o) return { error: o.error };
      Object.assign(r, { status: o.status, data: o.data, updatedAt: new Date().toISOString() });
      return { row: shape(r) };
    },
    async outbox(userId) { return out.get(userId) ?? null; },
    async setOutbox(userId, items) { out.set(userId, { items, at: new Date().toISOString() }); },
    async context() { return { programs: [{ id: "1", name: "LSI Media" }], goals: [{ id: "g1", title: "Run a marathon" }] }; },
  };
}

const step = (row: { status: FleetState; data: any }, role: "owner" | "fleet", action: any, input: any = {}) => {
  const r = fleetTransition(row, role, action, input);
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("the hand-off state machine", () => {
  const fresh = () => newFleetRow({ title: "Draft the Q1 newsletter", kind: "task", refType: "task", refId: "42", area: { type: "client", name: "MeYouSocial" }, when: "2026-12-01", access: "edit", snapshot: { notes: "<b>use the brand voice</b>", due: "2026-12-03" } });

  it("a whole round: request → propose → approve → start → finish → accept", () => {
    let r: any = fresh();
    expect(r.status).toBe("requested");
    expect(r.data.snapshot.notes).not.toContain("<");
    r = step(r, "fleet", "propose", { machine: "Raider18", summary: "Claude Code on Raider18 in the MeYouSocial folder", place: "Raider18 · Claude Code", folder: "C:/w/mys" });
    expect(r.status).toBe("proposed");
    expect(r.data.claimedBy).toBe("Raider18");
    r = step(r, "owner", "approve");
    expect([r.status, r.data.approvedBy]).toEqual(["approved", "levelup"]);
    r = step(r, "fleet", "start", { machine: "Raider18", jobId: "sj-1" });
    expect(r.status).toBe("running");
    r = step(r, "fleet", "finish", { machine: "Raider18", result: "Done. <script>x</script>" });
    expect(r.status).toBe("review");
    expect(r.data.result.text).not.toContain("<script>");
    r = step(r, "owner", "accept");
    expect(r.status).toBe("done");
    expect(r.data.updates.map((u: any) => u.state).filter(Boolean)).toEqual(["requested", "proposed", "approved", "running", "review", "done"]);
    expect(r.data._rev).toBe(6);
  });

  it("nothing runs without approval", () => {
    const r: any = step(fresh(), "fleet", "propose", { machine: "A", summary: "plan" });
    expect(fleetTransition(r, "fleet", "start", { machine: "A" })).toEqual({ error: "not approved (proposed)" });
    expect(fleetTransition(fresh(), "owner", "approve")).toMatchObject({ error: expect.stringContaining("hasn't proposed") });
  });

  it("only the machine that claimed it moves it on", () => {
    let r: any = step(fresh(), "fleet", "propose", { machine: "A", summary: "plan" });
    expect(fleetTransition(r, "fleet", "propose", { machine: "B", summary: "mine" })).toMatchObject({ error: expect.stringContaining("already proposed by A") });
    r = step(r, "owner", "approve");
    expect(fleetTransition(r, "fleet", "start", { machine: "B" })).toMatchObject({ error: "claimed by A" });
    expect(fleetTransition(r, "fleet", "start", {})).toMatchObject({ error: "machine required" });
  });

  it("send back needs a reason and goes round again; Mission Control can approve and accept too", () => {
    let r: any = step(fresh(), "fleet", "propose", { machine: "A", summary: "plan" });
    r = step(r, "fleet", "approve", { machine: "A" });
    expect(r.data.approvedBy).toBe("mission-control");
    r = step(step(r, "fleet", "start", { machine: "A" }), "fleet", "finish", { machine: "A", result: "v1" });
    expect(fleetTransition(r, "owner", "sendBack", {})).toEqual({ error: "Say what should change" });
    r = step(r, "owner", "sendBack", { note: "shorter please" });
    expect(r.status).toBe("approved");
    r = step(step(r, "fleet", "start", { machine: "A" }), "fleet", "finish", { machine: "A", result: "v2" });
    r = step(r, "fleet", "done", { machine: "A" });
    expect(r.status).toBe("done");
  });

  it("cancel, acknowledgement, failure and try again", () => {
    let r: any = step(step(fresh(), "fleet", "propose", { machine: "A", summary: "plan" }), "owner", "approve");
    r = step(step(r, "fleet", "start", { machine: "A" }), "owner", "cancel");
    expect([r.status, r.data.cancelAck]).toEqual(["cancelled", false]);
    expect(fleetTransition(r, "owner", "cancel")).toEqual({ error: "It has already finished" });
    r = step(r, "fleet", "ackCancel", { machine: "A" });
    expect(r.data.cancelAck).toBe(true);
    let f: any = step(step(step(fresh(), "fleet", "propose", { machine: "A", summary: "p" }), "owner", "approve"), "fleet", "fail", { machine: "A", error: "folder missing" });
    expect([f.status, f.data.error]).toEqual(["failed", "folder missing"]);
    f = step(f, "owner", "retry");
    expect(f.status).toBe("approved"); // the approved plan stands
    const g: any = step(step(fresh(), "fleet", "fail", { machine: "A", error: "no place for it" }), "owner", "retry");
    expect([g.status, g.data.claimedBy]).toEqual(["requested", null]);
  });

  it("a new hand-off is checked and cleaned", () => {
    expect(() => newFleetRow({ title: "  " })).toThrow(/Say what/);
    const r = newFleetRow({ title: "x", area: { type: "nope", name: "y" }, when: "tomorrow", access: "whatever" });
    expect([r.data.area, r.data.when, r.data.access, r.refType]).toEqual([null, null, "edit", "text"]);
    expect(newFleetRow({ title: "x", access: "answer", area: { type: "personal", name: "Health", goalId: "g1", goalTitle: "Run" } }).data).toMatchObject({ access: "answer", area: { type: "personal", name: "Health", goalId: "g1" } });
  });
});

describe("the key", () => {
  it("is made once, stored only as a hash, and names its workspace and member", () => {
    const k = makeFleetKey(1, 7);
    expect(k.key).toMatch(/^luf_1_7_/);
    expect(k.stored).not.toContain(k.key.split("_")[3]);
    expect(parseFleetKey(k.key)).toEqual({ wsId: 1, userId: 7 });
    expect(keyMatches(k.key, k.stored)).toEqual({ userId: 7 });
    expect(keyMatches(k.key.slice(0, -1) + (k.key.endsWith("A") ? "B" : "A"), k.stored)).toBeNull();
    expect(keyMatches(k.key.replace("_7_", "_8_"), k.stored)).toBeNull();
    expect(keyMatches(k.key, undefined)).toBeNull();
    expect(parseFleetKey("luf_1_7_short")).toBeNull();
  });
  it("outbox items are cleaned and capped", () => {
    const items = cleanOutbox([{ id: "a", title: "<b>Merge #100</b>", kind: "yours", area: "LSI Media", due: "2026-12-01" }, { id: "a", title: "dupe" }, { id: "", title: "no id" }, { id: "b", title: "x", kind: "weird", due: "soon" }]);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("‹b›Merge #100‹/b›");
    expect([items[1].kind, items[1].due]).toEqual(["yours", null]);
    expect(cleanOutbox(Array.from({ length: 500 }, (_, i) => ({ id: String(i), title: "t" })))).toHaveLength(200);
  });
});

describe("Mission Control's door (real express, real port)", () => {
  const mem = memoryStore();
  const k = makeFleetKey(1, 1);
  const seen: string[] = [];
  let base = "";
  let server: any;
  const allowedUsers = new Set([1]);
  beforeEach(async () => {
    _resetRateLimits();
    _setFleetStoreForTests(mem);
    if (server) return;
    const app = express();
    app.use(express.json());
    app.set("trust proxy", true);
    registerFleetRoutes(app, {
      readKey: async (ws) => (ws === 1 ? k.stored : undefined),
      loadUser: async (id) => ({ id }),
      allowed: async (u) => allowedUsers.has(u.id),
      seen: async (_w, m) => { seen.push(m); },
    });
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => { server?.close(); _setFleetStoreForTests(null); });
  const call = (path: string, init: any = {}, key = k.key) => fetch(base + path, { ...init, headers: { "content-type": "application/json", "x-fleet-machine": "Raider18", ...(key ? { authorization: `Bearer ${key}` } : {}), ...(init.headers || {}) } });

  it("refuses a missing or wrong key, and slows down guessing", async () => {
    expect((await call("/api/fleet/v1/ping", {}, "")).status).toBe(401);
    expect((await call("/api/fleet/v1/ping", {}, k.key.replace(/.$/, "x"))).status).toBe(401);
    for (let i = 0; i < 20; i++) await call("/api/fleet/v1/ping", {}, "luf_1_1_wrongwrongwrongwrongwrong");
    const r = await call("/api/fleet/v1/ping");
    expect(r.status).toBe(429); // even the right key, from an address that guessed 20 times
  });

  it("works the whole round with the right key, and says no-store", async () => {
    const ping = await call("/api/fleet/v1/ping");
    expect(ping.status).toBe(200);
    expect(ping.headers.get("cache-control")).toBe("no-store");
    expect(seen).toContain("Raider18");
    const row = await mem.insert(1, newFleetRow({ title: "Write the onboarding email", area: { type: "client", name: "CommunityForce" } }));
    const other = await mem.insert(2, newFleetRow({ title: "someone else's" }));
    const list = await (await call("/api/fleet/v1/items")).json();
    expect(list.items.map((x: any) => x.id)).toEqual([row.id]); // only the key's own member
    const post = (id: number, body: any) => call(`/api/fleet/v1/items/${id}`, { method: "POST", body: JSON.stringify({ machine: "Raider18", ...body }) });
    expect((await post(other.id!, { action: "propose", summary: "x" })).status).toBe(404);
    expect((await post(row.id!, { action: "start" })).status).toBe(409); // not approved
    const p = await (await post(row.id!, { action: "propose", summary: "Claude Code on Raider18" })).json();
    expect(p.item.status).toBe("proposed");
    await mem.mutate(1, row.id!, (cur) => fleetTransition(cur, "owner", "approve"));
    expect((await (await post(row.id!, { action: "start", jobId: "sj-9" })).json()).item.status).toBe("running");
    expect((await (await post(row.id!, { action: "finish", result: "Here it is" })).json()).item.status).toBe("review");
    const ob = await call("/api/fleet/v1/outbox", { method: "PUT", body: JSON.stringify({ items: [{ id: "w1", title: "Merge #100", kind: "yours" }] }) });
    expect((await ob.json()).count).toBe(1);
    expect((await mem.outbox(1))!.items[0].title).toBe("Merge #100");
    expect((await (await call("/api/fleet/v1/context")).json()).programs[0].name).toBe("LSI Media");
  });

  it("stops at once when the account may no longer use the Fleet", async () => {
    allowedUsers.delete(1);
    expect((await call("/api/fleet/v1/items")).status).toBe(403);
    allowedUsers.add(1);
  });
});

describe("the app's procedures", () => {
  const mem = memoryStore();
  const as = (user: any) => fleetRouter.createCaller({ user, req: { headers: {} } } as any);
  const OWNER = { id: 1, openId: "owner-oid", role: "admin", name: "Owner" };
  const MEMBER = { id: 3, openId: "m", role: "user", name: "Max" };
  beforeEach(() => { _setFleetStoreForTests(mem); });

  it("a member doesn't see or reach the Fleet", async () => {
    expect(await as(MEMBER).status()).toEqual({ allowed: false });
    await expect(as(MEMBER).list()).rejects.toThrow(/owner only/);
    await expect(as(MEMBER).request({ title: "x" } as any)).rejects.toThrow(/owner only/);
    await expect(as(MEMBER).connect()).rejects.toThrow(/owner only/);
  });

  it("the owner connects (key shown once), hands a task off, and can't hand the same task off twice", async () => {
    const c = await as(OWNER).connect();
    expect(c.key).toMatch(/^luf_1_1_/);
    const st = await as(OWNER).status();
    expect(st).toMatchObject({ allowed: true, connected: true, hint: c.hint });
    expect(JSON.stringify(st)).not.toContain(c.key);
    const r = await as(OWNER).request({ title: "Plan the launch post", kind: "task", refType: "task", refId: "77", access: "edit", area: { type: "client", name: "MeYouSocial" } } as any);
    expect(r.status).toBe("requested");
    await expect(as(OWNER).request({ title: "Plan the launch post", kind: "task", refType: "task", refId: "77", access: "edit" } as any)).rejects.toThrow(/already with the Fleet/);
    await expect(as(OWNER).act({ id: r.id!, action: "approve" })).rejects.toThrow(/hasn't proposed/);
    await mem.mutate(1, r.id!, (cur) => fleetTransition(cur, "fleet", "propose", { machine: "A", summary: "plan" }));
    expect((await as(OWNER).act({ id: r.id!, action: "approve" }))!.status).toBe("approved");
    const l = await as(OWNER).list();
    expect(l.items).toHaveLength(1);
    await as(OWNER).disconnect();
    expect((await as(OWNER).status())).toMatchObject({ connected: false });
  });
});
