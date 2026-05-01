import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

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
});
