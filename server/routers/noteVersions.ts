/**
 * Note history and Trash (build -241, migration 0060). Everything is scoped to
 * the signed-in user's own notes. Versions are written by the sync itself
 * (server/_core/noteVersions.ts); the client adds the ones only it knows
 * about: its own text after a conflict, the copy before a restore or a
 * OneNote sync, and the copies notes carried in n.versions before -241.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { noteVersions, notesTable } from "../../drizzle/schema";
import { recordNoteVersion, pruneTrash, TRASH_DAYS } from "../_core/noteVersions";

async function db0() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}
const NOTE_ID = z.string().min(1).max(40);
const TEXT = z.string().max(3_000_000);
const legacyItem = z.object({
  title: z.string().max(512).optional().nullable(),
  body: TEXT.optional().nullable(),
  bodyHtml: TEXT.optional().nullable(),
  savedAt: z.string().max(40).optional().nullable(),
  from: z.string().max(255).optional().nullable(),
  conflict: z.boolean().optional().nullable(),
});

export const noteVersionsRouter = router({
  /** A note's history, newest first (text left out). */
  list: protectedProcedure
    .input(z.object({ noteId: NOTE_ID }))
    .query(async ({ input, ctx }) => {
      const db = await db0();
      const rows = await db.select({
        id: noteVersions.id, kind: noteVersions.kind, label: noteVersions.label, title: noteVersions.title,
        chars: noteVersions.chars, savedAt: noteVersions.savedAt,
      }).from(noteVersions)
        .where(and(eq(noteVersions.userId, ctx.user.id), eq(noteVersions.noteId, input.noteId)))
        .orderBy(desc(noteVersions.savedAt), desc(noteVersions.id)).limit(200);
      return rows.filter((r: any) => r.kind !== "deleted");
    }),

  /** One version with its text. */
  get: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const db = await db0();
      const [row] = await db.select().from(noteVersions)
        .where(and(eq(noteVersions.userId, ctx.user.id), eq(noteVersions.id, input.id))).limit(1);
      if (!row) return null;
      return { id: row.id, noteId: row.noteId, kind: row.kind, label: row.label, title: row.title, bodyHtml: row.bodyHtml, body: row.body, savedAt: row.savedAt, raw: row.kind === "deleted" ? row.raw : null };
    }),

  /** A copy only the client has (before a restore, its text after a conflict). */
  add: protectedProcedure
    .input(z.object({
      noteId: NOTE_ID, kind: z.enum(["conflict", "restore", "sync"]),
      title: z.string().max(512).optional(), bodyHtml: TEXT.optional(), body: TEXT.optional(), label: z.string().max(255).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await db0();
      const written = await recordNoteVersion(db, ctx.user.id, { noteId: input.noteId, kind: input.kind, title: input.title, bodyHtml: input.bodyHtml, body: input.body, label: input.label });
      return { ok: true, written };
    }),

  /**
   * Copies notes carried in n.versions (before -241, and conflict copies a
   * device files while offline). Same text + same time = already here, so
   * two devices moving the same copies store them once. The client drops
   * n.versions from the notes it sent once this returns.
   */
  importLegacy: protectedProcedure
    .input(z.object({ items: z.array(z.object({ noteId: NOTE_ID, versions: z.array(legacyItem).max(60) })).max(100) }))
    .mutation(async ({ input, ctx }) => {
      const db = await db0();
      let written = 0, seen = 0;
      for (const it of input.items) {
        for (const v of it.versions) {
          seen++;
          const t = v.savedAt ? new Date(v.savedAt) : null;
          const ok = await recordNoteVersion(db, ctx.user.id, {
            noteId: it.noteId, kind: v.conflict ? "conflict" : "legacy",
            title: v.title ?? "", bodyHtml: v.bodyHtml ?? "", body: v.body ?? "",
            label: v.from ?? null, savedAt: t && !isNaN(t.getTime()) ? t : null,
          });
          if (ok) written++;
        }
      }
      return { ok: true, written, seen, notes: input.items.map((i) => i.noteId) };
    }),

  /** Notes deleted in the last TRASH_DAYS days that haven't come back. */
  trash: protectedProcedure.query(async ({ ctx }) => {
    const db = await db0();
    await pruneTrash(db, ctx.user.id);
    const since = new Date(Date.now() - TRASH_DAYS * 86400000);
    const rows = await db.select({
      id: noteVersions.id, noteId: noteVersions.noteId, title: noteVersions.title, chars: noteVersions.chars, savedAt: noteVersions.savedAt,
    }).from(noteVersions)
      .where(and(eq(noteVersions.userId, ctx.user.id), eq(noteVersions.kind, "deleted")))
      .orderBy(desc(noteVersions.savedAt), desc(noteVersions.id)).limit(300)
      .then((rs: any[]) => rs.filter((r) => new Date(r.savedAt).getTime() >= since.getTime()));
    if (!rows.length) return [];
    const ids = Array.from(new Set(rows.map((r: any) => r.noteId)));
    const live = await db.select({ noteId: notesTable.noteId }).from(notesTable)
      .where(and(eq(notesTable.userId, ctx.user.id), inArray(notesTable.noteId, ids)));
    const alive = new Set(live.map((r: any) => r.noteId));
    const out: any[] = [], seenNote = new Set<string>();
    for (const r of rows) {
      if (alive.has(r.noteId) || seenNote.has(r.noteId)) continue; // restored, or an older delete of the same note
      seenNote.add(r.noteId);
      out.push(r);
    }
    return out;
  }),

  /** Remove trash entries for good. */
  purge: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int()).max(300) }))
    .mutation(async ({ input, ctx }) => {
      const db = await db0();
      if (!input.ids.length) return { ok: true };
      await db.delete(noteVersions).where(and(eq(noteVersions.userId, ctx.user.id), eq(noteVersions.kind, "deleted"), inArray(noteVersions.id, input.ids)));
      return { ok: true };
    }),
});
