import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import * as db from "../db";
import { ENV } from "../_core/env";
import { users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { assertOwner, isOwner } from "../_core/ownerGuard";
import { canOverride } from "../_core/access";

export const teamRouter = router({
  /**
   * List the real workspace members (accounts) so any member can assign work to
   * teammates — including invited users like new hires that aren't in the local
   * D.teams blob. Available to all signed-in members; returns minimal fields.
   */
  listMembers: protectedProcedure.query(async () => {
    const list = await db.adminListAllUsers();
    const out = [];
    for (const u of list) {
      // owner flag (-253): the Team page's role control never offers to change the owner
      const full = await db.getUserById(u.id);
      out.push({ id: u.id, name: u.name, email: u.email, role: u.role, owner: full ? await isOwner(full as any) : false, lastSignedIn: u.lastSignedIn ? new Date(u.lastSignedIn).toISOString() : null });
    }
    return out;
  }),

  /**
   * Grant or revoke admin (-253). Owner only. Teammates are ordinary members
   * unless the owner makes them admins here, and admin never reaches the
   * owner's own data (canOverride in _core/access.ts). The owner's own role is
   * not changed here.
   */
  setRole: protectedProcedure
    .input(z.object({ userId: z.number().int(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx.user);
      const target = await db.getUserById(input.userId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "No such member." });
      if (await isOwner(target as any)) throw new TRPCError({ code: "BAD_REQUEST", message: "The workspace owner keeps full access." });
      const dbi = await db.getDb();
      if (!dbi) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      await dbi.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
      return { ok: true as const, userId: input.userId, role: input.role };
    }),

  /**
   * Upload a team member avatar.
   * Accepts a base64 data URL (e.g. "data:image/jpeg;base64,...").
   * Returns the /manus-storage/... URL to store in D.teams member.avatar.
   */
  uploadMemberAvatar: protectedProcedure
    .input(
      z.object({
        memberId: z.number(),
        dataUrl: z.string().min(1),
        mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { memberId, dataUrl, mimeType } = input;

      // Strip the data URL prefix to get raw base64
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      // Validate size: max 5MB
      if (buffer.byteLength > 5 * 1024 * 1024) {
        throw new Error("Avatar image must be under 5 MB");
      }

      const ext = mimeType.split("/")[1] ?? "jpg";
      // Keyed by the uploader (-253): one member could overwrite another
      // member's picture by choosing their id.
      const key = `team-avatars/u${ctx.user.id}/member-${memberId}-${Date.now()}.${ext}`;

      const { url } = await storagePut(key, buffer, mimeType);
      return { url };
    }),

  /**
   * Delete a team member by user ID.
   * Cannot delete yourself or the platform owner.
   */
  deleteMember: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent self-deletion
      if (ctx.user.id === input.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot delete your own account.' });
      }
      // Only the owner, or an admin the owner granted, may remove another
      // account — and never the owner's (-253).
      if (!(await canOverride(ctx.user as any, input.userId))) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the workspace owner can remove members.' });
      }
      const targetUser = await db.getUserById(input.userId);
      if (targetUser) {
        if ((ENV.ownerOpenId && targetUser.openId === ENV.ownerOpenId) || (await isOwner(targetUser as any))) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'The platform owner cannot be deleted.' });
        }
        await db.deleteTeamMember(input.userId);
      }
      // If user doesn't exist in DB (e.g. local-only team member), still return success
      // so the frontend can remove them from the local team data
      return { success: true };
    }),
});
