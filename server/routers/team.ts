import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";
import * as db from "../db";
import { ENV } from "../_core/env";

export const teamRouter = router({
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
    .mutation(async ({ input }) => {
      const { memberId, dataUrl, mimeType } = input;

      // Strip the data URL prefix to get raw base64
      const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      // Validate size: max 5MB
      if (buffer.byteLength > 5 * 1024 * 1024) {
        throw new Error("Avatar image must be under 5 MB");
      }

      const ext = mimeType.split("/")[1] ?? "jpg";
      const key = `team-avatars/member-${memberId}.${ext}`;

      const { url } = await storagePut(key, buffer, mimeType);
      return { url };
    }),

  /**
   * Delete a team member by user ID.
   * Cannot delete yourself or the platform owner.
   */
  deleteMember: adminProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      // Prevent self-deletion
      if (ctx.user.id === input.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'You cannot delete your own account.' });
      }
      // Prevent deleting the platform owner
      const targetUser = await db.getUserById(input.userId);
      if (!targetUser) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found.' });
      if (ENV.ownerOpenId && targetUser.openId === ENV.ownerOpenId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'The platform owner cannot be deleted.' });
      }
      await db.deleteTeamMember(input.userId);
      return { success: true };
    }),
});
