/**
 * Where Fleet hand-offs are kept (pm_records kind "fleet" / "fleetout") and who may use the Fleet.
 * The rules are in fleet.ts; this file only reads and writes. Every query names the owner's user id.
 * Tests swap the store for an in-memory one (`_setFleetStoreForTests`).
 */
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { getDb } from "../db";
import { pmRecords, userAppData } from "../../drizzle/schema";
import { shapeFleet, type FleetRow, type FleetState, type FleetData, type OutboxItem } from "./fleet";

export type Shaped = ReturnType<typeof shapeFleet>;
export interface FleetStore {
  /** open hand-offs, plus finished ones changed in the last `days` days */
  list(userId: number, days: number): Promise<Shaped[]>;
  get(userId: number, id: number): Promise<Shaped | null>;
  insert(userId: number, row: FleetRow): Promise<Shaped>;
  /** read (locked), decide, write — `fn` returns the new state or why not */
  mutate(userId: number, id: number, fn: (cur: Shaped) => { status: FleetState; data: FleetData } | { error: string }): Promise<{ row?: Shaped; error?: string }>;
  outbox(userId: number): Promise<{ items: OutboxItem[]; at: string } | null>;
  setOutbox(userId: number, items: OutboxItem[]): Promise<void>;
  /** the owner's client programs (areas) and goals, names only */
  context(userId: number): Promise<{ programs: { id: string; name: string }[]; goals: { id: string; title: string }[] }>;
}

async function db(): Promise<any> {
  const d = await getDb();
  if (!d) throw new Error("Database unavailable");
  return d;
}
const inTx = <T,>(d: any, fn: (tx: any) => Promise<T>): Promise<T> => (typeof d.transaction === "function" ? d.transaction(fn) : fn(d));
const locked = async (q: any) => (typeof q.for === "function" ? q.for("update") : q);
const FINAL = ["done", "failed", "cancelled"];

const drizzleStore: FleetStore = {
  async list(userId, days) {
    const d = await db();
    const since = new Date(Date.now() - days * 86400e3);
    const rows = await d.select().from(pmRecords)
      .where(and(eq(pmRecords.userId, userId), eq(pmRecords.kind, "fleet"), isNull(pmRecords.deletedAt),
        or(gte(pmRecords.updatedAt, since), ...["requested", "proposed", "approved", "running", "review"].map((s) => eq(pmRecords.status, s)))))
      .orderBy(desc(pmRecords.updatedAt)).limit(400);
    return rows.map(shapeFleet).filter((r: Shaped) => !FINAL.includes(r.status) || !r.updatedAt || Date.parse(r.updatedAt) >= since.getTime() || (r.status === "cancelled" && !r.data.cancelAck));
  },
  async get(userId, id) {
    const d = await db();
    const [r] = await d.select().from(pmRecords).where(and(eq(pmRecords.id, id), eq(pmRecords.userId, userId), eq(pmRecords.kind, "fleet"), isNull(pmRecords.deletedAt))).limit(1);
    return r ? shapeFleet(r) : null;
  },
  async insert(userId, row) {
    const d = await db();
    const res: any = await d.insert(pmRecords).values({ userId, projectKey: row.projectKey || "", kind: "fleet", refType: row.refType, refId: row.refId, title: row.title, status: row.status, data: JSON.stringify(row.data) });
    const id = Number(res?.[0]?.insertId ?? res?.insertId);
    const [r] = await d.select().from(pmRecords).where(and(eq(pmRecords.id, id), eq(pmRecords.userId, userId))).limit(1);
    return shapeFleet(r);
  },
  async mutate(userId, id, fn) {
    const d = await db();
    return inTx(d, async (tx: any) => {
      const [r] = await locked(tx.select().from(pmRecords).where(and(eq(pmRecords.id, id), eq(pmRecords.userId, userId), eq(pmRecords.kind, "fleet"), isNull(pmRecords.deletedAt))).limit(1));
      if (!r) return { error: "No such hand-off" };
      const out = fn(shapeFleet(r));
      if ("error" in out) return { error: out.error };
      const now = new Date();
      await tx.update(pmRecords).set({ status: out.status, data: JSON.stringify(out.data), updatedAt: now }).where(and(eq(pmRecords.id, id), eq(pmRecords.userId, userId)));
      return { row: shapeFleet({ ...r, status: out.status, data: JSON.stringify(out.data), updatedAt: now }) };
    });
  },
  async outbox(userId) {
    const d = await db();
    const [r] = await d.select().from(pmRecords).where(and(eq(pmRecords.userId, userId), eq(pmRecords.kind, "fleetout"), isNull(pmRecords.deletedAt))).limit(1);
    if (!r) return null;
    try {
      const v = JSON.parse(r.data || "{}");
      return { items: Array.isArray(v.items) ? v.items : [], at: String(v.at || "") };
    } catch {
      return null;
    }
  },
  async setOutbox(userId, items) {
    const d = await db();
    const data = JSON.stringify({ items, at: new Date().toISOString() });
    await inTx(d, async (tx: any) => {
      const [r] = await locked(tx.select({ id: pmRecords.id }).from(pmRecords).where(and(eq(pmRecords.userId, userId), eq(pmRecords.kind, "fleetout"), isNull(pmRecords.deletedAt))).limit(1));
      if (r) await tx.update(pmRecords).set({ data, updatedAt: new Date() }).where(and(eq(pmRecords.id, r.id), eq(pmRecords.userId, userId)));
      else await tx.insert(pmRecords).values({ userId, projectKey: "", kind: "fleetout", title: "Mission Control: for you", status: "open", data });
    });
  },
  async context(userId) {
    const d = await db();
    const [r] = await d.select({ programs: userAppData.programs, goals: userAppData.goals }).from(userAppData).where(eq(userAppData.userId, userId)).limit(1);
    const parse = (s: any) => { try { const v = JSON.parse(s || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
    return {
      programs: parse(r?.programs).filter((p: any) => p && p.name && !p.archived).slice(0, 50).map((p: any) => ({ id: String(p.id), name: String(p.name).slice(0, 80) })),
      goals: parse(r?.goals).filter((g: any) => g && (g.title || g.name) && g.status !== "archived").slice(0, 100).map((g: any) => ({ id: String(g.id), title: String(g.title || g.name).slice(0, 200) })),
    };
  },
};

let store: FleetStore = drizzleStore;
export const fleetStore = (): FleetStore => store;
export function _setFleetStoreForTests(s: FleetStore | null): void { store = s ?? drizzleStore; }

/**
 * The Fleet is the platform operator's own workspace's, and its OWNER's only (like Atlas): it hands work
 * to one person's own computers, so a customer must never see or reach it.
 */
export async function fleetAllowed(user: any): Promise<boolean> {
  if (!user || !user.id) return false;
  const { isOwnerCtxUser } = await import("../routers/appData");
  if (!(await isOwnerCtxUser(user))) return false;
  const { wsIdOf } = await import("./workspace");
  const w = await wsIdOf(user);
  if (w === null) return true; // tests' no-workspace mode
  const { operatorWorkspaceId } = await import("./mailTrust");
  const op = await operatorWorkspaceId();
  return op != null ? w === op : w === 1;
}
