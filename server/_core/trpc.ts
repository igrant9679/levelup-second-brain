import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

/** `crossWorkspace`: an operator tool that names people in other workspaces on purpose. */
export type ProcedureMeta = { crossWorkspace?: boolean };

const t = initTRPC.context<TrpcContext>().meta<ProcedureMeta>().create({
  transformer: superjson,
});

export const router = t.router;

// Audit log (build -233): procedures listed in AUDITED are recorded once they
// succeed — see _core/audit.ts. Imported lazily (audit → db → schema) so this
// module stays light; the write is not awaited by the caller's response.
const auditMw = t.middleware(async (opts) => {
  const result = await opts.next();
  if (result.ok) {
    try {
      const { AUDITED, audit } = await import("./audit");
      const spec = AUDITED[opts.path];
      if (spec) {
        const input = spec.target ? await opts.getRawInput().catch(() => null) : null;
        const target = spec.target ? spec.target(input) : {};
        // An owner editing their own item through a shared endpoint isn't cross-user.
        if (!(spec.action === "shared.edit" && target.targetUserId != null && target.targetUserId === opts.ctx.user?.id)) {
          void audit(opts.ctx, spec.action, target);
        }
      }
    } catch { /* auditing never fails the request */ }
  }
  return result;
});
const base = t.procedure.use(auditMw);

export const publicProcedure = base;

/**
 * Billing lock (build -279). A workspace whose trial ended without a plan,
 * whose payment stayed unpaid past the grace period, or whose subscription
 * was canceled is LOCKED: its people can still sign in, see why, pay, switch
 * workspace, export and close it — and nothing else. Workspaces with no
 * billing record (all that existed before self-serve sign-up) are never
 * locked; see server/_core/billing.ts.
 */
export const BILLING_LOCKED_MSG = "This workspace is locked until its plan is sorted out (BILLING_LOCKED)";
const BILLING_OPEN_PATHS = /^(auth\.|billing\.|emailAuth\.|workspace\.(list|switch|current|export|requestDelete)$|ops\.reportClientError$)/;
export function billingOpenPath(path: string): boolean { return BILLING_OPEN_PATHS.test(String(path || "")); }

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  const wsOfUser = Number((ctx.user as any).workspaceId);
  if (Number.isInteger(wsOfUser) && wsOfUser > 0 && !billingOpenPath(opts.path)) {
    const { isBillingLocked } = await import("./billing");
    if (await isBillingLocked(wsOfUser)) throw new TRPCError({ code: "FORBIDDEN", message: BILLING_LOCKED_MSG });
  }

  // Helper code deep below (which AI key, whose daily limits) reads the member
  // this request is for from memberContext.ts.
  const { runAsMember } = await import("./memberContext");
  const user = ctx.user;
  return runAsMember(user as any, () => next({
    ctx: {
      ...ctx,
      user,
    },
  }));
});

/**
 * Never trust a person id from the client (multi-workspace, -278).
 *
 * Any request field that names another person — ownerUserId, userId,
 * linkedUserId, primaryAssigneeId, assignees[] … — must be a member of the
 * CALLER's workspace, or the request is refused as "no such person" before the
 * procedure runs. This is a net under the per-procedure checks: a procedure
 * added later that takes `ownerUserId` is covered without remembering to.
 * Looks at the top level of the input and one object below it (e.g. `patch`).
 */
const PERSON_FIELDS = new Set(["ownerUserId", "userId", "linkedUserId", "primaryAssigneeId", "toUserId", "targetUserId", "memberUserId", "assigneeId", "newOwnerUserId"]);
const PERSON_LIST_FIELDS = new Set(["assignees", "userIds", "memberIds"]);
export function personIdsInInput(input: unknown): number[] {
  const out: number[] = [];
  const take = (v: unknown) => { if (typeof v === "number" && Number.isInteger(v) && v > 0) out.push(v); };
  const walk = (o: unknown, depth: number) => {
    if (!o || typeof o !== "object" || Array.isArray(o)) return;
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (PERSON_FIELDS.has(k)) take(v);
      else if (PERSON_LIST_FIELDS.has(k) && Array.isArray(v)) v.forEach(take);
      else if (depth < 1 && v && typeof v === "object" && !Array.isArray(v)) walk(v, depth + 1);
    }
  };
  walk(input, 0);
  return out;
}
const sameWorkspaceInputs = t.middleware(async (opts) => {
  if (opts.ctx.user && !opts.meta?.crossWorkspace) {
    let raw: unknown = null;
    try { raw = await opts.getRawInput(); } catch { raw = null; }
    const ids = personIdsInInput(raw);
    if (ids.length) {
      const { filterToWorkspace } = await import("./workspace");
      const ok = await filterToWorkspace(opts.ctx.user as any, ids);
      if (ok.length !== new Set(ids).size) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No such person in this workspace." });
      }
    }
  }
  return opts.next();
});

export const protectedProcedure = base.use(requireUser).use(sameWorkspaceInputs);

/**
 * WHO MAY CALL WHAT (multi-workspace, -278). ctx.user is a MEMBER of exactly
 * one active workspace (see _core/workspace.ts), so:
 *   protectedProcedure / wsMemberProcedure  any member of the workspace
 *   adminProcedure     / wsAdminProcedure   its owner, or an admin the owner granted
 *   ownerProcedure     / wsOwnerProcedure   its owner
 *   operatorProcedure                       the PLATFORM operator — tools that
 *       span workspaces (backups, error log, creating / suspending workspaces).
 *       Operator tools never return a workspace's content.
 * "Admin" and "owner" are per workspace: an admin of one company is nobody in
 * another.
 */
export const adminProcedure = base.use(requireUser).use(sameWorkspaceInputs).use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    let ok = ctx.user!.role === 'admin';
    if (!ok) {
      // the workspace owner, even if their role column still says 'user'
      const { workspaceOwnerVerdict } = await import("./workspace");
      const v = await workspaceOwnerVerdict(ctx.user as any);
      if (v === null) {
        // no workspace model (older tests): the configured owner account, as before
        const { ENV } = await import("./env");
        ok = !!ENV.ownerOpenId && ctx.user!.openId === ENV.ownerOpenId;
      } else ok = v;
    }
    if (!ok) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next();
  }),
);

/**
 * Workspace OWNER only (-253). Teammates are ordinary members unless the
 * owner grants admin, and admin never reaches the owner's data — so tools
 * that read or change other people's accounts use this, not adminProcedure.
 */
export const ownerProcedure = base.use(requireUser).use(sameWorkspaceInputs).use(
  t.middleware(async opts => {
    const { assertOwner } = await import("./ownerGuard");
    await assertOwner(opts.ctx.user as any);
    return opts.next();
  }),
);

/** Platform operator only: cross-workspace tools. Never returns workspace content. */
export const operatorProcedure = base.use(requireUser).meta({ crossWorkspace: true }).use(
  t.middleware(async opts => {
    const { assertOperator } = await import("./workspace");
    await assertOperator(opts.ctx.user as any);
    return opts.next();
  }),
);

export const wsMemberProcedure = protectedProcedure;
export const wsAdminProcedure = adminProcedure;
export const wsOwnerProcedure = ownerProcedure;
