import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db";
import { userAppData } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";

// Keys that can be saved/loaded
const DATA_KEYS = ['tasks', 'notes', 'projects', 'goals', 'journal', 'habits', 'contacts', 'ideas', 'teams', 'prefs', 'calEvents', 'clusters'] as const;
type DataKey = typeof DATA_KEYS[number];

export const appDataRouter = router({
  /**
   * Load all saved data blobs for the current user.
   * Returns an object with only the keys that have saved data (null for unsaved keys).
   */
  load: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);

    if (!rows.length) return null;

    const row = rows[0];
    const result: Record<string, unknown> = {};
    for (const key of DATA_KEYS) {
      const raw = row[key as keyof typeof row] as string | null;
      if (raw != null) {
        try {
          result[key] = JSON.parse(raw);
        } catch {
          result[key] = null;
        }
      } else {
        result[key] = null;
      }
    }
    result.updatedAt = row.updatedAt;
    return result;
  }),

  /**
   * Save one or more data blobs for the current user.
   * Accepts a partial object — only provided keys are updated.
   */
  save: protectedProcedure
    .input(
      z.object({
        tasks:     z.string().optional(),
        notes:     z.string().optional(),
        projects:  z.string().optional(),
        goals:     z.string().optional(),
        journal:   z.string().optional(),
        habits:    z.string().optional(),
        contacts:  z.string().optional(),
        ideas:     z.string().optional(),
        teams:     z.string().optional(),
        prefs:     z.string().optional(),
        calEvents: z.string().optional(),
        clusters:  z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };

      // Build only the columns that were provided
      const updates: Partial<Record<DataKey, string>> = {};
      for (const key of DATA_KEYS) {
        const val = input[key as keyof typeof input];
        if (val !== undefined) {
          updates[key as DataKey] = val;
        }
      }

      if (Object.keys(updates).length === 0) return { ok: true };

      // Upsert: insert or update on duplicate userId
      await db
        .insert(userAppData)
        .values({ userId: ctx.user.id, ...updates })
        .onDuplicateKeyUpdate({ set: updates });

      return { ok: true };
    }),
});
