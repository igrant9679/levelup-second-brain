/**
 * Owner-only guard for tRPC procedures.
 *
 * "Admin" is not a trust boundary in this workspace: every invited teammate is
 * role=admin (see CLAUDE.md, build -112). Tools that can reach other people's
 * accounts — the system mail sender, stored SMTP credentials, invites, global
 * jobs — must be gated on the workspace OWNER instead.
 *
 * isOwnerCtxUser lives in routers/appData.ts (it caches the first user id);
 * it is imported lazily so _core modules can use this without an import cycle.
 */
import { TRPCError } from "@trpc/server";

export async function isOwner(user: { id: number; openId?: string | null } | null | undefined): Promise<boolean> {
  if (!user) return false;
  const { isOwnerCtxUser } = await import("../routers/appData");
  return isOwnerCtxUser(user);
}

export async function assertOwner(user: { id: number; openId?: string | null } | null | undefined): Promise<void> {
  if (!(await isOwner(user))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only the workspace owner can do this." });
  }
}
