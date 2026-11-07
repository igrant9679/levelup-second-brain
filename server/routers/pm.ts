/**
 * Project management module (build -222+). See drizzle/schema.ts pmPeople /
 * pmRecords for the storage model and server/_core/pmDelegation.ts for the
 * delegate e-mail loop.
 *
 *   pm.bootstrap        everything the owner's PM screens need in one call
 *   pm.peopleUpsert / peopleArchive
 *   pm.recordUpsert / recordUpsertMany / recordDelete / recordRestore
 *   pm.nudge            email a delegate a status request (owner clicked it)
 *   pm.emailReport      email a stakeholder report the owner wrote/approved
 *   pm.runNudgesNow     run the auto follow-up pass now (Settings test)
 *
 * Every row is scoped to ctx.user.id — the PM data is the owner's own
 * working file; delegates outside LevelUp only ever see the e-mails.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { pmPeople, pmRecords } from "../../drizzle/schema";
import { knownRecipientEmails, processDelegationNudges, sendDelegateNudge } from "../_core/pmDelegation";
import { sendEmail } from "../_core/sendEmail";
import { spendQuota } from "../_core/quota";

const KINDS = ["delegation", "raci", "risk", "issue", "assumption", "decision", "stakeholder", "commplan", "report",
  "milestone", "baseline", "wbs", "alloc", "budgetline", "cost", "change", "lesson", "template", "pmsettings", "action", "evmsnap",
  // contract layer (-252)
  "contract", "clin", "invoice", "deliverable"] as const;
const DATA_MAX = 400_000;

// These e-mails go to outside addresses from the shared system sender, so
// they count against the persistent daily email quota (server/_core/quota.ts:
// per user and workspace-wide; it no longer resets on deploy).

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}
const recordInput = z.object({
  id: z.number().int().optional(),
  projectKey: z.string().max(128).default(""),
  kind: z.enum(KINDS),
  refType: z.string().max(32).nullable().optional(),
  refId: z.string().max(128).nullable().optional(),
  title: z.string().max(500).nullable().optional(),
  status: z.string().max(32).nullable().optional(),
  data: z.any().optional(),
  sortOrder: z.number().int().optional(),
  /** data._rev this save is based on (audit F63); stale → refused, stored record returned with conflict:true */
  baseRev: z.number().int().min(0).optional(),
});
type RecordInput = z.infer<typeof recordInput>;

function shapeRecord(r: any) {
  let data: any = null; try { data = r.data ? JSON.parse(r.data) : null; } catch { data = null; }
  return { id: r.id, projectKey: r.projectKey, kind: r.kind, refType: r.refType, refId: r.refId, title: r.title, status: r.status, data, sortOrder: r.sortOrder, createdAt: r.createdAt, updatedAt: r.updatedAt };
}
/** Kinds whose rows carry a per-project number (RISK-3, CR-7) — assigned here (audit F223). */
const NUMBERED_KINDS = new Set(["risk", "issue", "assumption", "decision", "change"]);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const revOf = (raw: string | null | undefined) => { try { const o = raw ? JSON.parse(raw) : null; return isObj(o) ? Number(o._rev) || 0 : 0; } catch { return 0; } };
async function inTx<T>(db: any, fn: (tx: any) => Promise<T>): Promise<T> {
  return typeof db.transaction === "function" ? db.transaction(fn) : fn(db);
}
const locked = async (q: any) => (typeof q.for === "function" ? q.for("update") : q);

/**
 * Save one record.
 * - Audit F63: an update that carries `baseRev` (the data._rev the client last
 *   saw) is refused when the stored row has moved on (a delegate's reply, an
 *   automatic follow-up, another device) — the stored record comes back with
 *   `conflict: true` and nothing is written. Every write that changes data
 *   bumps data._rev. The row is read with FOR UPDATE inside a transaction, so
 *   the server's own appends (pmDelegation.mutateDelegation) and this can't
 *   interleave.
 * - Audit F223: a new RAID item / change request gets its number here, inside
 *   the transaction: max+1 for the user + project + kind. A number the client
 *   sends is only a hint, replaced when it is taken. A change request moved
 *   back to "proposed" loses its decidedAt.
 */
async function upsertOne(db: any, userId: number, r: RecordInput) {
  if (r.data !== undefined) {
    const raw = JSON.stringify(r.data ?? null);
    if (raw && raw.length > DATA_MAX) throw new TRPCError({ code: "BAD_REQUEST", message: "That item is too large to save" });
  }
  if (r.kind === "change" && r.status === "proposed" && isObj(r.data)) { r = { ...r, data: { ...r.data } }; delete (r.data as any).decidedAt; }
  return inTx(db, async (tx: any) => {
    let data: any = r.data;
    if (r.id) {
      const [cur] = await locked(tx.select().from(pmRecords).where(and(eq(pmRecords.id, r.id), eq(pmRecords.userId, userId))).limit(1));
      if (!cur) throw new TRPCError({ code: "NOT_FOUND", message: "That item no longer exists" });
      const storedRev = revOf(cur.data);
      if (r.baseRev != null && data !== undefined && storedRev !== r.baseRev) return { ...shapeRecord(cur), conflict: true as const };
      if (isObj(data)) data = { ...data, _rev: storedRev + 1 };
    } else if (isObj(data)) {
      data = { ...data, _rev: 1 };
      if (NUMBERED_KINDS.has(r.kind)) {
        const rows = await locked(tx.select({ data: pmRecords.data }).from(pmRecords).where(and(eq(pmRecords.userId, userId), eq(pmRecords.kind, r.kind), eq(pmRecords.projectKey, r.projectKey || ""))));
        const taken = new Set<number>();
        for (const x of rows as any[]) { try { const n = Number(JSON.parse(x.data || "{}")?.no); if (n > 0) taken.add(n); } catch { /* skip */ } }
        const hint = Number(data.no);
        if (!(Number.isInteger(hint) && hint > 0 && !taken.has(hint))) data.no = (taken.size ? Math.max(...Array.from(taken)) : 0) + 1;
      }
    }
    return writeOne(tx, userId, { ...r, data });
  });
}
async function writeOne(db: any, userId: number, r: RecordInput) {
  const json = r.data === undefined ? undefined : JSON.stringify(r.data ?? null);
  const values: Record<string, unknown> = {
    projectKey: r.projectKey || "", kind: r.kind,
    ...(r.refType !== undefined ? { refType: r.refType } : {}),
    ...(r.refId !== undefined ? { refId: r.refId } : {}),
    ...(r.title !== undefined ? { title: r.title ? String(r.title).slice(0, 500) : r.title } : {}),
    ...(r.status !== undefined ? { status: r.status } : {}),
    ...(json !== undefined ? { data: json } : {}),
    ...(r.sortOrder !== undefined ? { sortOrder: r.sortOrder } : {}),
    updatedAt: new Date(),
  };
  if (r.id) {
    const res: any = await db.update(pmRecords).set(values).where(and(eq(pmRecords.id, r.id), eq(pmRecords.userId, userId)));
    if (!Number(res?.[0]?.affectedRows ?? res?.affectedRows ?? 0)) throw new TRPCError({ code: "NOT_FOUND", message: "That item no longer exists" });
    const [row] = await db.select().from(pmRecords).where(eq(pmRecords.id, r.id)).limit(1);
    return shapeRecord(row);
  }
  const res: any = await db.insert(pmRecords).values({ userId, ...values });
  const id = Number(res?.[0]?.insertId ?? res?.insertId);
  const [row] = await db.select().from(pmRecords).where(eq(pmRecords.id, id)).limit(1);
  return shapeRecord(row);
}

const personInput = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1).max(255),
  email: z.string().max(320).nullable().optional(),
  org: z.string().max(255).nullable().optional(),
  title: z.string().max(255).nullable().optional(),
  phone: z.string().max(64).nullable().optional(),
  linkedUserId: z.number().int().nullable().optional(),
  linkedContactId: z.string().max(64).nullable().optional(),
  costRate: z.number().int().min(0).max(100000).nullable().optional(),
  capacityHours: z.number().int().min(0).max(168).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export const pmRouter = router({
  bootstrap: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const people = await db.select().from(pmPeople).where(and(eq(pmPeople.userId, ctx.user.id), eq(pmPeople.archived, 0))).orderBy(pmPeople.name);
    const records = await db.select().from(pmRecords).where(and(eq(pmRecords.userId, ctx.user.id), isNull(pmRecords.deletedAt))).orderBy(pmRecords.sortOrder, pmRecords.id).limit(20000);
    return { people, records: records.map(shapeRecord), at: new Date().toISOString() };
  }),

  peopleUpsert: protectedProcedure.input(personInput).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const v = { ...input, email: input.email ? input.email.trim().toLowerCase() : input.email, updatedAt: new Date() } as any;
    delete v.id;
    if (input.id) {
      await db.update(pmPeople).set(v).where(and(eq(pmPeople.id, input.id), eq(pmPeople.userId, ctx.user.id)));
      const [p] = await db.select().from(pmPeople).where(and(eq(pmPeople.id, input.id), eq(pmPeople.userId, ctx.user.id))).limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "No such person" });
      return p;
    }
    const res: any = await db.insert(pmPeople).values({ ...v, userId: ctx.user.id });
    const id = Number(res?.[0]?.insertId ?? res?.insertId);
    const [p] = await db.select().from(pmPeople).where(and(eq(pmPeople.id, id), eq(pmPeople.userId, ctx.user.id))).limit(1);
    return p;
  }),

  peopleArchive: protectedProcedure.input(z.object({ id: z.number().int(), archived: z.boolean().default(true) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(pmPeople).set({ archived: input.archived ? 1 : 0, updatedAt: new Date() }).where(and(eq(pmPeople.id, input.id), eq(pmPeople.userId, ctx.user.id)));
    return { ok: true };
  }),

  recordUpsert: protectedProcedure.input(recordInput).mutation(async ({ ctx, input }) => upsertOne(await requireDb(), ctx.user.id, input)),

  recordUpsertMany: protectedProcedure.input(z.object({ records: z.array(recordInput).max(500) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const out = [];
    for (const r of input.records) out.push(await upsertOne(db, ctx.user.id, r));
    return out;
  }),

  recordDelete: protectedProcedure.input(z.object({ ids: z.array(z.number().int()).min(1).max(500) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(pmRecords).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(pmRecords.userId, ctx.user.id), inArray(pmRecords.id, input.ids)));
    return { ok: true };
  }),

  recordRestore: protectedProcedure.input(z.object({ ids: z.array(z.number().int()).min(1).max(500) })).mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    await db.update(pmRecords).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(pmRecords.userId, ctx.user.id), inArray(pmRecords.id, input.ids)));
    return { ok: true };
  }),

  /** Changes since a time (for refresh without reloading everything).
   *  Audit F64: `since` is a cursor the SERVER handed out (bootstrap.at or a
   *  previous changedSince.at), compared with >=; the client asks again with a
   *  small overlap and dedupes by id, so its own clock never matters. */
  changedSince: protectedProcedure.input(z.object({ since: z.string() })).query(async ({ ctx, input }) => {
    const db = await requireDb();
    const at = new Date().toISOString();
    const since = new Date(input.since);
    const sinceMs = isNaN(since.getTime()) ? 0 : since.getTime();
    const rows = await db.select().from(pmRecords).where(and(eq(pmRecords.userId, ctx.user.id), gte(pmRecords.updatedAt, new Date(sinceMs)))).orderBy(desc(pmRecords.updatedAt)).limit(500);
    return { at, rows: rows.filter((r: any) => new Date(r.updatedAt).getTime() >= sinceMs).map((r: any) => ({ ...shapeRecord(r), deleted: !!r.deletedAt })) };
  }),

  nudge: protectedProcedure.input(z.object({ recordId: z.number().int(), note: z.string().max(2000).optional(), intro: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    await spendQuota(ctx.user, "email", 1);
    const r = await sendDelegateNudge(ctx.user.id, input.recordId, { note: input.note, intro: input.intro });
    if (!r.ok) throw new TRPCError({ code: "BAD_REQUEST", message: r.error || "Could not send" });
    return r;
  }),

  emailReport: protectedProcedure.input(z.object({
    to: z.array(z.string().email()).min(1).max(40),
    subject: z.string().min(1).max(250),
    html: z.string().min(1).max(400_000),
    text: z.string().max(100_000).optional(),
  })).mutation(async ({ ctx, input }) => {
    // Audit F10: only people the sender already knows — their own address,
    // workspace accounts, their PM people, their Contacts. Checked before any
    // quota is spent or anything is sent.
    const known = await knownRecipientEmails(await requireDb(), ctx.user.id);
    if (ctx.user.email) known.add(String(ctx.user.email).trim().toLowerCase());
    const unknown = input.to.filter((a) => !known.has(a.trim().toLowerCase()));
    if (unknown.length) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Add ${unknown.length === 1 ? "this address" : "these addresses"} to the project's people or your Contacts first: ${unknown.join(", ")}` });
    }
    await spendQuota(ctx.user, "email", input.to.length);
    // These go to OUTSIDE addresses from the system sender (-255): no active
    // content and no links leave LevelUp, and the footer names the sender.
    const { cleanEmailHtml, senderFooter } = await import("../_core/emailHtml");
    const html = cleanEmailHtml(input.html) + senderFooter(ctx.user.name, ctx.user.email);
    let sent = 0; const failed: string[] = [];
    for (const to of input.to) {
      const ok = await sendEmail({ to, subject: input.subject, html, text: input.text, senderUserId: ctx.user.id, fromName: `${ctx.user.name || "LevelUp"} via LevelUp` }).catch(() => false);
      if (ok) sent++; else failed.push(to);
    }
    return { sent, failed };
  }),

  // Acts on the caller's own delegations only (the cron covers everyone).
  runNudgesNow: protectedProcedure.mutation(async ({ ctx }) => processDelegationNudges(ctx.user.id)),
});
