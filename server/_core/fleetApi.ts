/**
 * The door Mission Control knocks on (build -295). Mission Control runs on the owner's own computers and
 * accepts no connections, so it calls these with the key the owner made in LevelUp (Fleet → Connect):
 *
 *   GET  /api/fleet/v1/ping              who the key belongs to
 *   GET  /api/fleet/v1/items             hand-offs to work on (open ones, recent finished, unacknowledged cancels)
 *   POST /api/fleet/v1/items/:id         {action, machine, …} — one step of fleet.ts's state machine
 *   PUT  /api/fleet/v1/outbox            {items} — what Mission Control says the owner should do
 *   GET  /api/fleet/v1/context           the owner's client programs and goals (names), for areas
 *
 * Every answer is no-store. A wrong or missing key counts against the caller's address: 20 a quarter hour.
 * The key must still belong to the workspace's owner, and the Fleet must still be allowed there.
 */
import type { Express } from "express";
import { fleetTransition, keyMatches, parseFleetKey, cleanOutbox, plain } from "./fleet";
import { fleetStore, fleetAllowed } from "./fleetStore";
import { blocked, hit, clientIp } from "./rateLimit";

export interface FleetDeps {
  readKey(wsId: number): Promise<string | undefined>;
  loadUser(userId: number): Promise<any | null>;
  allowed(user: any): Promise<boolean>;
  seen(wsId: number, machine: string): Promise<void>;
}
const defaultDeps: FleetDeps = {
  async readKey(wsId) {
    const { getWorkspaceSetting } = await import("./workspace");
    return getWorkspaceSetting(wsId, "fleetKey");
  },
  async loadUser(userId) {
    const { getUserById } = await import("../db");
    return (await getUserById(userId)) ?? null;
  },
  allowed: fleetAllowed,
  async seen(wsId, machine) {
    const { setWorkspaceSetting } = await import("./workspace");
    await setWorkspaceSetting(wsId, "fleetSeen", JSON.stringify({ at: new Date().toISOString(), machine }));
  },
};
const FAIL_LIMIT = 20, FAIL_WINDOW = 15 * 60_000;
const lastSeen = new Map<number, number>();

export function registerFleetRoutes(app: Express, deps: Partial<FleetDeps> = {}) {
  const D: FleetDeps = { ...defaultDeps, ...deps };

  const auth = async (req: any, res: any): Promise<{ userId: number; wsId: number } | null> => {
    res.setHeader("Cache-Control", "no-store");
    const ip = clientIp(req);
    if (blocked(`fleet:${ip}`, FAIL_LIMIT, FAIL_WINDOW)) { res.status(429).json({ error: "Too many wrong keys from this address; try again later" }); return null; }
    const m = /^Bearer\s+(\S+)$/i.exec(String(req.headers?.authorization || ""));
    const key = m ? m[1] : "";
    const where = parseFleetKey(key);
    const bad = () => { hit(`fleet:${ip}`, FAIL_LIMIT, FAIL_WINDOW); res.status(401).json({ error: "Not a valid Fleet key (make a new one in LevelUp: Fleet → Connect Mission Control)" }); return null; };
    if (!where) return bad();
    const ok = keyMatches(key, await D.readKey(where.wsId).catch(() => undefined));
    if (!ok) return bad();
    const user = await D.loadUser(ok.userId).catch(() => null);
    if (!user || !(await D.allowed(user).catch(() => false))) { res.status(403).json({ error: "The Fleet isn't available for this account any more" }); return null; }
    const machine = plain(req.headers?.["x-fleet-machine"] || req.body?.machine || "", 120);
    const prev = lastSeen.get(where.wsId) || 0;
    if (machine && Date.now() - prev > 5 * 60_000) { lastSeen.set(where.wsId, Date.now()); D.seen(where.wsId, machine).catch(() => {}); }
    return { userId: ok.userId, wsId: where.wsId };
  };
  const fail = (res: any, e: unknown) => { console.error("[fleet] request failed:", (e as Error)?.message || e); res.status(500).json({ error: "LevelUp couldn't do that just now" }); };

  app.get("/api/fleet/v1/ping", async (req, res) => {
    try {
      const a = await auth(req, res); if (!a) return;
      res.json({ ok: true, workspace: a.wsId, contract: 1 });
    } catch (e) { fail(res, e); }
  });

  app.get("/api/fleet/v1/items", async (req, res) => {
    try {
      const a = await auth(req, res); if (!a) return;
      const days = Math.min(30, Math.max(1, Number(req.query?.days) || 7));
      res.json({ items: await fleetStore().list(a.userId, days), at: new Date().toISOString() });
    } catch (e) { fail(res, e); }
  });

  app.post("/api/fleet/v1/items/:id", async (req, res) => {
    try {
      const a = await auth(req, res); if (!a) return;
      const id = Number(req.params?.id);
      if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ error: "bad id" }); return; }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const action = String(body.action || "");
      const r = await fleetStore().mutate(a.userId, id, (cur) => fleetTransition(cur, "fleet", action as any, body));
      if (r.error) { res.status(r.error === "No such hand-off" ? 404 : 409).json({ error: r.error }); return; }
      res.json({ item: r.row });
    } catch (e) { fail(res, e); }
  });

  app.put("/api/fleet/v1/outbox", async (req, res) => {
    try {
      const a = await auth(req, res); if (!a) return;
      const items = cleanOutbox(req.body?.items);
      await fleetStore().setOutbox(a.userId, items);
      res.json({ ok: true, count: items.length });
    } catch (e) { fail(res, e); }
  });

  app.get("/api/fleet/v1/context", async (req, res) => {
    try {
      const a = await auth(req, res); if (!a) return;
      res.json(await fleetStore().context(a.userId));
    } catch (e) { fail(res, e); }
  });
}
