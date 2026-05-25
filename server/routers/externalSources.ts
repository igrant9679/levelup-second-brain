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
import { and, desc, eq } from "drizzle-orm";
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
import { processExternalTaskPull } from "../_core/externalTasksCron";

const SS_API = "https://api.smartsheet.com/2.0";
const NIFTY_API = "https://openapi.niftypm.com/api/v1.0";

const sourceEnum = z.enum(['smartsheet', 'nifty']);

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
  return db;
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
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.insert(smartsheetWatchedSheets).values({
        userId: ctx.user.id,
        sheetId: input.sheetId,
        label: input.label ?? null,
        ownerColumn: input.ownerColumn,
        ownerMatchValue: input.ownerMatchValue,
        matchMode: input.matchMode,
        statusColumn: input.statusColumn ?? null,
        dueColumn: input.dueColumn ?? null,
        excludeDoneStatuses: input.excludeDoneStatuses ?? null,
        enabled: 1,
      }).onDuplicateKeyUpdate({
        set: {
          label: input.label ?? null,
          ownerColumn: input.ownerColumn,
          ownerMatchValue: input.ownerMatchValue,
          matchMode: input.matchMode,
          statusColumn: input.statusColumn ?? null,
          dueColumn: input.dueColumn ?? null,
          excludeDoneStatuses: input.excludeDoneStatuses ?? null,
          enabled: 1,
        },
      });
      return { success: true };
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
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      await db.insert(niftyWatchedProjects).values({
        userId: ctx.user.id,
        projectId: input.projectId,
        label: input.label ?? null,
        filterByAssignee: input.filterByAssignee ? 1 : 0,
        enabled: 1,
      }).onDuplicateKeyUpdate({
        set: {
          label: input.label ?? null,
          filterByAssignee: input.filterByAssignee ? 1 : 0,
          enabled: 1,
        },
      });
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
      }).onDuplicateKeyUpdate({ set });
      return { success: true };
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
