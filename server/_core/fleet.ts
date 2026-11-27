/**
 * The Fleet (build -295): the owner hands tasks and projects from LevelUp to Mission Control, their own
 * fleet of AI machines, and follows them here: Mission Control proposes who does it and where, the owner
 * approves, the work runs, the result comes back for the owner to accept or send back.
 *
 * Who: the OWNER of the platform operator's own workspace only (`fleetAllowed`), like Atlas. Customers
 * never see it.
 *
 * Where it lives: one pm_records row per hand-off, kind "fleet" (not in pm.ts KINDS, so the generic
 * recordUpsert can't write one: every change goes through `fleetTransition`). `status` is the state, `data`
 * the FleetData below. What Mission Control says the owner should do lives in ONE row of kind "fleetout".
 *
 * How Mission Control talks to it: Mission Control runs on the owner's own computers and listens to
 * nobody, so it CALLS LevelUp (REST, `registerFleetRoutes`) with a key the owner makes here once. Only a
 * SHA-256 of the key is stored (workspace setting `fleetKey`); the key names its workspace and member so
 * it is found without a search. A wrong key counts against the caller's address (rate limit).
 *
 * The state machine is the whole contract and is pure (`fleetTransition`), so both sides are tested
 * against the same rules: server/fleet.test.ts.
 */
import { createHash, randomBytes, timingSafeEqual } from "crypto";

// ─── the contract ────────────────────────────────────────────────────────────

export type FleetState = "requested" | "proposed" | "approved" | "running" | "review" | "done" | "failed" | "cancelled";
export const FLEET_STATES: FleetState[] = ["requested", "proposed", "approved", "running", "review", "done", "failed", "cancelled"];
/** States in which the hand-off is still with somebody. */
export const FLEET_OPEN = new Set<FleetState>(["requested", "proposed", "approved", "running", "review"]);

export interface FleetArea {
  /** client work (one of the owner's clients) or personal (a goal or objective) */
  type: "client" | "personal";
  name: string;
  goalId?: string | null;
  goalTitle?: string | null;
}
export interface FleetUpdate { at: string; by: "owner" | "fleet"; text: string; state?: FleetState }
export interface FleetData {
  _rev?: number;
  kind: "task" | "project";
  instructions?: string;
  /** what the task looked like when it was handed off (the server never reads the task lists) */
  snapshot?: { title?: string; notes?: string; due?: string | null; projectName?: string; subtasks?: string[] };
  area?: FleetArea | null;
  /** YYYY-MM-DD: approved work does not start before this day */
  when?: string | null;
  /** "edit": may change files once approved; "answer": investigate and report only */
  access: "edit" | "answer";
  requestedAt: string;
  proposal?: { summary: string; machine?: string; folder?: string; tool?: string; repo?: string | null; at: string } | null;
  approvedAt?: string | null;
  approvedBy?: "levelup" | "mission-control" | null;
  /** the Mission Control machine that took it on (only that one may move it on) */
  claimedBy?: string | null;
  job?: { id: string; host?: string } | null;
  result?: { text: string; at: string } | null;
  error?: string | null;
  cancelAck?: boolean;
  updates: FleetUpdate[];
}
export interface FleetRow { id?: number; status: FleetState; title: string; refType: string | null; refId: string | null; projectKey: string; data: FleetData; updatedAt?: string }

export type OwnerAction = "approve" | "cancel" | "accept" | "sendBack" | "retry" | "note";
export type FleetAction = "propose" | "approve" | "start" | "finish" | "fail" | "done" | "ackCancel" | "note";

export const LIMITS = { title: 500, instructions: 8000, note: 2000, result: 30000, summary: 2000, updates: 60, outbox: 200 };

const clip = (s: unknown, n: number) => {
  const v = String(s ?? "").replace(/\u0000/g, "").trim();
  return v.length > n ? v.slice(0, n - 1) + "…" : v;
};
/** Outside text shown in the app: no angle brackets, so it can never become HTML. */
export const plain = (s: unknown, n: number) => clip(s, n).replace(/</g, "‹").replace(/>/g, "›");
const day = (s: unknown): string | null => (typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

function cleanArea(a: any): FleetArea | null {
  if (!a || typeof a !== "object") return null;
  const type = a.type === "personal" ? "personal" : a.type === "client" ? "client" : null;
  const name = plain(a.name, 80);
  if (!type || !name) return null;
  return { type, name, goalId: a.goalId == null ? null : plain(a.goalId, 64) || null, goalTitle: a.goalTitle == null ? null : plain(a.goalTitle, 200) || null };
}

/** A new hand-off from the owner. Throws with a message the owner can read. */
export function newFleetRow(input: any, now = new Date().toISOString()): FleetRow {
  const title = plain(input?.title, LIMITS.title);
  if (!title) throw new Error("Say what you are handing to the Fleet");
  const kind = input?.kind === "project" ? "project" : "task";
  const refType = ["task", "project", "text"].includes(input?.refType) ? input.refType : "text";
  const s = input?.snapshot || {};
  const data: FleetData = {
    _rev: 1,
    kind,
    instructions: plain(input?.instructions, LIMITS.instructions),
    snapshot: {
      title,
      notes: plain(s.notes, 6000),
      due: day(s.due),
      projectName: plain(s.projectName, 200),
      subtasks: Array.isArray(s.subtasks) ? s.subtasks.slice(0, 40).map((x: unknown) => plain(x, 300)).filter(Boolean) : [],
    },
    area: cleanArea(input?.area),
    when: day(input?.when),
    access: input?.access === "answer" ? "answer" : "edit",
    requestedAt: now,
    updates: [{ at: now, by: "owner", text: `Handed to the Fleet${input?.when && day(input.when) ? ` for ${input.when}` : ""}`, state: "requested" }],
  };
  return { status: "requested", title, refType, refId: input?.refId == null ? null : clip(input.refId, 128), projectKey: clip(input?.projectKey, 128), data };
}

type Result = { status: FleetState; data: FleetData } | { error: string };

/**
 * Every change to a hand-off, from either side. `role` "owner" is the LevelUp user; "fleet" is Mission
 * Control (with its `machine`). Returns the new state and data, or why the change was refused. Pure.
 */
export function fleetTransition(row: { status: FleetState; data: FleetData }, role: "owner" | "fleet", action: OwnerAction | FleetAction, input: any = {}, now = new Date().toISOString()): Result {
  const d: FleetData = JSON.parse(JSON.stringify(row.data || {}));
  d.updates = Array.isArray(d.updates) ? d.updates : [];
  const st = row.status;
  const say = (by: "owner" | "fleet", text: string, state?: FleetState) => {
    if (text) d.updates.push({ at: now, by, text: plain(text, LIMITS.note), ...(state ? { state } : {}) });
    d.updates = d.updates.slice(-LIMITS.updates);
  };
  const to = (status: FleetState): Result => { d._rev = (Number(d._rev) || 0) + 1; return { status, data: d }; };
  const machine = plain(input?.machine, 120);

  if (role === "owner") {
    switch (action as OwnerAction) {
      case "approve":
        if (st !== "proposed") return { error: st === "requested" ? "Mission Control hasn't proposed a plan yet" : "This isn't waiting for approval" };
        d.approvedAt = now; d.approvedBy = "levelup";
        say("owner", "Approved", "approved");
        return to("approved");
      case "cancel":
        if (!FLEET_OPEN.has(st)) return { error: "It has already finished" };
        d.cancelAck = false;
        say("owner", input?.note ? `Cancelled: ${input.note}` : "Cancelled", "cancelled");
        return to("cancelled");
      case "accept":
        if (st !== "review") return { error: "There is no result to accept yet" };
        say("owner", input?.note ? `Accepted: ${input.note}` : "Accepted", "done");
        return to("done");
      case "sendBack": {
        if (st !== "review") return { error: "There is no result to send back" };
        const why = plain(input?.note, LIMITS.note);
        if (!why) return { error: "Say what should change" };
        say("owner", `Sent back: ${why}`, "approved");
        return to("approved");
      }
      case "retry":
        if (st !== "failed") return { error: "Only work that failed can be tried again" };
        d.error = null; d.job = null;
        if (d.proposal) { d.approvedAt = now; d.approvedBy = "levelup"; say("owner", "Try again", "approved"); return to("approved"); }
        d.claimedBy = null;
        say("owner", "Try again", "requested");
        return to("requested");
      case "note": {
        const t = plain(input?.note, LIMITS.note);
        if (!t) return { error: "Nothing to add" };
        say("owner", t);
        return to(st);
      }
      default:
        return { error: "Unknown action" };
    }
  }

  // Mission Control
  if (!machine) return { error: "machine required" };
  const mine = !d.claimedBy || d.claimedBy === machine;
  switch (action as FleetAction) {
    case "propose": {
      if (st !== "requested" && !(st === "proposed" && mine)) return { error: st === "proposed" ? `already proposed by ${d.claimedBy}` : `not waiting for a proposal (${st})` };
      const summary = plain(input?.summary, LIMITS.summary);
      if (!summary) return { error: "summary required" };
      d.claimedBy = machine;
      d.proposal = { summary, machine: plain(input?.place, 200) || undefined, folder: plain(input?.folder, 400) || undefined, tool: plain(input?.tool, 60) || undefined, repo: input?.repo ? plain(input.repo, 200) : null, at: now };
      say("fleet", `Proposed: ${summary}`, "proposed");
      return to("proposed");
    }
    case "approve":
      if (!mine) return { error: `claimed by ${d.claimedBy}` };
      if (st !== "proposed") return { error: `not waiting for approval (${st})` };
      d.approvedAt = now; d.approvedBy = "mission-control";
      say("fleet", "Approved in Mission Control", "approved");
      return to("approved");
    case "start":
      if (!mine) return { error: `claimed by ${d.claimedBy}` };
      if (st !== "approved") return { error: `not approved (${st})` };
      d.claimedBy = machine;
      d.job = input?.jobId ? { id: plain(input.jobId, 80), host: plain(input?.host, 120) || undefined } : null;
      d.error = null;
      say("fleet", input?.text ? String(input.text) : "Started", "running");
      return to("running");
    case "finish":
      if (!mine) return { error: `claimed by ${d.claimedBy}` };
      if (st !== "running") return { error: `not running (${st})` };
      d.result = { text: clip(input?.result, LIMITS.result).replace(/</g, "‹").replace(/>/g, "›"), at: now };
      say("fleet", input?.text ? String(input.text) : "Finished: ready for your review", "review");
      return to("review");
    case "fail":
      if (!mine) return { error: `claimed by ${d.claimedBy}` };
      if (!["requested", "proposed", "approved", "running"].includes(st)) return { error: `can't fail from ${st}` };
      d.claimedBy = machine;
      d.error = plain(input?.error, LIMITS.note) || "It didn't finish";
      say("fleet", `Didn't finish: ${d.error}`, "failed");
      return to("failed");
    case "done":
      if (!mine) return { error: `claimed by ${d.claimedBy}` };
      if (st !== "review") return { error: `nothing to accept (${st})` };
      say("fleet", "Accepted in Mission Control", "done");
      return to("done");
    case "ackCancel":
      if (st !== "cancelled") return { error: "not cancelled" };
      if (d.cancelAck) return { status: st, data: d };
      d.cancelAck = true;
      say("fleet", input?.text ? String(input.text) : "Stopped");
      return to("cancelled");
    case "note": {
      if (!mine) return { error: `claimed by ${d.claimedBy}` };
      const t = plain(input?.text, LIMITS.note);
      if (!t) return { error: "text required" };
      say("fleet", t);
      return to(st);
    }
    default:
      return { error: "unknown action" };
  }
}

/** What the owner sees about one hand-off (and what Mission Control is sent). */
export function shapeFleet(r: any): FleetRow & { id: number; createdAt?: string } {
  let data: any = {};
  try { data = r.data ? JSON.parse(r.data) : {}; } catch { data = {}; }
  return {
    id: Number(r.id),
    status: (FLEET_STATES as string[]).includes(r.status) ? r.status : "requested",
    title: r.title || "",
    refType: r.refType ?? null,
    refId: r.refId ?? null,
    projectKey: r.projectKey || "",
    data: { updates: [], access: "edit", kind: "task", requestedAt: "", ...data },
    updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : undefined,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : undefined,
  };
}

/** Mission Control's list of what the owner should do (one row, replaced whole). */
export interface OutboxItem { id: string; title: string; detail?: string; kind: "yours" | "review" | "waiting"; area?: string | null; project?: string | null; due?: string | null; at?: string | null }
export function cleanOutbox(items: unknown): OutboxItem[] {
  if (!Array.isArray(items)) return [];
  const out: OutboxItem[] = [];
  const seen = new Set<string>();
  for (const x of items.slice(0, LIMITS.outbox) as any[]) {
    const id = plain(x?.id, 120), title = plain(x?.title, 300);
    if (!id || !title || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id, title,
      detail: plain(x?.detail, 600) || undefined,
      kind: x?.kind === "review" ? "review" : x?.kind === "waiting" ? "waiting" : "yours",
      area: x?.area ? plain(x.area, 80) : null,
      project: x?.project ? plain(x.project, 120) : null,
      due: day(x?.due),
      at: typeof x?.at === "string" ? plain(x.at, 40) : null,
    });
  }
  return out;
}

// ─── the key ─────────────────────────────────────────────────────────────────

/** `luf_<workspace>_<member>_<secret>`: names where to look, so checking it needs no search. */
export function makeFleetKey(wsId: number, userId: number): { key: string; stored: string; hint: string } {
  const secret = randomBytes(24).toString("base64url");
  const key = `luf_${wsId}_${userId}_${secret}`;
  return { key, stored: JSON.stringify({ hash: hashKey(key), userId, hint: `luf_…${secret.slice(-4)}`, createdAt: new Date().toISOString() }), hint: `luf_…${secret.slice(-4)}` };
}
export function parseFleetKey(key: string): { wsId: number; userId: number } | null {
  const m = /^luf_(\d{1,9})_(\d{1,12})_([A-Za-z0-9_-]{20,64})$/.exec(String(key || "").trim());
  if (!m) return null;
  return { wsId: Number(m[1]), userId: Number(m[2]) };
}
export function hashKey(key: string): string { return createHash("sha256").update(String(key)).digest("hex"); }
/** Constant-time comparison of a presented key with the stored setting. */
export function keyMatches(key: string, storedJson: string | undefined | null): { userId: number } | null {
  if (!storedJson) return null;
  let s: any;
  try { s = JSON.parse(storedJson); } catch { return null; }
  if (!s || typeof s.hash !== "string" || s.hash.length !== 64) return null;
  const a = Buffer.from(hashKey(key), "hex"), b = Buffer.from(s.hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const p = parseFleetKey(key);
  if (!p || p.userId !== Number(s.userId)) return null;
  return { userId: p.userId };
}
