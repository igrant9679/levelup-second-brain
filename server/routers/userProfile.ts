import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

/**
 * Avatar images (audit F35): only PNG, JPEG, WebP and GIF, and the bytes must
 * really be that format — the MIME type used to be whatever the caller sent,
 * and it was stored as the file's Content-Type.
 */
const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
type AvatarType = (typeof AVATAR_TYPES)[number];
const EXT: Record<AvatarType, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };

/** The image type the bytes actually are (magic numbers), or null. */
export function sniffImageType(buf: Buffer): AvatarType | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString("latin1"))) return "image/gif";
  return null;
}

export const userProfileRouter = router({
  uploadAvatar: protectedProcedure
    .input(
      z.object({
        dataUrl: z.string().max(10 * 1024 * 1024), // 10 MB base64 limit
        mimeType: z.enum(AVATAR_TYPES).default("image/jpeg"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.user.id ?? ctx.user.openId ?? "unknown";
      // Strip the data URL prefix to get raw base64
      const base64 = input.dataUrl.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(base64, "base64");
      const actual = sniffImageType(buffer);
      if (!actual) throw new TRPCError({ code: "BAD_REQUEST", message: "Please choose a PNG, JPEG, WebP or GIF image." });
      // The stored type is what the bytes are, whatever the caller claimed.
      const fileKey = `user-avatars/${userId}-avatar.${EXT[actual]}`;
      const { url } = await storagePut(fileKey, buffer, actual);
      return { url };
    }),
});
