import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

export const userProfileRouter = router({
  uploadAvatar: protectedProcedure
    .input(
      z.object({
        dataUrl: z.string().max(10 * 1024 * 1024), // 10 MB base64 limit
        mimeType: z.string().default("image/jpeg"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id ?? ctx.user.openId ?? "unknown";
      // Strip the data URL prefix to get raw base64
      const base64 = input.dataUrl.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");

      const ext = input.mimeType.includes("png") ? "png" : "jpg";
      const fileKey = `user-avatars/${userId}-avatar.${ext}`;

      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      return { url };
    }),
});
