/**
 * Atlas integration router.
 *
 * One-way sync from Atlas (CFResourcePlanner) into LevelUp.
 * Configuration via env vars on the LevelUp deployment:
 *   ATLAS_SYNC_URL    — base URL of Atlas (e.g. https://cfresourceplanner-production.up.railway.app)
 *   ATLAS_SYNC_TOKEN  — bearer token matching Atlas's env var
 *
 * The snapshot lands in user_app_data.atlas (migration 0043) as a JSON blob.
 * Each LevelUp user gets their own mirror — same data, but cached per-user so
 * the UI flows through the existing appData.load / save pipeline.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { userAppData } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import { pullAtlasSnapshot, atlasConfigStatus } from "../_core/atlasAdapter";

export const atlasRouter = router({
  /**
   * Returns env-var configuration status (does the server have URL + token set?)
   * and the user's last-synced timestamp from their stored snapshot.
   */
  status: protectedProcedure.query(async ({ ctx }) => {
    const cfg = atlasConfigStatus();
    const db = await getDb();
    let lastPulledAt: string | null = null;
    let lastUpdatedAt: string | null = null;
    let entityCounts: Record<string, number> = {};
    if (db) {
      const rows = await db.select({ atlas: userAppData.atlas })
        .from(userAppData)
        .where(eq(userAppData.userId, ctx.user.id))
        .limit(1);
      if (rows[0]?.atlas) {
        try {
          const snap = JSON.parse(rows[0].atlas);
          lastPulledAt = snap.pulledAt ?? null;
          lastUpdatedAt = snap.updatedAt ?? null;
          entityCounts = {
            projects: (snap.projects || []).length,
            departments: (snap.departments || []).length,
            members: (snap.departments || []).reduce((s: number, d: any) => s + (d.members?.length || 0), 0),
            activities: (snap.activities || []).length,
            programs: (snap.programs || []).length,
            taskTemplates: (snap.taskTemplates || []).length,
            proposals: (snap.proposals || []).length,
            recruitings: (snap.recruitings || []).length,
            candidates: (snap.candidates || []).length,
            reports: (snap.atlasComputed?.reports || []).length,
          };
        } catch { /* swallow parse errors — treat as no snapshot */ }
      }
    }
    return {
      urlConfigured: cfg.urlConfigured,
      tokenConfigured: cfg.tokenConfigured,
      baseUrl: cfg.baseUrl,
      lastPulledAt,
      lastUpdatedAt,
      entityCounts,
    };
  }),

  /**
   * Manual pull: hits Atlas, stores the snapshot in user_app_data.atlas.
   * Returns counts so the UI can confirm. Never throws on parse — the adapter
   * does validation; we just persist what comes back.
   */
  pull: protectedProcedure.mutation(async ({ ctx }) => {
    const snapshot = await pullAtlasSnapshot();
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    const payload = JSON.stringify(snapshot);
    // Upsert by userId
    const existing = await db.select({ id: userAppData.id })
      .from(userAppData)
      .where(eq(userAppData.userId, ctx.user.id))
      .limit(1);
    if (existing[0]) {
      await db.update(userAppData).set({ atlas: payload }).where(eq(userAppData.userId, ctx.user.id));
    } else {
      await db.insert(userAppData).values({ userId: ctx.user.id, atlas: payload });
    }
    return {
      ok: true,
      pulledAt: snapshot.pulledAt,
      updatedAt: snapshot.updatedAt,
      counts: {
        projects: snapshot.projects?.length || 0,
        departments: snapshot.departments?.length || 0,
        members: (snapshot.departments || []).reduce((s, d) => s + (d.members?.length || 0), 0),
        activities: snapshot.activities?.length || 0,
        programs: snapshot.programs?.length || 0,
        taskTemplates: snapshot.taskTemplates?.length || 0,
        proposals: snapshot.proposals?.length || 0,
        recruitings: snapshot.recruitings?.length || 0,
        candidates: snapshot.candidates?.length || 0,
        reports: snapshot.atlasComputed?.reports?.length || 0,
      },
    };
  }),

  /**
   * Wipe the user's stored Atlas snapshot. Used when disconnecting / cleaning up.
   * Does NOT touch Atlas itself.
   */
  clear: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error('Database unavailable');
    await db.update(userAppData).set({ atlas: null }).where(eq(userAppData.userId, ctx.user.id));
    return { ok: true };
  }),
});
