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
  userAppData,
  type SmartsheetWatchedSheet,
  type NiftyWatchedProject,
  type ExternalSourceCredential,
} from "../../drizzle/schema";
import { pullSmartsheet, type ExternalTaskInput, type OpportunityInput } from "./smartsheetAdapter";
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
  opts: { skipNewCompletions?: boolean } = {},
): Promise<{ upserted: number; vanished: number; skipped: number }> {
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

  let skipped = 0;
  for (const r of rows) {
    const wasDone = isDoneStatus(existingByExtId.get(r.externalId)?.status ?? null);
    const isNowDone = isDoneStatus(r.status);
    // Skip historical completions: when a Nifty (or any source with this flag
    // on) task arrives done and we've never tracked it, treat it as noise.
    // Tasks we already track keep syncing their status normally.
    if (opts.skipNewCompletions && isNowDone && !existingByExtId.has(r.externalId)) {
      seenIds.delete(r.externalId);
      skipped++;
      continue;
    }
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

  return { upserted: rows.length - skipped, vanished, skipped };
}

/**
 * Auto-create LevelUp projects from a list of project labels seen in a
 * hierarchical Smartsheet pull. Reads the user_app_data.projects JSON blob,
 * appends any missing projects (case-insensitive name match), and writes
 * back. Returns a Map of label → projectId so the caller can link each
 * external task to its newly-created (or existing) project.
 *
 * Project defaults match what the client uses for new projects: blue accent,
 * folder icon, Active status, 0% complete, sortOrder appended at the end.
 *
 * Safe to call repeatedly — only persists when at least one new project was
 * appended.
 */
/**
 * Merge a pull's Opportunities into user_app_data.opportunities. Matches
 * existing rows by (source='smartsheet', sourceConfigId, externalId) so
 * re-syncs update rather than duplicate. Preserves user-set fields like
 * notes + linkedTaskIds when the source row doesn't carry them.
 */
async function upsertOpportunitiesForUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  sourceConfigId: number,
  pulled: OpportunityInput[],
): Promise<{ created: number; updated: number }> {
  const row = await db.select({ opportunities: userAppData.opportunities }).from(userAppData)
    .where(eq(userAppData.userId, userId)).limit(1);
  let opps: Array<Record<string, unknown>> = [];
  if (row[0]?.opportunities) {
    try { opps = JSON.parse(row[0].opportunities) || []; } catch { opps = []; }
    if (!Array.isArray(opps)) opps = [];
  }
  // Index existing by externalId (for this source config) so we can update in place.
  const idxByExt = new Map<string, number>();
  opps.forEach((o, i) => {
    if (o && o.source === 'smartsheet' && String(o.sourceConfigId) === String(sourceConfigId) && o.externalId) {
      idxByExt.set(String(o.externalId), i);
    }
  });

  // Derive {status, wonAt, lostAt} from the standard stage name so terminal-
  // stage rows correctly count as won/lost rather than open. The client's
  // stage button does the same flip — keeping these in sync means a row
  // synced as "Closed Won" lands as status='won' on the first pull.
  const deriveStatus = (stage: string | null | undefined) => {
    const s = (stage || '').toLowerCase();
    if (s === 'closed won') return { status: 'won' as const, wonAt: new Date().toISOString(), lostAt: undefined };
    if (s === 'closed lost') return { status: 'lost' as const, wonAt: undefined, lostAt: new Date().toISOString() };
    return { status: 'open' as const, wonAt: undefined, lostAt: undefined };
  };

  let created = 0, updated = 0;
  const nowISO = new Date().toISOString();
  for (const p of pulled) {
    const existingIdx = idxByExt.get(String(p.externalId));
    if (existingIdx != null) {
      const ex = opps[existingIdx];
      // Only re-derive status when the incoming stage actually changed; this
      // preserves a user who manually flipped status without changing stage.
      const stageChanged = p.stage && p.stage !== ex.stage;
      const status = stageChanged ? deriveStatus(p.stage) : { status: ex.status, wonAt: ex.wonAt, lostAt: ex.lostAt };
      opps[existingIdx] = {
        ...ex,
        name: p.name || ex.name,
        accountName: p.accountName ?? ex.accountName ?? '',
        stage: p.stage ?? ex.stage ?? 'Lead',
        value: p.value ?? ex.value ?? 0,
        probability: p.probability ?? ex.probability ?? null,
        closeDate: p.closeDate ?? ex.closeDate ?? '',
        owner: p.owner ?? ex.owner ?? '',
        contact: p.contact ?? ex.contact ?? '',
        notes: p.notes ?? ex.notes ?? '',
        externalUrl: p.externalUrl ?? ex.externalUrl ?? null,
        status: status.status,
        wonAt: status.wonAt,
        lostAt: status.lostAt,
        updatedAt: nowISO,
      };
      updated++;
    } else {
      const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000) + created;
      const status = deriveStatus(p.stage);
      opps.push({
        id: newId,
        name: p.name,
        accountName: p.accountName || '',
        stage: p.stage || 'Lead',
        value: p.value || 0,
        probability: p.probability,
        closeDate: p.closeDate || '',
        owner: p.owner || '',
        contact: p.contact || '',
        notes: p.notes || '',
        status: status.status,
        wonAt: status.wonAt,
        lostAt: status.lostAt,
        linkedTaskIds: [],
        source: 'smartsheet',
        sourceConfigId,
        externalId: p.externalId,
        externalUrl: p.externalUrl,
        createdAt: nowISO,
        updatedAt: nowISO,
      });
      created++;
    }
  }

  if (created || updated) {
    await db.insert(userAppData).values({
      userId,
      opportunities: JSON.stringify(opps),
    }).onDuplicateKeyUpdate({ set: { opportunities: JSON.stringify(opps) } });
  }
  return { created, updated };
}

async function ensureLevelUpProjectsForLabels(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  labels: string[],
  defaults: { color: string; icon: string },
  /** Provenance recorded on the project record so the UI can show a
   *  "↻ Resync this sheet" button. */
  provenance: { source: 'smartsheet' | 'nifty'; sheetId?: string; sheetName?: string; sourceConfigId?: number },
  /** Program-name match (case-insensitive). When set, newly-appended projects
   *  also get their id pushed into that program's projectIds[]. */
  programName: string | null,
): Promise<{ map: Map<string, string>; appended: number; linkedToProgram: number }> {
  const cleanLabels = Array.from(new Set(labels.map(s => (s || '').trim()).filter(Boolean)));
  if (!cleanLabels.length) return { map: new Map(), appended: 0, linkedToProgram: 0 };

  // Read both blobs in one query — we need projects (always) and programs
  // (only when programName is set, but it's cheap to read either way).
  const rows = await db.select({
    projects: userAppData.projects,
    programs: userAppData.programs,
  }).from(userAppData).where(eq(userAppData.userId, userId)).limit(1);

  let projects: Array<{ id: number | string; name: string; [k: string]: unknown }> = [];
  if (rows[0]?.projects) {
    try { projects = JSON.parse(rows[0].projects) || []; } catch { projects = []; }
    if (!Array.isArray(projects)) projects = [];
  }
  let programs: Array<{ id: number | string; name: string; projectIds?: Array<number | string>; [k: string]: unknown }> = [];
  if (rows[0]?.programs) {
    try { programs = JSON.parse(rows[0].programs) || []; } catch { programs = []; }
    if (!Array.isArray(programs)) programs = [];
  }

  const byNameLower = new Map<string, { id: number | string; name: string }>();
  for (const p of projects) {
    if (p && typeof p.name === 'string') byNameLower.set(p.name.toLowerCase(), p);
  }

  const labelToId = new Map<string, string>();
  const newlyAppendedIds: Array<number | string> = [];
  let appended = 0;
  let nextSort = projects.reduce((max, p) => {
    const n = Number((p as { sortOrder?: unknown }).sortOrder);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0) + 1;

  for (const label of cleanLabels) {
    const existing = byNameLower.get(label.toLowerCase());
    if (existing) {
      labelToId.set(label, String(existing.id));
      continue;
    }
    const newId = Date.now() * 1000 + Math.floor(Math.random() * 1000) + appended;
    const newProj = {
      id: newId,
      name: label,
      color: defaults.color,
      icon: defaults.icon,
      status: 'Active',
      pct: 0,
      pctManual: false,
      due: null,
      owner: '',
      desc: '',
      milestones: [],
      sortOrder: nextSort++,
      createdAt: new Date().toISOString(),
      // Tag + provenance — so the UI can show "Pulled from <sheet>" and
      // offer a targeted resync button.
      autoCreatedBy: provenance.source === 'smartsheet' ? 'smartsheet-sync' : 'nifty-sync',
      autoSyncSource: {
        source: provenance.source,
        sheetId: provenance.sheetId ?? null,
        sheetName: provenance.sheetName ?? null,
        sourceConfigId: provenance.sourceConfigId ?? null,
      },
    };
    projects.push(newProj);
    byNameLower.set(label.toLowerCase(), newProj);
    labelToId.set(label, String(newId));
    newlyAppendedIds.push(newId);
    appended++;
  }

  // Auto-link newly-appended projects to a parent program (by case-insensitive
  // name match). Existing projects already in the program aren't re-added.
  // Skips silently if no matching program is found — the user might not have
  // created a CommunityForce / LSI Media program yet.
  let linkedToProgram = 0;
  if (programName && newlyAppendedIds.length) {
    const wantedLower = programName.trim().toLowerCase();
    const prog = programs.find(p => typeof p.name === 'string' && p.name.toLowerCase() === wantedLower);
    if (prog) {
      const have = new Set((prog.projectIds || []).map(x => String(x)));
      const before = have.size;
      for (const id of newlyAppendedIds) {
        if (!have.has(String(id))) {
          (prog.projectIds = prog.projectIds || []).push(id);
          have.add(String(id));
        }
      }
      linkedToProgram = have.size - before;
    }
  }

  if (appended > 0) {
    await db.insert(userAppData).values({
      userId,
      projects: JSON.stringify(projects),
      programs: JSON.stringify(programs),
    }).onDuplicateKeyUpdate({
      set: {
        projects: JSON.stringify(projects),
        // Only write programs back when we touched it — saves an unnecessary
        // round-trip otherwise (programs blob can be sizeable).
        ...(linkedToProgram > 0 ? { programs: JSON.stringify(programs) } : {}),
      },
    });
    console.log(`[ext-cron] auto-created ${appended} LevelUp project(s) for user ${userId}${linkedToProgram ? ` (linked ${linkedToProgram} to "${programName}" program)` : ''}`);
  }

  return { map: labelToId, appended, linkedToProgram };
}

/**
 * Force-overwrite override.localProjectId for every row in `rows` based on
 * the label → projectId map (from ensureLevelUpProjectsForLabels). Used when
 * the sheet is hierarchical and the user wants every row re-classified per
 * the new Project column.
 *
 * Differs from ensureDefaultProjectLinks below: that helper preserves a
 * user's existing pick via COALESCE; this helper overwrites it. The user
 * explicitly requested overwrite behaviour for the hierarchical-sync feature.
 */
async function overwriteProjectLinks(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  source: 'smartsheet' | 'nifty',
  rows: Array<{ externalId: string; projectLabel: string | null }>,
  labelToId: Map<string, string>,
): Promise<number> {
  let touched = 0;
  for (const r of rows) {
    const label = (r.projectLabel || '').trim();
    if (!label) continue;
    const pid = labelToId.get(label);
    if (!pid) continue;
    await db.insert(externalTaskOverrides).values({
      userId,
      source,
      externalId: r.externalId,
      myDay: 0,
      localProjectId: pid,
    }).onDuplicateKeyUpdate({
      set: { localProjectId: pid },
    });
    touched++;
  }
  return touched;
}

/**
 * For a watch with defaultProjectId set, ensure every pulled task's override
 * row has localProjectId set to that project. Skips rows where the user has
 * already manually picked a different project (preserves explicit choices).
 * Rows with no override at all get one created.
 */
async function ensureDefaultProjectLinks(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  source: 'smartsheet' | 'nifty',
  externalIds: string[],
  projectId: string,
): Promise<void> {
  if (!externalIds.length || !projectId) return;
  for (const externalId of externalIds) {
    // Upsert: if override exists and already has a localProjectId, leave it.
    // The ON DUPLICATE KEY UPDATE only writes when localProjectId is NULL —
    // mysql's COALESCE handles that cleanly.
    await db.insert(externalTaskOverrides).values({
      userId,
      source,
      externalId,
      myDay: 0,
      localProjectId: projectId,
    }).onDuplicateKeyUpdate({
      set: {
        // Preserve user's explicit pick; only fill when empty.
        localProjectId: sql`COALESCE(${externalTaskOverrides.localProjectId}, ${projectId})`,
      },
    });
  }
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
): Promise<{ projectsCreated: number }> {
  const cred = await getCredFor(db, cfg.userId, 'smartsheet');
  if (!cred) {
    await db.update(smartsheetWatchedSheets)
      .set({ lastError: 'No Smartsheet API token configured for this user', lastPulledAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(smartsheetWatchedSheets.id, cfg.id));
    return { projectsCreated: 0 };
  }
  try {
    const result = await pullSmartsheet(cfg, cred);
    const sheetName = cfg.label || cfg.sheetId;

    // ─── Pipeline shape: write to D.opportunities, skip external_tasks ─────
    if (result.pipeline) {
      // If this sheet was previously mis-pulled as external tasks (the
      // detection logic missed it on first sync), clean those rows up here
      // — they're not real tasks. Override rows are kept; they'll naturally
      // tombstone on the standard reaper schedule.
      const orphans = await db.delete(externalTasks).where(and(
        eq(externalTasks.userId, cfg.userId),
        eq(externalTasks.source, 'smartsheet'),
        eq(externalTasks.sourceConfigId, cfg.id),
      ));
      const upserted = await upsertOpportunitiesForUser(db, cfg.userId, cfg.id, result.opportunities);
      console.log(`[ext-cron] sheet ${cfg.sheetId}: pipeline mode — ${result.opportunities.length} row(s), ${upserted.created} new opps, ${upserted.updated} updated${orphans ? ' · cleaned up stale external_tasks' : ''}`);
      await db.update(smartsheetWatchedSheets)
        .set({ lastPulledAt: sql`CURRENT_TIMESTAMP`, lastError: null })
        .where(eq(smartsheetWatchedSheets.id, cfg.id));
      return { projectsCreated: 0 };
    }

    await upsertResults(db, cfg.userId, 'smartsheet', cfg.id, result.rows);

    let projectsCreated = 0;
    if (result.hierarchical) {
      // Hierarchical sheet: auto-create a LevelUp project for each project
      // label seen, then overwrite override.localProjectId for every row to
      // match. This honours the "overwrite existing CF/LSI synced data"
      // requirement — even rows that previously linked to cfg.defaultProjectId
      // get re-pointed to their proper Project-column project.
      const { map: labelToId, appended } = await ensureLevelUpProjectsForLabels(
        db,
        cfg.userId,
        result.projectLabels,
        // Blue accent + folder icon for CF (Smartsheet/CommunityForce).
        { color: '#1f6feb', icon: '📊' },
        // Provenance — surfaces in the project drawer as "↻ Resync this sheet".
        { source: 'smartsheet', sheetId: cfg.sheetId, sheetName, sourceConfigId: cfg.id },
        // Auto-link newly-created projects under the CommunityForce program
        // so the Portfolio view groups them correctly.
        'CommunityForce',
      );
      projectsCreated = appended;
      const touched = await overwriteProjectLinks(
        db,
        cfg.userId,
        'smartsheet',
        result.rows.map(r => ({ externalId: r.externalId, projectLabel: r.projectLabel })),
        labelToId,
      );
      console.log(`[ext-cron] sheet ${cfg.sheetId}: hierarchical mode — ${result.projectLabels.length} project label(s), ${appended} new, ${touched} row(s) re-linked`);
    } else if (cfg.defaultProjectId) {
      // Flat sheet: legacy behaviour — link rows to the watch's default
      // project, but only when no explicit pick exists.
      await ensureDefaultProjectLinks(db, cfg.userId, 'smartsheet', result.rows.map(r => r.externalId), cfg.defaultProjectId);
    }
    await db.update(smartsheetWatchedSheets)
      .set({ lastPulledAt: sql`CURRENT_TIMESTAMP`, lastError: null })
      .where(eq(smartsheetWatchedSheets.id, cfg.id));
    return { projectsCreated };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[ext-cron] smartsheet sheet ${cfg.sheetId} (user ${cfg.userId}) failed:`, msg);
    await db.update(smartsheetWatchedSheets)
      .set({ lastError: msg.slice(0, 4000), lastPulledAt: sql`CURRENT_TIMESTAMP` })
      .where(eq(smartsheetWatchedSheets.id, cfg.id));
    return { projectsCreated: 0 };
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
    // Skip historical Nifty completions — Nifty returns thousands of
    // long-closed tasks via completed=true and they clutter LevelUp. Only
    // tasks we already track keep getting status updates.
    await upsertResults(db, cfg.userId, 'nifty', cfg.id, rows, { skipNewCompletions: true });
    if (cfg.defaultProjectId) await ensureDefaultProjectLinks(db, cfg.userId, 'nifty', rows.map(r => r.externalId), cfg.defaultProjectId);
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
/**
 * Pull one specific source-config (one Smartsheet sheet OR one Nifty project)
 * for one user. Exposed for the project drawer's "↻ Resync source" button so
 * a single sheet can be refreshed without traversing every watched config.
 * Returns the same stats shape as processExternalTaskPull for client parity.
 */
export async function pullOneSource(opts: {
  userId: number;
  source: 'smartsheet' | 'nifty';
  sourceConfigId: number;
}): Promise<{
  sheetsProcessed: number;
  projectsProcessed: number;
  tombstoned: number;
  projectsCreated: number;
}> {
  const db = await getDb();
  if (!db) return { sheetsProcessed: 0, projectsProcessed: 0, tombstoned: 0, projectsCreated: 0 };

  let projectsCreated = 0;
  let sheetsProcessed = 0;
  let projectsProcessed = 0;

  if (opts.source === 'smartsheet') {
    const rows = await db.select().from(smartsheetWatchedSheets)
      .where(and(
        eq(smartsheetWatchedSheets.userId, opts.userId),
        eq(smartsheetWatchedSheets.id, opts.sourceConfigId),
        eq(smartsheetWatchedSheets.enabled, 1),
      ))
      .limit(1);
    if (rows[0]) {
      const r = await pullOneSmartsheet(db, rows[0]);
      projectsCreated += r.projectsCreated;
      sheetsProcessed = 1;
    }
  } else {
    const rows = await db.select().from(niftyWatchedProjects)
      .where(and(
        eq(niftyWatchedProjects.userId, opts.userId),
        eq(niftyWatchedProjects.id, opts.sourceConfigId),
        eq(niftyWatchedProjects.enabled, 1),
      ))
      .limit(1);
    if (rows[0]) {
      await pullOneNifty(db, rows[0]);
      projectsProcessed = 1;
    }
  }

  const tombstoned = await reapTombstones(db);
  return { sheetsProcessed, projectsProcessed, tombstoned, projectsCreated };
}

export async function processExternalTaskPull(opts?: { userId?: number }): Promise<{
  sheetsProcessed: number;
  projectsProcessed: number;
  tombstoned: number;
  /** Total LevelUp projects auto-created from Smartsheet Project columns. Used
   *  by the client to know it needs to reload D.projects after the sync. */
  projectsCreated: number;
}> {
  const db = await getDb();
  if (!db) return { sheetsProcessed: 0, projectsProcessed: 0, tombstoned: 0, projectsCreated: 0 };

  const sheetWhere = opts?.userId
    ? and(eq(smartsheetWatchedSheets.enabled, 1), eq(smartsheetWatchedSheets.userId, opts.userId))
    : eq(smartsheetWatchedSheets.enabled, 1);
  const sheets = await db.select().from(smartsheetWatchedSheets).where(sheetWhere);

  const projectWhere = opts?.userId
    ? and(eq(niftyWatchedProjects.enabled, 1), eq(niftyWatchedProjects.userId, opts.userId))
    : eq(niftyWatchedProjects.enabled, 1);
  const projects = await db.select().from(niftyWatchedProjects).where(projectWhere);

  let projectsCreated = 0;
  for (const s of sheets) {
    const r = await pullOneSmartsheet(db, s);
    projectsCreated += r.projectsCreated;
  }
  for (const p of projects) await pullOneNifty(db, p);

  const tombstoned = await reapTombstones(db);

  const stats = {
    sheetsProcessed: sheets.length,
    projectsProcessed: projects.length,
    tombstoned,
    projectsCreated,
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
