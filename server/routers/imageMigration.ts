/**
 * Note image migration router.
 *
 * One-shot backfill that walks the current user's notes, finds every inline
 * `data:image/...;base64,...` URI embedded in a note's `body` / `bodyHtml`,
 * uploads each image to the configured storage backend (Google Drive), and
 * replaces the data URI with the permanent storage URL. This shrinks the
 * notes blob so it fits back inside the browser's localStorage budget — the
 * old pre-Drive imports baked images in as multi-MB data URIs.
 *
 * - Idempotent: a second run finds no data URIs and changes nothing.
 * - Safe: an image that fails to upload is left as its data URI, so no image
 *   is ever dropped. If the notes JSON can't be parsed, it aborts untouched.
 * - Deduplicated: an identical image embedded in several notes uploads once.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { userAppData } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { storageBackend, storagePut } from "../storage";

// data:image/<subtype>;base64,<payload> — payload stops at the first
// non-base64 character (e.g. the closing quote of an HTML attribute).
const DATA_URI_RE = /data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+=*/gi;

/** Run an async fn over items with a bounded number of concurrent workers. */
async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const idx = next++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
  );
}

export const imageMigrationRouter = router({
  /**
   * Backfill: move inline data-URI images out of the user's notes into the
   * configured storage backend. Returns a summary of what was migrated.
   */
  migrateNoteImages: protectedProcedure.mutation(async ({ ctx }) => {
    const backend = storageBackend();
    if (backend === "none") {
      throw new Error(
        "No storage backend is configured on the server — cannot migrate images.",
      );
    }
    const db = await getDb();
    if (!db) throw new Error("Database unavailable.");

    const rows = await db
      .select()
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);

    const rawNotes = rows.length ? (rows[0].notes as string | null) : null;
    if (rawNotes == null) {
      return {
        ok: true, backend, notesScanned: 0, notesChanged: 0,
        imagesFound: 0, imagesMigrated: 0, imagesFailed: 0,
        bytesBefore: 0, bytesAfter: 0,
      };
    }

    const bytesBefore = Buffer.byteLength(rawNotes, "utf-8");
    let notes: Array<Record<string, unknown>>;
    try {
      const parsed = JSON.parse(rawNotes);
      if (!Array.isArray(parsed)) throw new Error("not an array");
      notes = parsed;
    } catch {
      throw new Error("Notes data could not be parsed — aborting, nothing changed.");
    }

    // Pass 1: collect every unique data URI across all notes.
    const uniqueUris = new Set<string>();
    for (const note of notes) {
      if (!note || typeof note !== "object") continue;
      for (const field of ["body", "bodyHtml"] as const) {
        const v = note[field];
        if (typeof v === "string" && v.includes("data:image/")) {
          for (const m of v.match(DATA_URI_RE) || []) uniqueUris.add(m);
        }
      }
    }
    const uriList = [...uniqueUris];

    if (uriList.length === 0) {
      return {
        ok: true, backend, notesScanned: notes.length, notesChanged: 0,
        imagesFound: 0, imagesMigrated: 0, imagesFailed: 0,
        bytesBefore, bytesAfter: bytesBefore,
      };
    }

    // Pass 2: upload each unique image to storage (bounded concurrency).
    const urlByUri = new Map<string, string>();
    let imagesFailed = 0;
    await mapWithConcurrency(uriList, 5, async (uri, idx) => {
      const mm = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+=*)$/i.exec(uri);
      if (!mm) { imagesFailed++; return; }
      const mime = mm[1].toLowerCase();
      let buf: Buffer;
      try {
        buf = Buffer.from(mm[2], "base64");
      } catch {
        imagesFailed++;
        return;
      }
      if (buf.length === 0) { imagesFailed++; return; }
      const ext =
        (mime.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") ||
        "png";
      const key = `note-images/migrated-${Date.now()}-${idx}.${ext}`;
      try {
        const { url } = await storagePut(key, buf, mime);
        urlByUri.set(uri, url);
      } catch (e) {
        imagesFailed++;
        console.warn(
          `[imageMigration] upload failed for image ${idx + 1}/${uriList.length}:`,
          e instanceof Error ? e.message : e,
        );
      }
    });

    // Pass 3: rewrite the notes, swapping each migrated data URI for its URL.
    // Data URIs whose upload failed are left untouched (urlByUri has no entry)
    // so the image still survives — it just stays inline for now.
    let notesChanged = 0;
    for (const note of notes) {
      if (!note || typeof note !== "object") continue;
      let changed = false;
      for (const field of ["body", "bodyHtml"] as const) {
        const v = note[field];
        if (typeof v !== "string" || !v.includes("data:image/")) continue;
        const out = v.replace(DATA_URI_RE, (m) => urlByUri.get(m) ?? m);
        if (out !== v) { note[field] = out; changed = true; }
      }
      if (changed) notesChanged++;
    }

    let bytesAfter = bytesBefore;
    if (notesChanged > 0) {
      const newRaw = JSON.stringify(notes);
      bytesAfter = Buffer.byteLength(newRaw, "utf-8");
      await db
        .insert(userAppData)
        .values({ userId: ctx.user.id, notes: newRaw })
        .onDuplicateKeyUpdate({ set: { notes: newRaw } });
    }

    return {
      ok: true,
      backend,
      notesScanned: notes.length,
      notesChanged,
      imagesFound: uriList.length,
      imagesMigrated: urlByUri.size,
      imagesFailed,
      bytesBefore,
      bytesAfter,
    };
  }),
});
