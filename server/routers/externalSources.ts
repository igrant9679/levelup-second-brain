/**
 * External Sources Router — Smartsheet + Nifty.
 *
 * Settings CRUD + manual refresh + list endpoints. The hourly cron in
 * externalTasksCron.ts does the same pull on a schedule.
 *
 * Procedures:
 *   externalSources.status                — connection status per source
 *   externalSources.setToken              — store API token, capture account identity
 *   externalSources.disconnect            — delete token + watched configs for a source
 *   externalSources.listSmartsheetSheets  — fetch user's accessible sheets (for picker)
 *   externalSources.fetchSheetColumns     — fetch column list (for owner-column picker)
 *   externalSources.addSmartsheetWatch    — add a watched sheet
 *   externalSources.updateSmartsheetWatch — edit a watched sheet
 *   externalSources.removeSmartsheetWatch — remove a watched sheet
 *   externalSources.listSmartsheetWatches — list watches with last-pull info
 *   externalSources.listNiftyProjects     — fetch user's projects (for picker)
 *   externalSources.addNiftyWatch         — add a watched project
 *   externalSources.removeNiftyWatch      — remove a watched project
 *   externalSources.listNiftyWatches      — list watches with last-pull info
 *   externalSources.refreshNow            — manual pull (all sources for current user)
 *   externalSources.listExternalTasks     — read endpoint for the client UI
 *   externalSources.upsertOverride        — set My Day / local note / etc. on an external task
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  externalSourceCredentials,
  externalTasks,
  externalTaskOverrides,
  niftyWatchedProjects,
  smartsheetWatchedSheets,
} from "../../drizzle/schema";
import { fetchSmartsheetMe } from "../_core/smartsheetAdapter";
import { fetchNiftyMe } from "../_core/niftyAdapter";
import { processExternalTaskPull, pullOneSource } from "../_core/externalTasksCron";

const SS_API = "https://api.smartsheet.com/2.0";
const NIFTY_API = "https://openapi.niftypm.com/api/v1.0";

const sourceEnum = z.enum(['smartsheet', 'nifty']);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  return db;
}

// ─── Write-back internals (shared by setRowStatus mutations + pushPendingChanges)
async function pushSmartsheetStatusInternal(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  externalId: string,
  newStatus: string,
): Promise<void> {
  const [cred] = await db.select().from(externalSourceCredentials)
    .where(and(eq(externalSourceCredentials.userId, userId), eq(externalSourceCredentials.source, 'smartsheet')))
    .limit(1);
  if (!cred?.apiToken) throw new Error('No Smartsheet token configured');
  const [taskRow] = await db.select().from(externalTasks)
    .where(and(eq(externalTasks.userId, userId), eq(externalTasks.source, 'smartsheet'), eq(externalTasks.externalId, externalId)))
    .limit(1);
  if (!taskRow) throw new Error(`External task ${externalId} not found locally`);
  const [watch] = await db.select().from(smartsheetWatchedSheets)
    .where(eq(smartsheetWatchedSheets.id, taskRow.sourceConfigId)).limit(1);
  if (!watch) throw new Error('Source watch config missing');
  if (!watch.statusColumn) throw new Error('Watch has no statusColumn configured — set it in Settings → Integrations');
  const colsResp = await fetch(`https://api.smartsheet.com/2.0/sheets/${watch.sheetId}/columns?includeAll=true`, {
    headers: { Authorization: `Bearer ${cred.apiToken}` },
  });
  if (!colsResp.ok) throw new Error(`Smartsheet columns fetch failed: ${colsResp.status}`);
  const colsData = await colsResp.json() as { data?: Array<{ id: number; title: string }> };
  const col = (colsData.data || []).find(c => c.title.toLowerCase() === String(watch.statusColumn).toLowerCase());
  if (!col) throw new Error(`Status column "${watch.statusColumn}" not found on sheet`);
  const putResp = await fetch(`https://api.smartsheet.com/2.0/sheets/${watch.sheetId}/rows`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cred.apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ id: Number(externalId), cells: [{ columnId: col.id, value: newStatus }] }]),
  });
  if (!putResp.ok) {
    const body = await putResp.text();
    throw new Error(`Smartsheet update failed: ${putResp.status} ${body.slice(0, 200)}`);
  }
}

async function pushNiftyStatusInternal(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  externalId: string,
  statusName: string,
): Promise<void> {
  const [cred] = await db.select().from(externalSourceCredentials)
    .where(and(eq(externalSourceCredentials.userId, userId), eq(externalSourceCredentials.source, 'nifty')))
    .limit(1);
  if (!cred?.apiToken) throw new Error('No Nifty token configured');
  const taskResp = await fetch(`https://openapi.niftypm.com/api/v1.0/tasks/${externalId}`, {
    headers: { Authorization: `Bearer ${cred.apiToken}`, Accept: 'application/json' },
  });
  if (!taskResp.ok) throw new Error(`Nifty task fetch failed: ${taskResp.status}`);
  const task = await taskResp.json() as { id: string; project_id?: string };
  if (!task.project_id) throw new Error('Nifty task has no project_id');
  const stResp = await fetch(`https://openapi.niftypm.com/api/v1.0/projects/${task.project_id}/statuses`, {
    headers: { Authorization: `Bearer ${cred.apiToken}`, Accept: 'application/json' },
  });
  if (!stResp.ok) throw new Error(`Nifty statuses fetch failed: ${stResp.status}`);
  const stData = await stResp.json() as Array<{ id: string; name: string }> | { statuses?: Array<{ id: string; name: string }> };
  const statuses = Array.isArray(stData) ? stData : (stData.statuses || []);
  const match = statuses.find(s => (s.name || '').toLowerCase() === statusName.toLowerCase());
  if (!match) throw new Error(`Status "${statusName}" not found on Nifty project`);
  const putResp = await fetch(`https://openapi.niftypm.com/api/v1.0/tasks/${externalId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${cred.apiToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: match.id }),
  });
  if (!putResp.ok) {
    const body = await putResp.text();
    throw new Error(`Nifty update failed: ${putResp.status} ${body.slice(0, 200)}`);
  }
}

export const externalSourcesRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const creds = await db.select().from(externalSourceCredentials)
      .where(eq(externalSourceCredentials.userId, ctx.user.id));
    const summary: Record<string, { connected: boolean; oauthAppConfigured?: boolean; accountEmail: string | null; accountDisplayName: string | null; watchCount: number }> = {
      smartsheet: { connected: false, accountEmail: null, accountDisplayName: null, watchCount: 0 },
      nifty: { connected: false, oauthAppConfigured: false, accountEmail: null, accountDisplayName: null, watchCount: 0 },
    };
    for (const c of creds) {
      if (c.source === 'smartsheet') {
        summary.smartsheet = {
          connected: !!c.apiToken,
          accountEmail: c.accountEmail,
          accountDisplayName: c.accountDisplayName,
          watchCount: 0,
        };
      } else if (c.source === 'nifty') {
        // Nifty has two states: clientId/Secret saved (oauthAppConfigured) and
        // OAuth consent completed (connected = apiToken present).
        summary.nifty = {
          connected: !!c.apiToken,
          oauthAppConfigured: !!c.clientId,
          accountEmail: c.accountEmail,
          accountDisplayName: c.accountDisplayName,
          watchCount: 0,
        };
      }
    }
    const ss = await db.select().from(smartsheetWatchedSheets).where(eq(smartsheetWatchedSheets.userId, ctx.user.id));
    summary.smartsheet.watchCount = ss.length;
    const nf = await db.select().from(niftyWatchedProjects).where(eq(niftyWatchedProjects.userId, ctx.user.id));
    summary.nifty.watchCount = nf.length;
    return summary;
  }),

  /**
   * Store an API token for a source. Verifies by calling /users/me on the
   * provider and stores the returned account identity. Replaces any
   * existing token for this (user, source).
   */
  setToken: protectedProcedure
    .input(z.object({ source: sourceEnum, apiToken: z.string().min(10).max(2000) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      if (input.source === 'nifty') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Nifty uses OAuth — paste Client ID + Secret via saveNiftyOAuthApp, then click Connect.' });
      }
      let identity: { id: string | number; email: string; name: string };
      try {
        if (input.source === 'smartsheet') {
          const me = await fetchSmartsheetMe(input.apiToken);
          identity = { id: me.id, email: me.email, name: me.name };
        } else {
          const me = await fetchNiftyMe(input.apiToken);
          identity = { id: me.id, email: me.email, name: me.name };
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Token verification failed: ${msg}` });
      }

      await db.insert(externalSourceCredentials).values({
        userId: ctx.user.id,
        source: input.source,
        apiToken: input.apiToken,
        accountEmail: identity.email,
        accountDisplayName: identity.name,
        accountExternalId: String(identity.id),
      }).onDuplicateKeyUpdate({
        set: {
          apiToken: input.apiToken,
          accountEmail: identity.email,
          accountDisplayName: identity.name,
          accountExternalId: String(identity.id),
        },
      });
      return { success: true, account: identity };
    }),

  /**
   * Nifty OAuth — save Client ID + Secret (from the user's Nifty Create App
   * page), then call getNiftyAuthUrl to start the consent flow. Token gets
   * stored automatically by the /api/oauth/nifty/callback handler.
   */
  saveNiftyOAuthApp: protectedProcedure
    .input(z.object({
      clientId: z.string().min(8).max(255),
      clientSecret: z.string().min(8).max(2000),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Insert/update without touching apiToken / refreshToken / expiresAt —
      // those land later via the OAuth callback.
      await db.insert(externalSourceCredentials).values({
        userId: ctx.user.id,
        source: 'nifty',
        apiToken: null,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
      }).onDuplicateKeyUpdate({
        set: { clientId: input.clientId, clientSecret: input.clientSecret },
      });
      return { success: true };
    }),

  /**
   * Build the Nifty consent URL using the saved Client ID. State encodes
   * userId + origin so the callback can attribute the returned code.
   */
  getNiftyAuthUrl: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const [cred] = await db.select().from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'nifty')))
        .limit(1);
      if (!cred?.clientId) {
        throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Save Client ID + Secret first' });
      }
      const state = Buffer.from(JSON.stringify({ userId: ctx.user.id, origin: input.origin })).toString('base64url');
      const redirectUri = `${input.origin}/api/oauth/nifty/callback`;
      const scope = 'task,project,member,task_group,subtask,milestone,subteam,doc,message,file,label,time_tracking';
      const url = `https://nifty.pm/authorize?response_type=code&client_id=${encodeURIComponent(cred.clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
      return { authUrl: url };
    }),

  disconnect: protectedProcedure
    .input(z.object({ source: sourceEnum }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.delete(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, input.source)));
      // Also remove the watch configs and external tasks for this source.
      if (input.source === 'smartsheet') {
        await db.delete(smartsheetWatchedSheets).where(eq(smartsheetWatchedSheets.userId, ctx.user.id));
      } else {
        await db.delete(niftyWatchedProjects).where(eq(niftyWatchedProjects.userId, ctx.user.id));
      }
      await db.delete(externalTasks)
        .where(and(eq(externalTasks.userId, ctx.user.id), eq(externalTasks.source, input.source)));
      return { success: true };
    }),

  // ── Smartsheet ───────────────────────────────────────────────────────────

  /**
   * List the user's accessible Smartsheet sheets — paginated picker source.
   * Returns just id/name/permalink; sheet contents fetched on watch-add.
   */
  listSmartsheetSheets: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [cred] = await db.select().from(externalSourceCredentials)
      .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'smartsheet')))
      .limit(1);
    if (!cred) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No Smartsheet token configured' });
    const resp = await fetch(`${SS_API}/sheets?includeAll=true`, { headers: { Authorization: `Bearer ${cred.apiToken}` } });
    if (!resp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Smartsheet list failed: ${resp.status}` });
    const data = await resp.json() as { data?: Array<{ id: number; name: string; permalink: string }> };
    return (data.data ?? []).map(s => ({ id: String(s.id), name: s.name, permalink: s.permalink }));
  }),

  /** Fetch a sheet's columns — populates the owner-column dropdown. */
  fetchSheetColumns: protectedProcedure
    .input(z.object({ sheetId: z.string() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const [cred] = await db.select().from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'smartsheet')))
        .limit(1);
      if (!cred) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No Smartsheet token configured' });
      const resp = await fetch(`${SS_API}/sheets/${input.sheetId}/columns?includeAll=true`, { headers: { Authorization: `Bearer ${cred.apiToken}` } });
      if (!resp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Smartsheet columns failed: ${resp.status}` });
      const data = await resp.json() as { data?: Array<{ id: number; title: string; type: string; primary?: boolean }> };
      return (data.data ?? []).map(c => ({ id: String(c.id), title: c.title, type: c.type, primary: !!c.primary }));
    }),

  addSmartsheetWatch: protectedProcedure
    .input(z.object({
      sheetId: z.string(),
      label: z.string().max(128).optional(),
      ownerColumn: z.string().max(64),
      ownerMatchValue: z.string().max(128),
      matchMode: z.enum(['exact', 'contains', 'contact']).default('contains'),
      statusColumn: z.string().max(64).optional(),
      dueColumn: z.string().max(64).optional(),
      excludeDoneStatuses: z.string().max(256).optional(),
      defaultProjectId: z.string().max(40).nullable().optional(),
      // When true and no defaultProjectId supplied, auto-create a LevelUp
      // project named after the sheet (label || sheet name) and link this
      // watch to it. The auto-created project's id is appended to the
      // user_app_data.projects blob client-side on next load.
      mirrorAsProject: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const row = {
        userId: ctx.user.id,
        sheetId: input.sheetId,
        label: input.label ?? null,
        ownerColumn: input.ownerColumn,
        ownerMatchValue: input.ownerMatchValue,
        matchMode: input.matchMode,
        statusColumn: input.statusColumn ?? null,
        dueColumn: input.dueColumn ?? null,
        excludeDoneStatuses: input.excludeDoneStatuses ?? null,
        defaultProjectId: input.defaultProjectId ?? null,
        enabled: 1,
      };
      await db.insert(smartsheetWatchedSheets).values(row).onDuplicateKeyUpdate({
        set: {
          label: row.label,
          ownerColumn: row.ownerColumn,
          ownerMatchValue: row.ownerMatchValue,
          matchMode: row.matchMode,
          statusColumn: row.statusColumn,
          dueColumn: row.dueColumn,
          excludeDoneStatuses: row.excludeDoneStatuses,
          defaultProjectId: row.defaultProjectId,
          enabled: 1,
        },
      });
      // mirrorAsProject is honoured client-side (the projects array lives in
      // a JSON blob the client owns); return a hint so the client can act.
      return { success: true, mirrorAsProject: !!input.mirrorAsProject && !input.defaultProjectId, suggestedName: input.label || null };
    }),

  updateSmartsheetWatch: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      label: z.string().max(128).optional(),
      ownerColumn: z.string().max(64).optional(),
      ownerMatchValue: z.string().max(128).optional(),
      matchMode: z.enum(['exact', 'contains', 'contact']).optional(),
      statusColumn: z.string().max(64).nullable().optional(),
      dueColumn: z.string().max(64).nullable().optional(),
      excludeDoneStatuses: z.string().max(256).nullable().optional(),
      defaultProjectId: z.string().max(40).nullable().optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const set: Record<string, unknown> = {};
      if (input.label !== undefined) set.label = input.label;
      if (input.ownerColumn !== undefined) set.ownerColumn = input.ownerColumn;
      if (input.ownerMatchValue !== undefined) set.ownerMatchValue = input.ownerMatchValue;
      if (input.matchMode !== undefined) set.matchMode = input.matchMode;
      if (input.statusColumn !== undefined) set.statusColumn = input.statusColumn;
      if (input.dueColumn !== undefined) set.dueColumn = input.dueColumn;
      if (input.excludeDoneStatuses !== undefined) set.excludeDoneStatuses = input.excludeDoneStatuses;
      if (input.defaultProjectId !== undefined) set.defaultProjectId = input.defaultProjectId;
      if (input.enabled !== undefined) set.enabled = input.enabled ? 1 : 0;
      await db.update(smartsheetWatchedSheets).set(set)
        .where(and(eq(smartsheetWatchedSheets.id, input.id), eq(smartsheetWatchedSheets.userId, ctx.user.id)));
      return { success: true };
    }),

  removeSmartsheetWatch: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Find the sheetId first so we can also clean up external_tasks owned by this config.
      const [row] = await db.select().from(smartsheetWatchedSheets)
        .where(and(eq(smartsheetWatchedSheets.id, input.id), eq(smartsheetWatchedSheets.userId, ctx.user.id)))
        .limit(1);
      if (!row) return { success: true };
      await db.delete(externalTasks)
        .where(and(eq(externalTasks.userId, ctx.user.id), eq(externalTasks.sourceConfigId, input.id), eq(externalTasks.source, 'smartsheet')));
      await db.delete(smartsheetWatchedSheets)
        .where(and(eq(smartsheetWatchedSheets.id, input.id), eq(smartsheetWatchedSheets.userId, ctx.user.id)));
      return { success: true };
    }),

  listSmartsheetWatches: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(smartsheetWatchedSheets)
      .where(eq(smartsheetWatchedSheets.userId, ctx.user.id))
      .orderBy(desc(smartsheetWatchedSheets.createdAt));
  }),

  // ── Nifty ────────────────────────────────────────────────────────────────

  listNiftyProjects: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [cred] = await db.select().from(externalSourceCredentials)
      .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'nifty')))
      .limit(1);
    if (!cred) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No Nifty credentials configured' });
    if (!cred.apiToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'Nifty connected but not authorized — click Connect to complete OAuth consent' });
    const resp = await fetch(`${NIFTY_API}/projects`, { headers: { Authorization: `Bearer ${cred.apiToken}`, Accept: 'application/json' } });
    if (!resp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Nifty projects failed: ${resp.status}` });
    const data = await resp.json() as Array<{ id: string; name: string; url?: string }> | { projects?: Array<{ id: string; name: string; url?: string }> };
    const list = Array.isArray(data) ? data : (data.projects ?? []);
    return list.map(p => ({ id: p.id, name: p.name, url: p.url ?? null }));
  }),

  addNiftyWatch: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      label: z.string().max(128).optional(),
      filterByAssignee: z.boolean().default(true),
      defaultProjectId: z.string().max(40).nullable().optional(),
      mirrorAsProject: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.insert(niftyWatchedProjects).values({
        userId: ctx.user.id,
        projectId: input.projectId,
        label: input.label ?? null,
        filterByAssignee: input.filterByAssignee ? 1 : 0,
        defaultProjectId: input.defaultProjectId ?? null,
        enabled: 1,
      }).onDuplicateKeyUpdate({
        set: {
          label: input.label ?? null,
          filterByAssignee: input.filterByAssignee ? 1 : 0,
          defaultProjectId: input.defaultProjectId ?? null,
          enabled: 1,
        },
      });
      return { success: true, mirrorAsProject: !!input.mirrorAsProject && !input.defaultProjectId, suggestedName: input.label || null };
    }),

  updateNiftyWatch: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      label: z.string().max(128).optional(),
      filterByAssignee: z.boolean().optional(),
      defaultProjectId: z.string().max(40).nullable().optional(),
      enabled: z.boolean().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const set: Record<string, unknown> = {};
      if (input.label !== undefined) set.label = input.label;
      if (input.filterByAssignee !== undefined) set.filterByAssignee = input.filterByAssignee ? 1 : 0;
      if (input.defaultProjectId !== undefined) set.defaultProjectId = input.defaultProjectId;
      if (input.enabled !== undefined) set.enabled = input.enabled ? 1 : 0;
      await db.update(niftyWatchedProjects).set(set)
        .where(and(eq(niftyWatchedProjects.id, input.id), eq(niftyWatchedProjects.userId, ctx.user.id)));
      return { success: true };
    }),

  removeNiftyWatch: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.delete(externalTasks)
        .where(and(eq(externalTasks.userId, ctx.user.id), eq(externalTasks.sourceConfigId, input.id), eq(externalTasks.source, 'nifty')));
      await db.delete(niftyWatchedProjects)
        .where(and(eq(niftyWatchedProjects.id, input.id), eq(niftyWatchedProjects.userId, ctx.user.id)));
      return { success: true };
    }),

  listNiftyWatches: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    return db.select().from(niftyWatchedProjects)
      .where(eq(niftyWatchedProjects.userId, ctx.user.id))
      .orderBy(desc(niftyWatchedProjects.createdAt));
  }),

  // ── Common ───────────────────────────────────────────────────────────────

  /** Trigger a pull for all of this user's enabled sources, right now. */
  refreshNow: protectedProcedure.mutation(async ({ ctx }) => {
    return processExternalTaskPull({ userId: ctx.user.id });
  }),

  /**
   * Pull one specific watched sheet/project, not every source. Powers the
   * project detail drawer's "↻ Resync source" button so a single project's
   * data can be refreshed in ~1 sec instead of waiting for every sheet.
   */
  refreshOneSource: protectedProcedure
    .input(z.object({
      source: z.enum(['smartsheet', 'nifty']),
      sourceConfigId: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      return pullOneSource({ userId: ctx.user.id, source: input.source, sourceConfigId: input.sourceConfigId });
    }),

  /**
   * One-shot cleanup: delete every Nifty external_tasks row currently in the
   * "done" status bucket for this user, plus their override rows. Use when a
   * fresh Nifty pull dragged in years of historical completions you don't
   * actually want surfaced. After running this, the puller's
   * skipNewCompletions rule keeps them from coming back.
   *
   * Returns counts of what was deleted. Idempotent — safe to re-run.
   */
  niftyPurgeCompleted: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    // Pull every Nifty row for this user; filter to done in JS so the
    // status regex matches what the cron uses (avoids SQL LIKE drift).
    const allNifty = await db.select().from(externalTasks)
      .where(and(eq(externalTasks.userId, ctx.user.id), eq(externalTasks.source, 'nifty')));
    const isDone = (s: string | null) => {
      const x = (s || '').toLowerCase().trim();
      if (!x) return false;
      return /(^|\s)(done|complete|completed|closed|cancell?ed|resolved|shipped)/i.test(x);
    };
    const doneRows = allNifty.filter(r => isDone(r.status));
    let deletedTasks = 0;
    let deletedOverrides = 0;
    for (const row of doneRows) {
      // Delete the override first (no FK in the schema, but order keeps the
      // semantics clean).
      const ovRes = await db.delete(externalTaskOverrides)
        .where(and(
          eq(externalTaskOverrides.userId, ctx.user.id),
          eq(externalTaskOverrides.source, 'nifty'),
          eq(externalTaskOverrides.externalId, row.externalId),
        ));
      // mysql2 returns affectedRows in the result header — Drizzle wraps it
      // but the count isn't reliably exposed across drivers; just count rows.
      deletedOverrides++;
      await db.delete(externalTasks).where(eq(externalTasks.id, row.id));
      deletedTasks++;
      void ovRes;
    }
    return { deletedTasks, deletedOverrides, scanned: allNifty.length };
  }),

  /**
   * Nuclear reset: stamp removedAt on every Nifty external_tasks row for
   * the current user, then run a fresh full Nifty pull. The pull's
   * historical-completion filter only re-adds rows Nifty currently
   * reports as not-historically-done — anything else stays hidden.
   *
   * Use when previously-completed Nifty tasks linger as "Open" in
   * LevelUp because the row went stale at a time when Nifty returned
   * them as open (so the puller never had a reason to vanish them).
   *
   * Overrides are preserved. If a removed row stays missing past the
   * 72h grace window the override is tombstoned (not destroyed) so
   * personal notes survive in the Tombstoned archive.
   */
  niftyResetAndResync: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await requireDb();
    const niftyRows = await db.select({ id: externalTasks.id, removedAt: externalTasks.removedAt })
      .from(externalTasks)
      .where(and(eq(externalTasks.userId, ctx.user.id), eq(externalTasks.source, 'nifty')));
    let stamped = 0;
    for (const r of niftyRows) {
      if (r.removedAt) continue;
      await db.update(externalTasks)
        .set({ removedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(externalTasks.id, r.id));
      stamped++;
    }
    // Fresh pull. Only currently-open Nifty tasks will have removedAt
    // cleared (the upsert sets it to null on every matched row); historical
    // ones stay hidden and disappear from active views.
    const pullStats = await processExternalTaskPull({ userId: ctx.user.id });
    const after = await db.select({ id: externalTasks.id, removedAt: externalTasks.removedAt })
      .from(externalTasks)
      .where(and(eq(externalTasks.userId, ctx.user.id), eq(externalTasks.source, 'nifty')));
    const stillHidden = after.filter(r => r.removedAt).length;
    const visible = after.filter(r => !r.removedAt).length;
    return {
      stampedAtStart: stamped,
      stillHiddenAfterPull: stillHidden,
      visibleAfterPull: visible,
      pullStats,
    };
  }),

  /**
   * Diagnostic: dump the stored Nifty `raw` payload for the user's current
   * Nifty external_tasks rows so we can see exactly what Nifty is telling
   * LevelUp. Use when historical-completion tasks are still appearing as
   * Open and the puller's filter isn't catching them — the answer is in
   * the raw fields (status.name, completed, completed_at, archived).
   *
   * Returns the first 30 visible (non-removed) rows by default, with
   * the most relevant fields extracted from `raw` so we don't have to
   * eyeball giant JSON blobs. Pass titleQuery to narrow to one task.
   */
  niftyInspectRows: protectedProcedure
    .input(z.object({
      titleQuery: z.string().optional(),
      limit: z.number().int().positive().max(200).default(30),
      includeRemoved: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const rows = await db.select().from(externalTasks)
        .where(and(eq(externalTasks.userId, ctx.user.id), eq(externalTasks.source, 'nifty')));
      const q = (input.titleQuery || '').toLowerCase().trim();
      const filtered = rows
        .filter(r => input.includeRemoved || !r.removedAt)
        .filter(r => !q || (r.title || '').toLowerCase().includes(q))
        .slice(0, input.limit);
      return filtered.map(r => {
        let raw: Record<string, unknown> = {};
        try { raw = JSON.parse(r.raw || '{}'); } catch { /* ignore */ }
        const status = raw.status as { name?: string; category?: string } | undefined;
        return {
          id: r.id,
          externalId: r.externalId,
          title: r.title,
          levelup_status: r.status,
          levelup_completedAt: r.completedAt,
          levelup_removedAt: r.removedAt,
          nifty_completed: raw.completed ?? null,
          nifty_completed_at: raw.completed_at ?? null,
          nifty_archived: raw.archived ?? null,
          nifty_status_name: status?.name ?? raw.status_name ?? null,
          nifty_status_category: status?.category ?? null,
          nifty_task_group: (raw.task_group as { name?: string })?.name ?? null,
          nifty_task_group_id: (raw as { task_group_id?: string }).task_group_id ?? null,
          nifty_due_date: raw.due_date ?? null,
          nifty_url: raw.url ?? null,
          // Full raw payload for diagnostic copy/paste. Tells us if Nifty
          // is sending fields the adapter doesn't currently read.
          raw_json: r.raw || null,
        };
      });
    }),

  /**
   * Manually hide selected Nifty external_tasks rows by id. Stamps removedAt
   * (instead of hard-deleting) so the tombstone reaper preserves local
   * overrides after the grace period. Used by the inspect-rows modal's
   * per-row Hide and "Hide all shown" buttons when the puller can't
   * automatically detect that a task is done.
   */
  niftyHideRows: protectedProcedure
    .input(z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      // Source check intentionally relaxed — historically called only for
      // Nifty rows but the modal Hide-in-LevelUp button now also fires for
      // Smartsheet rows when the puller can't auto-mark them done.
      let hidden = 0;
      for (const id of input.ids) {
        const updated = await db.update(externalTasks)
          .set({ removedAt: sql`CURRENT_TIMESTAMP` })
          .where(and(
            eq(externalTasks.id, id),
            eq(externalTasks.userId, ctx.user.id),
          ));
        hidden++;
        void updated;
      }
      return { hidden };
    }),

  /**
   * Diagnostic: search every enabled Nifty watched project for tasks matching
   * a title substring (case-insensitive). Returns the raw Nifty payload for
   * each match so we can see exactly what the API thinks the status is,
   * regardless of how LevelUp has it stored. Also reports the in-DB row so
   * we can see if it's stale / removedAt-stamped.
   */
  /**
   * Inspect a Smartsheet's column schema + show whether each column would
   * match the pipeline detector. Use when "I added the sheet but no opps
   * appeared" to see exactly which column the adapter is looking for.
   */
  smartsheetInspectSheet: protectedProcedure
    .input(z.object({ sheetConfigId: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [cfg] = await db.select().from(smartsheetWatchedSheets)
        .where(and(eq(smartsheetWatchedSheets.userId, ctx.user.id), eq(smartsheetWatchedSheets.id, input.sheetConfigId)))
        .limit(1);
      if (!cfg) throw new TRPCError({ code: 'NOT_FOUND', message: 'Watched sheet not found' });
      const [cred] = await db.select().from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'smartsheet')))
        .limit(1);
      if (!cred?.apiToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No Smartsheet token' });
      const { fetchSheet } = await import("../_core/smartsheetAdapter");
      const sheet = await fetchSheet(cred.apiToken, cfg.sheetId);
      // Mirrors the adapter's logic — single-stage detection + multi-stage
      // progression detection + opp-name column lookup.
      const stageRe = /^(status|stage|pipeline\s+stage|deal\s+stage|opp(?:ortunity)?\s+stage|phase|pursuit\s+stage|capture\s+stage|sales\s+stage|funnel\s+stage)$/i;
      const valueRe = /^([\w-]+\s+)?(value|amount|\$)$|^(acv|tcv|arr|mrr|award|estimated\s+\$|dollar\s+amount|total\s+\$|potential\s+\$|projected\s+\$|\$\s*amount)$/i;
      const closeRe = /^(expected\s+|target\s+|exp\s+|projected\s+)?close(\s+date)?$|^exp\s+close(\s+date)?$/i;
      const accountRe = /^(account|account\s+name|customer|company|client|agency|prime)(\s+name)?$/i;
      const ownerRe = /^(owner|sales\s+owner|ae|account\s+executive|rep|sales\s+rep|pm|capture\s+manager)$/i;
      const contactRe = /^(contact|primary\s+contact|lead|poc)$/i;
      const probRe = /^(probability|win\s*%|confidence|prob|p\s*win)$/i;
      const oppNameRe = /^(opportunit(y|ies)|program|project(\s+name)?|title|deal|name|product)$/i;
      const stageDict: Array<{ re: RegExp; standard: string }> = [
        { re: /^(lead\s+gen(eration)?|lead|prospect|prospecting|outreach)$/i, standard: 'Lead' },
        { re: /^(qualif(ied|ication)|discovery|presales|pre[-\s]?sales)$/i, standard: 'Qualified' },
        { re: /^(proposal|sales|quote|pricing)$/i, standard: 'Proposal' },
        { re: /^(negotiation|negotiat(ing|e)|contract|red[-\s]?lines?)$/i, standard: 'Negotiation' },
        { re: /^(closed[-\s]?won|won|delivery|delivered|launch(ed)?|implement(ed|ation)?|deploy(ed|ment)?|signed)$/i, standard: 'Closed Won' },
        { re: /^(closed[-\s]?lost|lost|dead|disqualif(ied|y))$/i, standard: 'Closed Lost' },
      ];
      const matches: Record<string, string | null> = { stage: null, value: null, close: null, account: null, owner: null, contact: null, probability: null, oppName: null };
      const stageProgression: Array<{ column: string; standard: string }> = [];
      for (const c of sheet.columns) {
        const t = c.title || '';
        if (!matches.stage && stageRe.test(t)) matches.stage = t;
        if (!matches.value && valueRe.test(t)) matches.value = t;
        if (!matches.close && closeRe.test(t)) matches.close = t;
        if (!matches.account && accountRe.test(t)) matches.account = t;
        if (!matches.owner && ownerRe.test(t)) matches.owner = t;
        if (!matches.contact && contactRe.test(t)) matches.contact = t;
        if (!matches.probability && probRe.test(t)) matches.probability = t;
        if (!matches.oppName && oppNameRe.test(t)) matches.oppName = t;
        if (c.type === 'PICKLIST' || c.type === 'CHECKBOX') {
          for (const e of stageDict) {
            if (e.re.test(t)) { stageProgression.push({ column: t, standard: e.standard }); break; }
          }
        }
      }
      const allColumns = sheet.columns.map(c => {
        let matchedAs: string | null = null;
        const t = c.title || '';
        if (stageRe.test(t)) matchedAs = 'stage';
        else if (valueRe.test(t)) matchedAs = 'value';
        else if (closeRe.test(t)) matchedAs = 'close';
        else if (accountRe.test(t)) matchedAs = 'account';
        else if (oppNameRe.test(t)) matchedAs = 'oppName';
        else if (ownerRe.test(t)) matchedAs = 'owner';
        else if (contactRe.test(t)) matchedAs = 'contact';
        else if (probRe.test(t)) matchedAs = 'probability';
        const stageMatch = (c.type === 'PICKLIST' || c.type === 'CHECKBOX')
          ? stageDict.find(e => e.re.test(t))?.standard ?? null
          : null;
        return { id: c.id, title: c.title, type: c.type, matchedAs, stageProgressionMatch: stageMatch };
      });
      const singleStage = !!(matches.stage && matches.value);
      const multiStage = stageProgression.length >= 2;
      const wouldBePipeline = singleStage || multiStage;
      const layout = singleStage ? 'single' : (multiStage ? 'multi' : null);
      // Sample the actual cell values for the pipeline-relevant columns
      // across the first 8 rows. Lets us see "what does Status actually
      // contain?" without leaving LevelUp.
      const interestingColIds: Record<string, number | null> = {
        oppName: sheet.columns.find(c => c.title === matches.oppName)?.id ?? null,
        account: sheet.columns.find(c => c.title === matches.account)?.id ?? null,
        stage: sheet.columns.find(c => c.title === matches.stage)?.id ?? null,
        value: sheet.columns.find(c => c.title === matches.value)?.id ?? null,
        close: sheet.columns.find(c => c.title === matches.close)?.id ?? null,
      };
      const sampleRows = sheet.rows.slice(0, 8).map(r => {
        const out: Record<string, unknown> = { rowNumber: r.rowNumber };
        for (const [key, colId] of Object.entries(interestingColIds)) {
          if (colId == null) { out[key] = null; continue; }
          const cell = r.cells.find(c => c.columnId === colId);
          if (!cell) { out[key] = null; continue; }
          out[key] = {
            value: cell.value ?? null,
            displayValue: cell.displayValue ?? null,
          };
        }
        return out;
      });
      return {
        sheetId: cfg.sheetId,
        sheetName: sheet.name,
        rowCount: sheet.rows.length,
        columns: allColumns,
        pipelineMatches: matches,
        stageProgression,
        layout,
        wouldBePipeline,
        sampleRows,
      };
    }),

  niftyDebugFindTask: protectedProcedure
    .input(z.object({ titleContains: z.string().min(2) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [cred] = await db.select().from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'nifty')))
        .limit(1);
      if (!cred?.apiToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No Nifty token configured' });
      const watches = await db.select().from(niftyWatchedProjects)
        .where(and(eq(niftyWatchedProjects.userId, ctx.user.id), eq(niftyWatchedProjects.enabled, 1)));
      const needle = input.titleContains.toLowerCase();
      const out: Array<Record<string, unknown>> = [];
      for (const w of watches) {
        // Try both filter combos. Report whichever finds the match.
        const variants = [
          { label: 'default', params: { include_archived: 'true' } },
          { label: 'completed=true', params: { completed: 'true', include_archived: 'true' } },
          { label: 'completed=false', params: { completed: 'false', include_archived: 'true' } },
        ];
        for (const v of variants) {
          const qs = new URLSearchParams({
            project_id: w.projectId,
            limit: '100',
            offset: '0',
            include_subtasks: 'true',
            ...v.params,
          });
          const resp = await fetch(`${NIFTY_API}/tasks?${qs.toString()}`, {
            headers: { Authorization: `Bearer ${cred.apiToken}`, Accept: 'application/json' },
          });
          if (!resp.ok) {
            out.push({ watchLabel: w.label, projectId: w.projectId, filter: v.label, error: `${resp.status} ${(await resp.text()).slice(0, 200)}` });
            continue;
          }
          const data = await resp.json() as unknown;
          const arr = Array.isArray(data) ? data as Record<string, unknown>[] : ((data as { tasks?: unknown[]; data?: unknown[] }).tasks ?? (data as { data?: unknown[] }).data ?? []) as Record<string, unknown>[];
          const matches = arr.filter(t => String((t as { name?: string }).name ?? '').toLowerCase().includes(needle));
          for (const m of matches) {
            // Look up the LevelUp DB row.
            const [dbRow] = await db.select().from(externalTasks)
              .where(and(
                eq(externalTasks.userId, ctx.user.id),
                eq(externalTasks.source, 'nifty'),
                eq(externalTasks.externalId, String((m as { id?: string | number }).id ?? '')),
              )).limit(1);
            out.push({
              watchLabel: w.label,
              projectId: w.projectId,
              filter: v.label,
              taskId: (m as { id?: unknown }).id,
              name: (m as { name?: unknown }).name,
              statusObj: (m as { status?: unknown }).status,
              statusName: (m as { status_name?: unknown }).status_name,
              completed: (m as { completed?: unknown }).completed,
              completedAt: (m as { completed_at?: unknown }).completed_at,
              archived: (m as { archived?: unknown }).archived,
              levelup: dbRow ? { status: dbRow.status, removedAt: dbRow.removedAt, completedAt: dbRow.completedAt } : 'NOT IN LEVELUP DB',
            });
          }
        }
      }
      return { matches: out, watchCount: watches.length };
    }),

  /**
   * Write-back: change a Smartsheet row's status column value.
   * Caller passes the externalId (= row id) and the new status string —
   * e.g. "Not Started" / "In-Progress" / "Closed" / "Delayed" / "On-Hold".
   * Resolves the status column id from the watch config, PUTs the cell
   * update, and triggers an immediate re-pull so the new status surfaces in
   * LevelUp views without waiting for the next cron tick.
   */
  smartsheetSetRowStatus: protectedProcedure
    .input(z.object({
      externalId: z.string(),
      status: z.string().max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [cred] = await db.select().from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'smartsheet')))
        .limit(1);
      if (!cred?.apiToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No Smartsheet token configured' });
      // Find the external_tasks row to get sheetId via sourceConfigId.
      const [taskRow] = await db.select().from(externalTasks)
        .where(and(eq(externalTasks.userId, ctx.user.id), eq(externalTasks.source, 'smartsheet'), eq(externalTasks.externalId, input.externalId)))
        .limit(1);
      if (!taskRow) throw new TRPCError({ code: 'NOT_FOUND', message: 'External task not found locally' });
      const [watch] = await db.select().from(smartsheetWatchedSheets)
        .where(eq(smartsheetWatchedSheets.id, taskRow.sourceConfigId)).limit(1);
      if (!watch) throw new TRPCError({ code: 'NOT_FOUND', message: 'Source watch config missing' });
      if (!watch.statusColumn) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'This watch has no statusColumn configured — edit the watch in Settings → Integrations and set the status column name first.' });
      // Resolve the status column ID by fetching the sheet's columns.
      const colsResp = await fetch(`https://api.smartsheet.com/2.0/sheets/${watch.sheetId}/columns?includeAll=true`, {
        headers: { Authorization: `Bearer ${cred.apiToken}` },
      });
      if (!colsResp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Smartsheet columns fetch failed: ${colsResp.status}` });
      const colsData = await colsResp.json() as { data?: Array<{ id: number; title: string }> };
      const col = (colsData.data || []).find(c => c.title.toLowerCase() === String(watch.statusColumn).toLowerCase());
      if (!col) throw new TRPCError({ code: 'NOT_FOUND', message: `Status column "${watch.statusColumn}" not found on sheet` });
      // PUT the row update. Smartsheet accepts an array of {id, cells:[{columnId, value}]}.
      const putResp = await fetch(`https://api.smartsheet.com/2.0/sheets/${watch.sheetId}/rows`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${cred.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify([{ id: Number(input.externalId), cells: [{ columnId: col.id, value: input.status }] }]),
      });
      if (!putResp.ok) {
        const body = await putResp.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Smartsheet update failed: ${putResp.status} ${body.slice(0, 200)}` });
      }
      // Re-pull just this watch so LevelUp views update immediately.
      try { await processExternalTaskPull({ userId: ctx.user.id }); } catch { /* best effort */ }
      return { success: true, status: input.status };
    }),

  /**
   * Helper: returns the Smartsheet column choices (PICKLIST values) for the
   * status column on a watched sheet. Used by the client to render a
   * dropdown of valid status values (e.g. "Not Started / In-Progress /
   * Closed / Delayed / On-Hold") rather than a free-form text input.
   */
  smartsheetStatusOptions: protectedProcedure
    .input(z.object({ watchId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const [cred] = await db.select().from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'smartsheet')))
        .limit(1);
      if (!cred?.apiToken) return { options: [] };
      const [watch] = await db.select().from(smartsheetWatchedSheets)
        .where(and(eq(smartsheetWatchedSheets.id, input.watchId), eq(smartsheetWatchedSheets.userId, ctx.user.id))).limit(1);
      if (!watch?.statusColumn) return { options: [] };
      const resp = await fetch(`https://api.smartsheet.com/2.0/sheets/${watch.sheetId}/columns?includeAll=true`, {
        headers: { Authorization: `Bearer ${cred.apiToken}` },
      });
      if (!resp.ok) return { options: [] };
      const data = await resp.json() as { data?: Array<{ title: string; type: string; options?: string[] }> };
      const col = (data.data || []).find(c => c.title.toLowerCase() === String(watch.statusColumn).toLowerCase());
      return { options: col?.options || [] };
    }),

  /**
   * Write-back: change a NiftyPM task's status. NiftyPM tracks statuses as
   * objects with IDs per project, so the caller passes the status NAME (e.g.
   * "Closed", "In Progress") and we look up the matching status id on the
   * task's project.
   */
  niftySetTaskStatus: protectedProcedure
    .input(z.object({
      externalId: z.string(),
      statusName: z.string().max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const [cred] = await db.select().from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'nifty')))
        .limit(1);
      if (!cred?.apiToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'No Nifty token configured' });
      // Fetch the task to learn its project_id (needed to query project statuses).
      const taskResp = await fetch(`https://openapi.niftypm.com/api/v1.0/tasks/${input.externalId}`, {
        headers: { Authorization: `Bearer ${cred.apiToken}`, Accept: 'application/json' },
      });
      if (!taskResp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Nifty task fetch failed: ${taskResp.status}` });
      const task = await taskResp.json() as { id: string; project_id?: string; status?: { id?: string } };
      // Fetch the project's statuses + find the one matching by name.
      const projectId = task.project_id;
      let statusId: string | null = null;
      if (projectId) {
        const stResp = await fetch(`https://openapi.niftypm.com/api/v1.0/projects/${projectId}/statuses`, {
          headers: { Authorization: `Bearer ${cred.apiToken}`, Accept: 'application/json' },
        });
        if (stResp.ok) {
          const stData = await stResp.json() as Array<{ id: string; name: string }> | { statuses?: Array<{ id: string; name: string }> };
          const statuses = Array.isArray(stData) ? stData : (stData.statuses || []);
          const match = statuses.find(s => (s.name || '').toLowerCase() === input.statusName.toLowerCase());
          if (match) statusId = match.id;
        }
      }
      if (!statusId) throw new TRPCError({ code: 'NOT_FOUND', message: `Nifty status "${input.statusName}" not found on this task's project` });
      // PUT the update.
      const putResp = await fetch(`https://openapi.niftypm.com/api/v1.0/tasks/${input.externalId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${cred.apiToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusId }),
      });
      if (!putResp.ok) {
        const body = await putResp.text();
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Nifty update failed: ${putResp.status} ${body.slice(0, 200)}` });
      }
      try { await processExternalTaskPull({ userId: ctx.user.id }); } catch { /* best effort */ }
      return { success: true, statusName: input.statusName, statusId };
    }),

  /** Helper: list available Nifty status names for a watched project. */
  niftyStatusOptions: protectedProcedure
    .input(z.object({ watchId: z.number().int() }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const [cred] = await db.select().from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, 'nifty')))
        .limit(1);
      if (!cred?.apiToken) return { options: [] };
      const [watch] = await db.select().from(niftyWatchedProjects)
        .where(and(eq(niftyWatchedProjects.id, input.watchId), eq(niftyWatchedProjects.userId, ctx.user.id))).limit(1);
      if (!watch) return { options: [] };
      const resp = await fetch(`https://openapi.niftypm.com/api/v1.0/projects/${watch.projectId}/statuses`, {
        headers: { Authorization: `Bearer ${cred.apiToken}`, Accept: 'application/json' },
      });
      if (!resp.ok) return { options: [] };
      const data = await resp.json() as Array<{ id: string; name: string }> | { statuses?: Array<{ id: string; name: string }> };
      const statuses = Array.isArray(data) ? data : (data.statuses || []);
      return { options: statuses.map(s => s.name).filter(Boolean) };
    }),

  /**
   * Read external tasks for the client. Omits removed rows by default;
   * includeRemoved=true returns tombstoned-with-override too.
   */
  listExternalTasks: protectedProcedure
    .input(z.object({
      source: sourceEnum.optional(),
      includeRemoved: z.boolean().default(false),
    }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const conditions = [eq(externalTasks.userId, ctx.user.id)];
      if (input.source) conditions.push(eq(externalTasks.source, input.source));
      const rows = await db.select().from(externalTasks).where(and(...conditions));
      const filtered = input.includeRemoved ? rows : rows.filter(r => !r.removedAt);

      const overrides = await db.select().from(externalTaskOverrides)
        .where(eq(externalTaskOverrides.userId, ctx.user.id));
      const overrideMap = new Map<string, typeof overrides[number]>();
      for (const o of overrides) overrideMap.set(`${o.source}:${o.externalId}`, o);

      return filtered.map(r => ({
        ...r,
        override: overrideMap.get(`${r.source}:${r.externalId}`) ?? null,
      }));
    }),

  /**
   * Set / clear the user's local overlay on an external task (My Day flag,
   * local priority, personal note, etc.). Tombstone is set by the cron
   * reaper, not the client — clients should treat it as read-only.
   */
  upsertOverride: protectedProcedure
    .input(z.object({
      source: sourceEnum,
      externalId: z.string(),
      myDay: z.boolean().optional(),
      localPriority: z.string().max(32).nullable().optional(),
      localNote: z.string().nullable().optional(),
      localTags: z.string().max(512).nullable().optional(),
      localDue: z.string().max(32).nullable().optional(),
      localProjectId: z.string().max(40).nullable().optional(),
      pendingStatus: z.string().max(128).nullable().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const set: Record<string, unknown> = {};
      if (input.myDay !== undefined) set.myDay = input.myDay ? 1 : 0;
      if (input.localPriority !== undefined) set.localPriority = input.localPriority;
      if (input.localNote !== undefined) set.localNote = input.localNote;
      if (input.localTags !== undefined) set.localTags = input.localTags;
      if (input.localDue !== undefined) set.localDue = input.localDue;
      if (input.localProjectId !== undefined) set.localProjectId = input.localProjectId;
      if (input.pendingStatus !== undefined) {
        set.pendingStatus = input.pendingStatus;
        set.pendingStatusAt = input.pendingStatus ? sql`CURRENT_TIMESTAMP` : null;
        set.pendingError = null;
      }

      await db.insert(externalTaskOverrides).values({
        userId: ctx.user.id,
        source: input.source,
        externalId: input.externalId,
        myDay: input.myDay ? 1 : 0,
        localPriority: input.localPriority ?? null,
        localNote: input.localNote ?? null,
        localTags: input.localTags ?? null,
        localDue: input.localDue ?? null,
        localProjectId: input.localProjectId ?? null,
        pendingStatus: input.pendingStatus ?? null,
        pendingStatusAt: input.pendingStatus ? new Date() : null,
      }).onDuplicateKeyUpdate({ set });
      return { success: true };
    }),

  /**
   * Push every override row with a non-null pendingStatus to its source.
   * Successes clear pendingStatus + pendingError; failures keep the queue
   * entry with pendingError populated so the user can retry. Returns
   * counts so the UI can summarise in a toast.
   */
  pushPendingChanges: protectedProcedure
    .input(z.object({
      // Optional whitelist — when provided, only push these (source, externalId)
      // pairs. Lets the UI offer a per-row select instead of all-or-nothing.
      only: z.array(z.object({
        source: z.enum(['smartsheet', 'nifty']),
        externalId: z.string(),
      })).optional(),
    }).optional())
    .mutation(async ({ ctx, input }) => {
    const db = await requireDb();
    const allPending = await db.select().from(externalTaskOverrides)
      .where(and(eq(externalTaskOverrides.userId, ctx.user.id), isNotNull(externalTaskOverrides.pendingStatus)));
    // Apply the optional whitelist filter on the server so a stale client
    // can't ask us to push something it doesn't have.
    let pending = allPending;
    if (input?.only && input.only.length) {
      const wanted = new Set(input.only.map(o => `${o.source}:${o.externalId}`));
      pending = allPending.filter(p => wanted.has(`${p.source}:${p.externalId}`));
    }
    let pushed = 0, failed = 0;
    const errors: string[] = [];
    for (const p of pending) {
      try {
        if (p.source === 'smartsheet') {
          await pushSmartsheetStatusInternal(db, ctx.user.id, p.externalId, p.pendingStatus!);
        } else if (p.source === 'nifty') {
          await pushNiftyStatusInternal(db, ctx.user.id, p.externalId, p.pendingStatus!);
        }
        await db.update(externalTaskOverrides)
          .set({ pendingStatus: null, pendingStatusAt: null, pendingError: null })
          .where(eq(externalTaskOverrides.id, p.id));
        pushed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.update(externalTaskOverrides)
          .set({ pendingError: msg.slice(0, 4000) })
          .where(eq(externalTaskOverrides.id, p.id));
        failed++;
        errors.push(`${p.source}:${p.externalId}: ${msg.slice(0, 100)}`);
      }
    }
    // Trigger an immediate re-pull so the pushed statuses surface in LevelUp.
    try { await processExternalTaskPull({ userId: ctx.user.id }); } catch { /* best-effort */ }
    return { pushed, failed, errors };
  }),

  pendingPushCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const rows = await db.select().from(externalTaskOverrides)
      .where(and(eq(externalTaskOverrides.userId, ctx.user.id), isNotNull(externalTaskOverrides.pendingStatus)));
    return { count: rows.length, items: rows.map(r => ({ source: r.source, externalId: r.externalId, pendingStatus: r.pendingStatus, pendingError: r.pendingError })) };
  }),

  /**
   * Bulk-link external tasks to a LevelUp project. Accepts an array of
   * {source, externalId} pairs so a multi-select picker can save in one call.
   * Pass projectId=null to unlink.
   */
  setProjectLinks: protectedProcedure
    .input(z.object({
      projectId: z.string().max(40).nullable(),
      tasks: z.array(z.object({ source: sourceEnum, externalId: z.string() })).max(500),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      for (const t of input.tasks) {
        await db.insert(externalTaskOverrides).values({
          userId: ctx.user.id,
          source: t.source,
          externalId: t.externalId,
          myDay: 0,
          localProjectId: input.projectId,
        }).onDuplicateKeyUpdate({ set: { localProjectId: input.projectId } });
      }
      return { success: true, count: input.tasks.length };
    }),
});
