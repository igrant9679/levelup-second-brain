/**
 * Note history (build -241, migration 0060).
 *
 * A note's earlier versions live in note_versions instead of inside the note
 * (n.versions used to hold up to 20 full copies, added on every save, sent
 * with every sync and missing on other devices). The per-item sync records
 * the stored copy before each change, at most one per EDIT_GAP_MS per note,
 * so autosave doesn't turn every keystroke pause into a version: the history
 * holds the note as it was before each editing session (and every 10 minutes
 * during a long one). Deleting a note records the whole note (kind 'deleted',
 * with raw) — that is the Trash.
 *
 * Recording never throws into the caller: a missing table (migration not yet
 * applied) or a failed insert is logged and the sync goes on.
 */
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { noteVersions } from "../../drizzle/schema";

export const EDIT_GAP_MS = 10 * 60 * 1000;
// A note left alone this long before the next change ends an editing
// session: the copy from before the pause is kept even inside EDIT_GAP_MS.
export const PAUSE_MS = 2 * 60 * 1000;
export const KEEP_PER_NOTE = 100;
export const TRASH_DAYS = 30;
export const VERSION_KINDS = ["edit", "shared", "conflict", "restore", "sync", "legacy", "deleted"] as const;
export type VersionKind = typeof VERSION_KINDS[number];

export function versionHash(title: string, bodyHtml: string, body: string): string {
  const s = title + "\u0001" + bodyHtml + "\u0001" + body;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

export type VersionInput = {
  noteId: string;
  kind: VersionKind;
  title?: string | null;
  bodyHtml?: string | null;
  body?: string | null;
  label?: string | null;
  raw?: string | null;      // whole note — only kept for 'deleted'
  savedAt?: Date | null;    // legacy copies keep their own time
  prevWrittenAt?: Date | null; // when the stored copy was last written (edit)
};

/** The note's text fields out of its stored JSON. */
export function versionFromRaw(noteId: string, raw: string | null | undefined, kind: VersionKind, label?: string): VersionInput | null {
  if (!raw) return null;
  let n: any;
  try { n = JSON.parse(raw); } catch { return null; }
  if (!n || typeof n !== "object") return null;
  return {
    noteId, kind, label: label ?? null,
    title: String(n.title ?? ""), bodyHtml: String(n.bodyHtml ?? ""), body: String(n.body ?? ""),
    raw: kind === "deleted" ? raw : null,
  };
}

/**
 * Insert one version. Skips empty notes and a copy identical to the newest
 * one already kept; an 'edit' is also skipped when the newest version of the
 * note is younger than EDIT_GAP_MS. Returns true when a row was written.
 */
export async function recordNoteVersion(db: any, userId: number, v: VersionInput, now = new Date()): Promise<boolean> {
  try {
    const title = String(v.title ?? "").slice(0, 512);
    const bodyHtml = String(v.bodyHtml ?? "");
    const body = String(v.body ?? "");
    if (!title.trim() && !bodyHtml.trim() && !body.trim() && v.kind !== "deleted") return false;
    const noteId = String(v.noteId).slice(0, 40);
    const hash = versionHash(title, bodyHtml, body);
    // Whole seconds: the column has no fractions and MySQL rounds them, so a
    // millisecond time would never match its own row again.
    const t0 = v.savedAt && !isNaN(v.savedAt.getTime()) ? v.savedAt.getTime() : now.getTime();
    const savedAt = new Date(Math.floor(t0 / 1000) * 1000);
    if (v.kind === "legacy" || v.kind === "conflict") {
      // Copies moved from n.versions can arrive from two devices: same text
      // and same time = the same copy.
      const [dup] = await db.select({ id: noteVersions.id }).from(noteVersions)
        .where(and(eq(noteVersions.userId, userId), eq(noteVersions.noteId, noteId), eq(noteVersions.hash, hash), eq(noteVersions.savedAt, savedAt))).limit(1);
      if (dup) return false;
    } else if (v.kind !== "deleted") {
      const [last] = await db.select({ hash: noteVersions.hash, savedAt: noteVersions.savedAt, kind: noteVersions.kind }).from(noteVersions)
        .where(and(eq(noteVersions.userId, userId), eq(noteVersions.noteId, noteId)))
        .orderBy(desc(noteVersions.savedAt), desc(noteVersions.id)).limit(1);
      if (last && last.hash === hash && last.kind !== "deleted") return false;
      const paused = !!(v.prevWrittenAt && now.getTime() - new Date(v.prevWrittenAt).getTime() >= PAUSE_MS);
      if (v.kind === "edit" && last && !paused && now.getTime() - new Date(last.savedAt).getTime() < EDIT_GAP_MS) return false;
    }
    await db.insert(noteVersions).values({
      userId, noteId, kind: v.kind, label: v.label ? String(v.label).slice(0, 255) : null,
      title, bodyHtml, body, raw: v.kind === "deleted" ? (v.raw ?? null) : null,
      hash, chars: (bodyHtml || body).length, savedAt,
    });
    await pruneNote(db, userId, noteId);
    return true;
  } catch (e: any) {
    console.warn("[noteVersions] could not record a version:", e?.message || e);
    return false;
  }
}

/** Keep the newest KEEP_PER_NOTE versions of a note (trash entries aside). */
async function pruneNote(db: any, userId: number, noteId: string) {
  const rows = await db.select({ id: noteVersions.id }).from(noteVersions)
    .where(and(eq(noteVersions.userId, userId), eq(noteVersions.noteId, noteId), sql`${noteVersions.kind} <> 'deleted'`))
    .orderBy(desc(noteVersions.savedAt), desc(noteVersions.id));
  if (rows.length <= KEEP_PER_NOTE) return;
  const drop = rows.slice(KEEP_PER_NOTE).map((r: any) => r.id);
  await db.delete(noteVersions).where(inArray(noteVersions.id, drop));
}

/** Trash entries older than TRASH_DAYS are removed (their history stays). */
export async function pruneTrash(db: any, userId: number, now = new Date()) {
  try {
    const cutoff = new Date(now.getTime() - TRASH_DAYS * 86400000);
    await db.delete(noteVersions).where(and(eq(noteVersions.userId, userId), eq(noteVersions.kind, "deleted"), lt(noteVersions.savedAt, cutoff)));
  } catch (e: any) {
    console.warn("[noteVersions] trash prune failed:", e?.message || e);
  }
}
