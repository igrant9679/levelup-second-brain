/**
 * External-tasks puller cron.
 *
 * Hourly job (mirrors scheduledReports.ts pattern): walks every enabled
 * Smartsheet / Nifty watch config, runs the matching adapter, and upserts
 * results into external_tasks. Rows that vanished from the source feed get
 * removedAt stamped (kept for a grace period); after the grace period, the
 * matching override (if any) is tombstoned so personal notes survive.
 *
 * Per-source errors are logged to the watch row's lastError; one bad sheet
 * doesn't stop other sheets from pulling.
 */

import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  externalSourceCredentials,
  externalTasks,
  externalTaskOverrides,
  smartsheetWatchedSheets,
  niftyWatchedProjects,
  type SmartsheetWatchedSheet,
  type NiftyWatchedProject,
  type ExternalSourceCredential,
} from "../../drizzle/schema";
import { pullSmartsheet, type ExternalTaskInput } from "./smartsheetAdapter";
import { pullNiftyProject, type NiftyExternalTaskInput } from "./niftyAdapter";
import { insertScheduledTaskLog } from "../db";

const TOMBSTONE_GRACE_HOURS = 72; // 3 days

type AnyExtTask = ExternalTaskInput | NiftyExternalTaskInput;

async function getCredFor(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  source: 'smartsheet' | 'nifty',
): Promise<ExternalSourceCredential | null> {
  const rows = await db.select().from(externalSourceCredentials)
    .where(and(eq(externalSourceCredentials.userId, userId), eq(externalSourceCredentials.source, source)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Upsert one source's results for one user. Returns counts.
 * Uses a "seen-this-pull" set to compute vanished rows and stamp removedAt.
 */
async function upsertResults(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  source: 'smartsheet' | 'nifty',
  sourceConfigId: number,
  rows: AnyExtTask[],
): Promise<{ upserted: number; vanished: number }> {
  const seenIds = new Set(rows.map(r => r.externalId));

  // Status → done classifier (mirrors the client-side _extStatusToBoardCol
  // logic but server-side). Tolerates Smartsheet ("Done"), Nifty ("Closed"),
  // and synonyms.
  const isDoneStatus = (s: string | null | undefined) => {
    const x = (s || '').toLowerCase().trim();
    if (!x) return false;
    return /(^|\s)(done|complete|completed|closed|cancell?ed|resolved|shipped)/i.test(x);
  };

  // Pre-fetch existing rows for this source+config so we can detect a status
  // transition (open → done stamps completedAt; done → open clears it).
  const existingRows = await db.select({
    externalId: externalTasks.externalId,
    status: externalTasks.status,
    completedAt: externalTasks.completedAt,
  })
    .from(externalTasks)
    .where(and(
      eq(externalTasks.userId, userId),
      eq(externalTasks.source, source),
      eq(externalTasks.sourceConfigId, sourceConfigId),
    ));
  const existingByExtId = new Map<string, { status: string | null; completedAt: Date | null }>();
  for (const e of existingRows) existingByExtId.set(e.externalId, { status: e.status, completedAt: e.completedAt as Date | null });

  for (const r of rows) {
    const wasDone = isDoneStatus(existingByExtId.get(r.externalId)?.status ?? null);
    const isNowDone = isDoneStatus(r.status);
    const priorCompletedAt = existingByExtId.get(r.externalId)?.completedAt ?? null;
    // First-seen-as-done OR transition from open → done: stamp now.
    // Stay-done: preserve prior completedAt (don't reset on every poll).
    // Done → open: clear (rare but possible if a user reverts a status).
    let nextCompletedAt: Date | null;
    if (isNowDone && !wasDone) nextCompletedAt = new Date();
    else if (isNowDone && wasDone) nextCompletedAt = priorCompletedAt ?? new Date();
    else nextCompletedAt = null;

    await db.insert(externalTasks).values({
      userId,
      source: r.source,
      sourceConfigId: r.sourceConfigId,
      externalId: r.externalId,
      externalUrl: r.externalUrl,
      title: r.title,
      description: r.description,
      status: r.status,
      priority: r.priority,
      due: r.due,
      startDate: r.startDate,
      assignee: r.assignee,
      projectLabel: r.projectLabel,
      parentExternalId: r.parentExternalId,
      raw: r.raw,
      removedAt: null,
      completedAt: nextCompletedAt,
    }).onDuplicateKeyUpdate({
      set: {
        sourceConfigId: r.sourceConfigId,
        externalUrl: r.externalUrl,
        title: r.title,
        description: r.description,
        status: r.status,
        priority: r.priority,
        due: r.due,
        startDate: r.startDate,
        assignee: r.assignee,
        projectLabel: r.projectLabel,
        parentExternalId: r.parentExternalId,
        raw: r.raw,
        removedAt: null,
        completedAt: nextCompletedAt,
      },
    });
  }

  // Mark vanished rows: anything owned by this sourceConfigId we have locally
  // but didn't see in this pull. Only stamp removedAt if it isn't already set
  // (preserves the original removal time so tombstoning fires at the right moment).
  const existing = await db.select({ id: externalTasks.id, externalId: externalTasks.externalId, removedAt: externalTasks.removedAt })
    .from(externalTasks)
    .where(and(
      eq(externalTasks.userId, userId),
      eq(externalTasks.source, source),
      eq(externalTasks.sourceConfigId, sourceConfigId),
    ));

  let vanished = 0;
  for (const row of existing) {
    if (seenIds.has(row.externalId)) continue;
    if (row.removedAt) continue;
    await db.update(externalTasks)
      .set({ removedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(externalTasks.id, row.id));
    vanished++;
  }

  return { upserted: rows.length, vanished };
}

/**
 * Tombstone reaper. Any override whose underlying external_task has been
 * removedAt for more than TOMBSTONE_GRACE_HOURS gets tombstoned (kept,
 * flagged) so the user's personal note never disappears silently.
 */
async function reapTombstones(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<number> {
  // Match overrides to removed-tasks by (userId, source, externalId).
  const cutoff = new Date(Date.now() - TOMBSTONE_GRACE_HOURS * 60 * 60 * 1000);

  const stale = await db.select({
    overrideId: externalTaskOverrides.id,
  })
    .from(externalTaskOverrides)
    .innerJoin(externalTasks, and(
      eq(externalTasks.userId, externalTaskOverrides.userId),
      eq(externalTasks.source, externalTaskOverrides.source),
      eq(externalTasks.externalId, externalTaskOverrides.externalId),
    ))
    .where(and(
      eq(externalTaskOverrides.tombstoned, 0),
      lt(externalTasks.removedAt, cutoff),
    ));

  for (const s of stale) {
    await db.update(externalTaskOverrides)
      .set({ tombstoned: 1, tombstonedAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(externalTaskOverrides.id, s.overrideId));
  }
  return stale.length;
}

async function pullOneSmartsheet(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  cfg: SmartsheetWatchedSheet,
): Promise<void> {
  const cred = await getCredFor(db, cfg.userId, 'smartsheet');
  if (!cred) {
    await db.update(smartsheetWatchedSheets)
      .set({ lastError: 'No Smartsheet API token configured for this user', lastPulledAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(smartsheetWatchedSheets.id, cfg.id));
    return;
  }
  try {
    const rows = await pullSmartsheet(cfg, cred);
    await upsertResults(db, cfg.userId, 'smartsheet', cfg.id, rows);
    await db.update(smartsheetWatchedSheets)
      .set({ lastPulledAt: sql`CURRENT_TIMESTAMP`, lastError: null })
      .where(eq(smartsheetWatchedSheets.id, cfg.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ext-cron] smartsheet sheet ${cfg.sheetId} (user ${cfg.userId}) failed:`, msg);
    await db.update(smartsheetWatchedSheets)
      .set({ lastError: msg.slice(0, 4000), lastPulledAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(smartsheetWatchedSheets.id, cfg.id));
  }
}

async function pullOneNifty(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  cfg: NiftyWatchedProject,
): Promise<void> {
  const cred = await getCredFor(db, cfg.userId, 'nifty');
  if (!cred) {
    await db.update(niftyWatchedProjects)
      .set({ lastError: 'No Nifty API token configured for this user', lastPulledAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(niftyWatchedProjects.id, cfg.id));
    return;
  }
  try {
    const rows = await pullNiftyProject(cfg, cred);
    await upsertResults(db, cfg.userId, 'nifty', cfg.id, rows);
    await db.update(niftyWatchedProjects)
      .set({ lastPulledAt: sql`CURRENT_TIMESTAMP`, lastError: null })
      .where(eq(niftyWatchedProjects.id, cfg.id));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ext-cron] nifty project ${cfg.projectId} (user ${cfg.userId}) failed:`, msg);
    await db.update(niftyWatchedProjects)
      .set({ lastError: msg.slice(0, 4000), lastPulledAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(niftyWatchedProjects.id, cfg.id));
  }
}

/**
 * One full pass. Called by the hourly tick and exposed for manual runs
 * (e.g. POST /api/scheduled/run-external-tasks or "Refresh now" buttons).
 */
export async function processExternalTaskPull(opts?: { userId?: number }): Promise<{
  sheetsProcessed: number;
  projectsProcessed: number;
  tombstoned: number;
}> {
  const db = await getDb();
  if (!db) return { sheetsProcessed: 0, projectsProcessed: 0, tombstoned: 0 };

  const sheetWhere = opts?.userId
    ? and(eq(smartsheetWatchedSheets.enabled, 1), eq(smartsheetWatchedSheets.userId, opts.userId))
    : eq(smartsheetWatchedSheets.enabled, 1);
  const sheets = await db.select().from(smartsheetWatchedSheets).where(sheetWhere);

  const projectWhere = opts?.userId
    ? and(eq(niftyWatchedProjects.enabled, 1), eq(niftyWatchedProjects.userId, opts.userId))
    : eq(niftyWatchedProjects.enabled, 1);
  const projects = await db.select().from(niftyWatchedProjects).where(projectWhere);

  for (const s of sheets) await pullOneSmartsheet(db, s);
  for (const p of projects) await pullOneNifty(db, p);

  const tombstoned = await reapTombstones(db);

  const stats = {
    sheetsProcessed: sheets.length,
    projectsProcessed: projects.length,
    tombstoned,
  };

  try {
    await insertScheduledTaskLog({
      taskName: 'external_tasks_pull',
      emailsSent: 0,
      // No native "details" column on scheduled_task_log; the schema only has
      // taskName / ranAt / durationMs / emailsSent / ownerNotified / error.
      // We log the counts to the server log instead and leave error null on success.
      error: null,
    });
  } catch { /* logging is best-effort */ }
  console.log(`[ext-cron] pass complete:`, stats);

  return stats;
}

let _cronStarted = false;

/**
 * Start the hourly puller. Idempotent — safe to call once at boot.
 * Initial run after 60s (let migrations + listeners settle), then every hour.
 */
export function startExternalTasksCron(): void {
  if (_cronStarted) return;
  _cronStarted = true;
  const HOUR_MS = 60 * 60 * 1000;
  setTimeout(() => {
    processExternalTaskPull().catch(err => console.error('[ext-cron] initial run failed:', err));
    setInterval(() => {
      processExternalTaskPull().catch(err => console.error('[ext-cron] tick failed:', err));
    }, HOUR_MS);
  }, 60_000);
  console.log('[ext-cron] external-tasks cron registered — first run in 60s, then hourly');
}
