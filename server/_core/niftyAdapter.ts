/**
 * NiftyPM adapter.
 *
 * Fetches tasks for a configured project, filters to those assigned to the
 * user, normalizes to ExternalTaskInput for upsert.
 *
 * Requires Nifty Pro plan (API access). Personal access token auth.
 * Docs: https://openapi.niftypm.com/
 */

import type { NiftyWatchedProject, ExternalSourceCredential } from "../../drizzle/schema";
import type { ExternalTaskInput as SmartsheetExternalTaskInput } from "./smartsheetAdapter";
import { upsertExternalSourceCredential, getExternalSourceCredential } from "../db";

const NIFTY_API = "https://openapi.niftypm.com/api/v1.0";
const NIFTY_TOKEN_URL = "https://openapi.niftypm.com/oauth/token";

/**
 * Refresh a Nifty access token if it expires within the next 60 seconds.
 * Returns the (possibly updated) credential row. No-op for non-OAuth creds
 * (Smartsheet) or when no refresh_token is present.
 */
async function ensureFreshNiftyToken(cred: ExternalSourceCredential): Promise<ExternalSourceCredential> {
  if (!cred.refreshToken || !cred.clientId || !cred.clientSecret) return cred;
  const now = Date.now();
  const exp = cred.expiresAt ? new Date(cred.expiresAt).getTime() : 0;
  if (exp - now > 60_000) return cred; // still valid for ≥60s
  const basic = Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString('base64');
  const resp = await fetch(NIFTY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Basic ${basic}` },
    body: JSON.stringify({ refresh_token: cred.refreshToken, grant_type: 'refresh_token' }),
  });
  if (!resp.ok) {
    throw new Error(`Nifty token refresh failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json() as { access_token: unknown; refresh_token?: unknown; expires_in?: number; scope?: unknown };
  // Same array→CSV coercion as the OAuth callback. Nifty returns scope as an
  // array (despite spec saying string) and mysql2 would emit `(a,b,c)` SQL.
  const toStr = (v: unknown): string | null => {
    if (v == null) return null;
    if (Array.isArray(v)) return v.map(x => String(x)).join(',');
    if (typeof v === 'object') return JSON.stringify(v);
    return String(v);
  };
  await upsertExternalSourceCredential({
    userId: cred.userId,
    source: 'nifty',
    apiToken: toStr(data.access_token) ?? '',
    refreshToken: toStr(data.refresh_token) ?? cred.refreshToken,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    scope: toStr(data.scope) ?? cred.scope ?? null,
    clientId: cred.clientId,
    clientSecret: cred.clientSecret,
  });
  const fresh = await getExternalSourceCredential(cred.userId, 'nifty');
  return fresh ?? cred;
}

export type NiftyExternalTaskInput = Omit<SmartsheetExternalTaskInput, 'source'> & { source: 'nifty' };

interface NiftyMember {
  id: string;
  email?: string;
  name?: string;
}

interface NiftyTask {
  id: string;
  name: string;
  description?: string;
  status?: { name?: string; category?: string };
  due_date?: string;
  start_date?: string;
  assigned_to?: string[]; // member IDs
  parent_task_id?: string | null;
  url?: string;
  project_id?: string;
  // Nifty's response shape varies by endpoint; we tolerate a few aliases:
  status_name?: string;
  dueDate?: string;
}

/**
 * Identify the authenticated Nifty member. Used at token-entry time to
 * capture the user's member id so the assignee filter doesn't depend on
 * typed-name matching.
 */
export async function fetchNiftyMe(apiToken: string): Promise<{
  id: string;
  email: string;
  name: string;
}> {
  const resp = await fetch(`${NIFTY_API}/users/me`, {
    headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
  });
  if (!resp.ok) {
    throw new Error(`Nifty /users/me failed: ${resp.status} ${await resp.text()}`);
  }
  const data = await resp.json() as NiftyMember;
  return { id: data.id, email: data.email ?? '', name: data.name ?? '' };
}

/**
 * Fetch one page of /tasks with the given filter overlay. Nifty's GET /tasks
 * paginates via `limit` (max 100) + `offset` (NOT `page` + `per_page` — those
 * are silently ignored and Nifty falls back to its 25-default which is why
 * earlier versions of this puller only ever saw the first 25 tasks per
 * project). We walk offsets until a short page comes back.
 */
async function fetchTaskPage(
  apiToken: string,
  projectId: string,
  extraParams: Record<string, string>,
): Promise<NiftyTask[]> {
  const out: NiftyTask[] = [];
  const LIMIT = 100;
  for (let offset = 0; offset < 5000; offset += LIMIT) {
    const params = new URLSearchParams({
      project_id: projectId,
      limit: String(LIMIT),
      offset: String(offset),
      include_subtasks: 'true',
      ...extraParams,
    });
    const url = `${NIFTY_API}/tasks?${params.toString()}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    if (!resp.ok) {
      throw new Error(`Nifty /tasks offset ${offset} failed: ${resp.status} ${await resp.text()}`);
    }
    const data = await resp.json() as NiftyTask[] | { tasks?: NiftyTask[]; data?: NiftyTask[] };
    const tasks = Array.isArray(data) ? data : (data.tasks ?? data.data ?? []);
    if (tasks.length === 0) break;
    out.push(...tasks);
    if (tasks.length < LIMIT) break;
  }
  return out;
}

/**
 * Fetch all tasks in a project across every completion state. Nifty's default
 * /tasks response excludes completed tasks — which used to make completed
 * tasks "vanish" from our puller (stamped removedAt and frozen at last-seen
 * status). Fix: pull the open set, then explicitly pull the completed set,
 * then merge by id. include_archived=true also pulls archived rows so a
 * project the user archived doesn't drop everything overnight.
 */
async function fetchAllProjectTasks(apiToken: string, projectId: string): Promise<NiftyTask[]> {
  const seen = new Map<string, NiftyTask>();
  // Bare call — whatever Nifty's default is (typically incomplete tasks).
  const open = await fetchTaskPage(apiToken, projectId, { include_archived: 'true' });
  for (const t of open) seen.set(String(t.id), t);
  // Explicit completed pull so closed tasks update their status in LevelUp
  // instead of vanishing → tombstoning after 72h.
  const closed = await fetchTaskPage(apiToken, projectId, { completed: 'true', include_archived: 'true' });
  for (const t of closed) seen.set(String(t.id), t);
  return Array.from(seen.values());
}

/**
 * Statuses we treat as "done" and exclude from the pulled set. Nifty
 * categorises statuses (open/in_progress/closed) — we match on category
 * first, then fall back to common name patterns.
 */
function isDoneStatus(t: NiftyTask): boolean {
  const cat = t.status?.category?.toLowerCase();
  if (cat === 'closed' || cat === 'completed' || cat === 'done') return true;
  const name = (t.status?.name ?? t.status_name ?? '').toLowerCase();
  return ['done', 'complete', 'completed', 'closed', 'cancelled'].includes(name);
}

export async function pullNiftyProject(
  cfg: NiftyWatchedProject,
  cred: ExternalSourceCredential,
): Promise<NiftyExternalTaskInput[]> {
  const fresh = await ensureFreshNiftyToken(cred);
  if (!fresh.apiToken) {
    throw new Error('Nifty access_token missing — reconnect required (re-run OAuth consent).');
  }
  const tasks = await fetchAllProjectTasks(fresh.apiToken, cfg.projectId);
  const myId = cred.accountExternalId;

  const out: NiftyExternalTaskInput[] = [];
  for (const t of tasks) {
    if (cfg.filterByAssignee && myId) {
      if (!Array.isArray(t.assigned_to) || !t.assigned_to.includes(myId)) continue;
    }
    // No longer drop done rows at pull time — render + cron handle completion
    // semantics (stamp completedAt, hide from active views, surface in Done
    // tab and weekly review's shipped section).

    out.push({
      source: 'nifty',
      sourceConfigId: cfg.id,
      externalId: String(t.id),
      externalUrl: t.url ?? null,
      title: t.name,
      description: t.description ?? null,
      status: t.status?.name ?? t.status_name ?? null,
      priority: null,
      due: t.due_date ?? t.dueDate ?? null,
      startDate: t.start_date ?? null,
      assignee: cred.accountDisplayName ?? cred.accountEmail ?? null,
      projectLabel: cfg.label ?? null,
      parentExternalId: t.parent_task_id ?? null,
      raw: JSON.stringify(t),
    });
  }
  return out;
}
