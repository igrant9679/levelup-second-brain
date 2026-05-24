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
  const data = await resp.json() as { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
  await upsertExternalSourceCredential({
    userId: cred.userId,
    source: 'nifty',
    apiToken: data.access_token,
    refreshToken: data.refresh_token ?? cred.refreshToken,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    scope: data.scope ?? cred.scope ?? null,
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
 * Fetch all tasks in a project. Nifty paginates with `?page` + `?per_page`
 * (default 50). We walk pages until empty; cap at 50 pages as a safety
 * ceiling (matches the existing M365 contacts importer ceiling).
 */
async function fetchAllProjectTasks(apiToken: string, projectId: string): Promise<NiftyTask[]> {
  const out: NiftyTask[] = [];
  const PER_PAGE = 100;
  for (let page = 1; page <= 50; page++) {
    const url = `${NIFTY_API}/tasks?project_id=${encodeURIComponent(projectId)}&page=${page}&per_page=${PER_PAGE}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}`, Accept: 'application/json' },
    });
    if (!resp.ok) {
      throw new Error(`Nifty /tasks page ${page} failed: ${resp.status} ${await resp.text()}`);
    }
    const data = await resp.json() as NiftyTask[] | { tasks?: NiftyTask[]; data?: NiftyTask[] };
    const tasks = Array.isArray(data) ? data : (data.tasks ?? data.data ?? []);
    if (tasks.length === 0) break;
    out.push(...tasks);
    if (tasks.length < PER_PAGE) break;
  }
  return out;
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
    if (isDoneStatus(t)) continue;

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
