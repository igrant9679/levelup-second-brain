import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
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

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = base.use(requireUser);

export const adminProcedure = base.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    // Allow the platform owner (matched by openId) even if their DB role is still 'user'
    const isOwner = ENV.ownerOpenId && ctx.user?.openId === ENV.ownerOpenId;
    if (!ctx.user || (ctx.user.role !== 'admin' && !isOwner)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Workspace OWNER only (-253). Teammates are ordinary members unless the
 * owner grants admin, and admin never reaches the owner's data — so tools
 * that read or change other people's accounts use this, not adminProcedure.
 */
export const ownerProcedure = base.use(requireUser).use(
  t.middleware(async opts => {
    const { assertOwner } = await import("./ownerGuard");
    await assertOwner(opts.ctx.user as any);
    return opts.next();
  }),
);
