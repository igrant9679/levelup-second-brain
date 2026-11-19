/**
 * Workspaces (multi-workspace, build -278). docs/multi-tenant-plan.md.
 *
 *   list / switch        a person's workspaces, and moving between them
 *   current / rename     the workspace you are in (owner renames it)
 *   export / requestDelete   the owner takes the data out, or closes the workspace
 *   op*                  the PLATFORM OPERATOR's console: create a workspace
 *                        and invite its owner, suspend / reactivate, change
 *                        the owner, features and daily limits, see head
 *                        counts and usage. Operator tools return account-level
 *                        facts only — never a workspace's content.
 */
import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { sdk } from "../_core/sdk";
import * as db from "../db";
import { getDb } from "../db";
import { users, workspaces } from "../../drizzle/schema";
import { adminProcedure, operatorProcedure, ownerProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { accountIdOf, getWorkspace, invalidateWorkspace, isOperator, membershipsOf, wsIdOf, wsMemberIds } from "../_core/workspace";
import { createWorkspace, dumpWorkspace, GRACE_DAYS, memberCounts } from "../_core/workspaceAdmin";
import { workspaceUsage } from "../_core/quota";
import { appOrigin } from "../_core/appOrigin";
import { audit } from "../_core/audit";

const FEATURES = ["atlas", "cfLabels"] as const;

const s3Input = z.object({
  label: z.string().max(80).optional(),
  /** Leave empty for AWS S3. Cloudflare R2: https://<account id>.r2.cloudflarestorage.com */
  endpoint: z.string().max(300).optional(),
  region: z.string().min(1).max(60),
  bucket: z.string().min(1).max(255),
  accessKeyId: z.string().min(1).max(256),
  secretAccessKey: z.string().min(1).max(512),
  prefix: z.string().max(200).optional(),
});
function cleanS3(i: z.infer<typeof s3Input>) {
  const endpoint = String(i.endpoint || "").trim().replace(/\/+$/, "");
  return {
    label: String(i.label || "").trim() || undefined,
    endpoint: endpoint || undefined,
    region: i.region.trim(),
    bucket: i.bucket.trim(),
    accessKeyId: i.accessKeyId.trim(),
    secretAccessKey: i.secretAccessKey.trim(),
    forcePathStyle: !!endpoint,
    prefix: String(i.prefix || "").trim().replace(/^\/+|\/+$/g, "") || undefined,
  };
}

export async function issueCookieFor(ctx: { req: any; res: any }, member: { openId: string; name?: string | null }): Promise<void> {
  // keep the remaining lifetime of the current cookie (1 day / 30 days / 1 year)
  const cur = await sdk.sessionOf(ctx.req).catch(() => null);
  const left = cur?.exp ? cur.exp * 1000 - Date.now() : 0;
  const ms = left > 60_000 ? Math.min(left, ONE_YEAR_MS) : 86_400_000;
  const token = await sdk.createSessionToken(member.openId, { name: member.name || "", expiresInMs: ms });
  ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ms });
}

export const workspaceRouter = router({
  /** Every workspace this login belongs to. Works while the current one is suspended. */
  list: publicProcedure.query(async ({ ctx }) => {
    const me: any = ctx.user || (ctx as any).inactiveUser;
    if (!me) return { workspaces: [], currentId: null as number | null };
    const ms = await membershipsOf(me);
    return {
      currentId: Number(me.workspaceId) || null,
      workspaces: ms.map((m) => ({ id: m.workspaceId, name: m.name, role: m.role, status: m.status, current: m.userId === me.id })),
    };
  }),

  /** Move this browser to another of your workspaces: a fresh cookie for your member row there. */
  switch: publicProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const me: any = ctx.user || (ctx as any).inactiveUser;
      if (!me) throw new TRPCError({ code: "UNAUTHORIZED", message: "Please sign in." });
      const target = (await membershipsOf(me)).find((m) => m.workspaceId === input.workspaceId);
      // "not found" whether it doesn't exist or you are not in it
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "You are not a member of that workspace." });
      if (target.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "That workspace is suspended." });
      await issueCookieFor(ctx, { openId: target.openId, name: me.name });
      await db.upsertUser({ openId: target.openId, lastSignedIn: new Date() });
      return { ok: true as const, workspaceId: target.workspaceId, userId: target.userId };
    }),

  /** The workspace you are in, and what you are in it. */
  current: protectedProcedure.query(async ({ ctx }) => {
    const w = await wsIdOf(ctx.user as any);
    const ws = await getWorkspace(w);
    if (!ws) return null;
    const isOwner = ws.ownerUserId === ctx.user.id;
    return {
      id: ws.id, name: ws.name, status: ws.status,
      role: isOwner ? "owner" : ctx.user.role === "admin" ? "admin" : "member",
      features: ws.features, branding: ws.branding,
      operator: await isOperator(ctx.user as any),
      usage: isOwner || ctx.user.role === "admin" ? await workspaceUsage(ws.id) : null,
    };
  }),

  rename: ownerProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const w = await wsIdOf(ctx.user as any);
      const conn = await getDb();
      if (!conn || !w) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await conn.update(workspaces).set({ name: input.name }).where(eq(workspaces.id, w));
      invalidateWorkspace(w);
      void audit(ctx, "workspace.rename", { detail: { name: input.name } });
      return { ok: true as const };
    }),

  /** Everything stored for this workspace, as one JSON document (owner only). */
  export: ownerProcedure.mutation(async ({ ctx }) => {
    const w = await wsIdOf(ctx.user as any);
    if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
    void audit(ctx, "workspace.export", {});
    const dump = await dumpWorkspace(w);
    const rows = Object.values(dump.tables).reduce((n, t) => n + t.count, 0);
    return { ok: true as const, rows, tables: Object.keys(dump.tables).length, dump };
  }),

  /**
   * Close the workspace (owner only). It stops being reachable at once; its
   * data is removed for good after 30 days. Until then the platform operator
   * can restore it. The operator's own workspace cannot be closed this way.
   */
  requestDelete: ownerProcedure
    .input(z.object({ confirmName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const w = await wsIdOf(ctx.user as any);
      const ws = await getWorkspace(w);
      if (!ws) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
      if (input.confirmName.trim() !== ws.name) throw new TRPCError({ code: "BAD_REQUEST", message: "Type the workspace's exact name to confirm." });
      if (ws.id === 1 || (await isOperator(ctx.user as any))) throw new TRPCError({ code: "BAD_REQUEST", message: "The platform's own workspace can't be closed from here." });
      const conn = await getDb();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await conn.update(workspaces).set({ status: "deleted", deletedAt: new Date() }).where(eq(workspaces.id, ws.id));
      invalidateWorkspace(ws.id);
      // a closed workspace is not charged again (-279)
      await (await import("../_core/billing")).cancelSubscriptionNow(ws.id);
      void audit(ctx, "workspace.delete_requested", { detail: { graceDays: GRACE_DAYS } });
      return { ok: true as const, purgeAfterDays: GRACE_DAYS };
    }),

  // ── file storage (owner / admin) ──────────────────────────────────────────
  /** Where this workspace's files go, without any secret. */
  storageGet: adminProcedure.query(async ({ ctx }) => {
    const w = await wsIdOf(ctx.user as any);
    if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
    const F = await import("../_core/workspaceFiles");
    const { storageBackend } = await import("../storage");
    const state = await F.readStorage(w);
    const { ENV } = await import("../_core/env");
    return {
      ...F.storageView(state),
      platformBackend: storageBackend(),
      /** Google sign-in for "your own Google Drive" needs the platform's Google client. */
      driveConnectAvailable: !!(ENV.googleDriveClientId && ENV.googleDriveClientSecret),
      filesElsewhere: await F.filesElsewhere(w),
      move: await F.moveStatus(w),
    };
  }),

  /** Check an S3 bucket's settings by writing, reading and deleting a small file. Nothing is saved. */
  storageTestS3: ownerProcedure /* Audit 3: owner only — an admin could send every file to storage they control */
    .input(s3Input)
    .mutation(async ({ input }) => {
      const F = await import("../_core/workspaceFiles");
      return F.testStore({ id: "test", mode: "s3", addedAt: new Date().toISOString(), ...cleanS3(input) });
    }),

  /** Use your own S3 bucket from now on. It is tested first; a bucket that fails the test is not saved. */
  storageSetS3: ownerProcedure /* Audit 3: owner only — an admin could send every file to storage they control */
    .input(s3Input)
    .mutation(async ({ ctx, input }) => {
      const w = await wsIdOf(ctx.user as any);
      if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
      const F = await import("../_core/workspaceFiles");
      const store = { id: F.newStoreId(), mode: "s3" as const, addedAt: new Date().toISOString(), ...cleanS3(input) };
      const test = await F.testStore(store);
      if (!test.ok) return { ok: false as const, error: test.error || "The bucket did not pass the test." };
      const state = await F.readStorage(w);
      state.stores[store.id] = store;
      state.current = store.id;
      await F.writeStorage(w, state);
      void audit(ctx, "workspace.storage_change", { detail: { mode: "s3", bucket: store.bucket } });
      return { ok: true as const, storeId: store.id, filesElsewhere: await F.filesElsewhere(w) };
    }),

  /** Go back to LevelUp's storage, or to a store set up earlier. */
  storageUse: ownerProcedure /* Audit 3: owner only — an admin could send every file to storage they control */
    .input(z.object({ store: z.string().max(40) }))
    .mutation(async ({ ctx, input }) => {
      const w = await wsIdOf(ctx.user as any);
      if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
      const F = await import("../_core/workspaceFiles");
      const state = await F.readStorage(w);
      if (input.store !== "platform" && !state.stores[input.store]) throw new TRPCError({ code: "NOT_FOUND", message: "No such storage." });
      if (input.store !== "platform") {
        const test = await F.testStore(state.stores[input.store]);
        if (!test.ok) return { ok: false as const, error: test.error || "That storage did not pass the test." };
      }
      state.current = input.store;
      await F.writeStorage(w, state);
      void audit(ctx, "workspace.storage_change", { detail: { store: input.store === "platform" ? "platform" : state.stores[input.store].mode } });
      return { ok: true as const, filesElsewhere: await F.filesElsewhere(w) };
    }),

  /** Copy the files that are still in an earlier place into the current storage (links don't change). */
  storageMove: ownerProcedure /* Audit 3: owner only — an admin could send every file to storage they control */.mutation(async ({ ctx }) => {
    const w = await wsIdOf(ctx.user as any);
    if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
    const F = await import("../_core/workspaceFiles");
    void audit(ctx, "workspace.storage_move", {});
    return F.moveFiles(w, Number((ctx.user as any)?.id) || null);
  }),

  /** Stop a move that is waiting or under way. Files already moved stay moved; the rest stay where they are. */
  storageMoveCancel: adminProcedure.mutation(async ({ ctx }) => {
    const w = await wsIdOf(ctx.user as any);
    if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
    const F = await import("../_core/workspaceFiles");
    const stopped = await F.cancelMove(w);
    if (stopped) void audit(ctx, "workspace.storage_move", { detail: { cancelled: true } });
    return { ok: true as const, stopped };
  }),

  /** Forget an earlier store. Refused while files are still in it. */
  storageForget: ownerProcedure /* Audit 3: owner only — an admin could send every file to storage they control */
    .input(z.object({ store: z.string().max(40) }))
    .mutation(async ({ ctx, input }) => {
      const w = await wsIdOf(ctx.user as any);
      if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
      const F = await import("../_core/workspaceFiles");
      const state = await F.readStorage(w);
      if (!state.stores[input.store]) return { ok: true as const };
      if (state.current === input.store) return { ok: false as const, error: "That is the storage in use. Switch to another one first." };
      const conn = await getDb();
      const { files } = await import("../../drizzle/schema");
      const left: any[] = conn ? await conn.select({ id: files.id }).from(files).where(and(eq(files.workspaceId, w), eq(files.store, input.store))).limit(1) : [];
      if (left.length) return { ok: false as const, error: "Files are still stored there. Move them first, or they will stop opening." };
      delete state.stores[input.store];
      await F.writeStorage(w, state);
      void audit(ctx, "workspace.storage_change", { detail: { forgot: input.store } });
      return { ok: true as const };
    }),

  // ── platform operator console ─────────────────────────────────────────────
  opList: operatorProcedure.query(async () => {
    const conn = await getDb();
    if (!conn) return { workspaces: [] };
    const rows: any[] = await conn.select().from(workspaces);
    const counts = await memberCounts();
    const bills = await (await import("../_core/billing")).billingSummaries().catch(() => new Map());
    const out = [];
    for (const r of rows) {
      let owner: { name: string | null; email: string | null } | null = null;
      if (r.ownerUserId != null) {
        const u = await db.getUserById(Number(r.ownerUserId));
        if (u) owner = { name: u.name ?? null, email: u.email ?? null };
      }
      const parse = (v: any) => { try { const o = JSON.parse(String(v || "{}")); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
      const pending = r.ownerUserId == null ? (await db.getAllTeamInvites(Number(r.id))).filter((i: any) => i.asOwner && !i.accepted).map((i: any) => i.email) : [];
      out.push({
        id: Number(r.id), name: String(r.name), slug: String(r.slug), status: String(r.status),
        owner, ownerInvited: pending[0] || null,
        members: counts.get(Number(r.id)) || 0,
        features: parse(r.features), quotas: parse(r.quotas),
        // (Audit 3: storage is {current, stores}; the old read of .mode always said "platform")
        storageMode: (() => { try { const st = JSON.parse(String(r.storage || "{}")); const cur = String(st.current || "platform"); if (cur === "platform") return "platform"; const one = (Array.isArray(st.stores) ? st.stores : []).find((x: any) => x && x.id === cur); return String(one?.mode || st.mode || "platform"); } catch { return "platform"; } })(),
        usage: await workspaceUsage(Number(r.id)),
        billing: bills.get(Number(r.id)) || null,
        createdAt: r.createdAt, deletedAt: r.deletedAt || null,
      });
    }
    return { workspaces: out.sort((a, b) => a.id - b.id) };
  }),

  /** Make a workspace and email its future owner an invitation to set it up. */
  opCreate: operatorProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120), ownerEmail: z.string().email().max(320), ownerName: z.string().max(128).optional() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await createWorkspace({ name: input.name, createdBy: ctx.user.id });
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 14 * 86400e3);
      const invite = await db.createTeamInvite({ invitedBy: ctx.user.id, workspaceId: ws.id, asOwner: true, email: input.ownerEmail, name: input.ownerName ?? null, role: "admin", token, expiresAt });
      if (!invite) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The workspace was created, but the invitation could not be saved. Use “Invite owner” on its row." });
      const inviteUrl = `${appOrigin()}/invite/${token}`;
      const { sendWorkspaceOwnerInvite } = await import("./teamInvites");
      const emailed = await sendWorkspaceOwnerInvite({ workspaceId: ws.id, workspaceName: input.name, to: input.ownerEmail, inviteeName: input.ownerName ?? null, inviterName: ctx.user.name || "LevelUp", inviteUrl, expiresAt });
      void audit(ctx, "workspace.create", { targetType: "workspace", targetId: ws.id, detail: { name: input.name, ownerEmail: input.ownerEmail } });
      return { ok: true as const, workspaceId: ws.id, inviteUrl, emailed };
    }),

  /** A fresh owner invitation for a workspace that has no owner yet. */
  opInviteOwner: operatorProcedure
    .input(z.object({ workspaceId: z.number().int().positive(), ownerEmail: z.string().email().max(320), ownerName: z.string().max(128).optional() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await getWorkspace(input.workspaceId);
      if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "No such workspace." });
      if (ws.ownerUserId != null) throw new TRPCError({ code: "BAD_REQUEST", message: "That workspace already has an owner. Use “Change owner”." });
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 14 * 86400e3);
      const invite = await db.createTeamInvite({ invitedBy: ctx.user.id, workspaceId: ws.id, asOwner: true, email: input.ownerEmail, name: input.ownerName ?? null, role: "admin", token, expiresAt });
      if (!invite) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not save the invitation." });
      const inviteUrl = `${appOrigin()}/invite/${token}`;
      const { sendWorkspaceOwnerInvite } = await import("./teamInvites");
      const emailed = await sendWorkspaceOwnerInvite({ workspaceId: ws.id, workspaceName: ws.name, to: input.ownerEmail, inviteeName: input.ownerName ?? null, inviterName: ctx.user.name || "LevelUp", inviteUrl, expiresAt });
      return { ok: true as const, inviteUrl, emailed };
    }),

  opUpdate: operatorProcedure
    .input(z.object({
      workspaceId: z.number().int().positive(),
      name: z.string().trim().min(1).max(120).optional(),
      status: z.enum(["active", "suspended"]).optional(),
      features: z.record(z.enum(FEATURES), z.boolean()).optional(),
      /** Daily caps; null clears an override (back to the default). */
      quotas: z.object({ ai: z.number().int().min(0).max(1_000_000).nullable().optional(), email: z.number().int().min(0).max(1_000_000).nullable().optional() }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDb();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [row]: any[] = await conn.select().from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No such workspace." });
      const set: Record<string, unknown> = {};
      if (input.name !== undefined) set.name = input.name;
      if (input.status !== undefined) {
        const mine = await wsIdOf(ctx.user as any);
        if (input.status === "suspended" && (input.workspaceId === mine || input.workspaceId === 1)) throw new TRPCError({ code: "BAD_REQUEST", message: "You can't suspend the platform's own workspace." });
        set.status = input.status;
        if (input.status === "active") set.deletedAt = null; // also restores a workspace its owner closed
      }
      const parse = (v: any) => { try { const o = JSON.parse(String(v || "{}")); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
      if (input.features) set.features = JSON.stringify({ ...parse(row.features), ...input.features });
      if (input.quotas) {
        const q = parse(row.quotas);
        for (const k of ["ai", "email"] as const) {
          const v = input.quotas[k];
          if (v === null) delete q[k]; else if (v !== undefined) q[k] = v;
        }
        set.quotas = JSON.stringify(q);
      }
      if (Object.keys(set).length) await conn.update(workspaces).set(set).where(eq(workspaces.id, input.workspaceId));
      invalidateWorkspace(input.workspaceId);
      void audit(ctx, "workspace.operator_update", { targetType: "workspace", targetId: input.workspaceId, detail: { name: input.name, status: input.status, features: input.features, quotas: input.quotas } });
      return { ok: true as const };
    }),

  /** The members of a workspace — names, emails, roles (so the operator can pick a new owner). No content. */
  opMembers: operatorProcedure
    .input(z.object({ workspaceId: z.number().int().positive() }))
    .query(async ({ input }) => {
      const ws = await getWorkspace(input.workspaceId);
      if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "No such workspace." });
      const list = await db.listWorkspaceUsers({ id: 0, workspaceId: input.workspaceId });
      return { members: list.map((u) => ({ id: u.id, name: u.name, email: u.email, role: ws.ownerUserId === u.id ? "owner" : u.role === "admin" ? "admin" : "member", lastSignedIn: u.lastSignedIn })) };
    }),

  opSetOwner: operatorProcedure
    .input(z.object({ workspaceId: z.number().int().positive(), memberUserId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const conn = await getDb();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      invalidateWorkspace(input.workspaceId);
      const members = await wsMemberIds(input.workspaceId);
      if (!members.includes(input.memberUserId)) throw new TRPCError({ code: "NOT_FOUND", message: "That person is not a member of that workspace." });
      await conn.update(workspaces).set({ ownerUserId: input.memberUserId }).where(eq(workspaces.id, input.workspaceId));
      await conn.update(users).set({ role: "admin" }).where(and(eq(users.id, input.memberUserId), eq(users.workspaceId, input.workspaceId)));
      invalidateWorkspace(input.workspaceId);
      void audit(ctx, "workspace.owner_change", { targetUserId: input.memberUserId, targetType: "workspace", targetId: input.workspaceId });
      return { ok: true as const };
    }),

  /** Close a workspace (30-day grace, like the owner's own request). */
  opDelete: operatorProcedure
    .input(z.object({ workspaceId: z.number().int().positive(), confirmName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ws = await getWorkspace(input.workspaceId);
      if (!ws) throw new TRPCError({ code: "NOT_FOUND", message: "No such workspace." });
      if (input.confirmName.trim() !== ws.name) throw new TRPCError({ code: "BAD_REQUEST", message: "Type the workspace's exact name to confirm." });
      if (ws.id === 1 || ws.id === (await wsIdOf(ctx.user as any))) throw new TRPCError({ code: "BAD_REQUEST", message: "The platform's own workspace can't be closed." });
      const conn = await getDb();
      if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      await conn.update(workspaces).set({ status: "deleted", deletedAt: new Date() }).where(eq(workspaces.id, ws.id));
      invalidateWorkspace(ws.id);
      await (await import("../_core/billing")).cancelSubscriptionNow(ws.id);
      void audit(ctx, "workspace.operator_delete", { targetType: "workspace", targetId: ws.id, detail: { graceDays: GRACE_DAYS } });
      return { ok: true as const, purgeAfterDays: GRACE_DAYS };
    }),
});

/** For auth.me: the caller's workspaces without touching anything else. */
export async function myWorkspaces(me: any): Promise<Array<{ id: number; name: string; role: string; status: string; current: boolean }>> {
  try {
    return (await membershipsOf(me)).map((m) => ({ id: m.workspaceId, name: m.name, role: m.role, status: m.status, current: m.userId === me.id }));
  } catch { return []; }
}
export { accountIdOf };
