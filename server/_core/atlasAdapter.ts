/**
 * Atlas adapter.
 *
 * Pulls a read-only snapshot of the Atlas (CFResourcePlanner) workspace —
 * projects, initiatives, opportunities, overhead, departments+members,
 * activities (COE Plan + Project Tasks), task templates, and lookup lists —
 * from its /api/atlas-snapshot endpoint.
 *
 * Configuration via env vars (set in the Railway LevelUp service):
 *   ATLAS_SYNC_URL    = base URL of the Atlas deployment, e.g.
 *                      https://cfresourceplanner-production.up.railway.app
 *   ATLAS_SYNC_TOKEN  = bearer token matching Atlas's ATLAS_SYNC_TOKEN env
 *                      (optional on the Atlas side, but if set there it must
 *                       match here)
 *
 * One-way sync: LevelUp never writes back to Atlas. The snapshot is mirrored
 * verbatim into user_app_data.atlas as a JSON blob.
 */

export interface AtlasMember {
  id: string;
  name: string;
  role: string;
  cost: number;
  badge: string;
  reportsTo: string;
  projects: Array<string | { id: string; pct?: number; clinId?: string }>;
  skillsets: string[];
  certifications: string[];
  location: string;
  clearance: string;
  hub: boolean;
  sme: boolean;
  associate: boolean;
  proposal: boolean;
  recruiter: boolean;
  note: string;
  reassess: boolean;
  pastProjects: string[];
  pastClients: string[];
  resumeLink: string;
  attachments: Array<{ id?: string; name: string; url: string; type: string; size?: number }>;
}

export interface AtlasDepartment {
  id: string;
  name: string;
  subtitle: string;
  accent: string;
  parentId: string | null;
  members: AtlasMember[];
}

export interface AtlasProject {
  id: string;
  name: string;
  category: 'project' | 'initiative' | 'opportunity' | 'overhead';
  revenue: number;
  targetRevenue: number;
  revenueNote: string;
  description: string;
  parentId: string | null;
  attachments: Array<{ id?: string; name: string; url: string; type: string; size?: number }>;
  clins: Array<{ id: string; number: string; title: string; revenue: number; notes: string }>;
  // Opportunity-specific
  customer: string;
  stage: string;
  status: string;
  leadGen: string;
  presales: string;
  sales: string;
  delivery: string;
  opr: string;
  pm: string;
  team: string;
  potential: number;
  closeDate: string;
  changeRequested: string;
}

export interface AtlasActivity {
  id: string;
  kind: 'coe' | 'project';
  programId: string;
  program: string;
  task: string;
  subtask: string;
  outline: string;
  objective: string;
  phase: string;
  start: string;
  dueDate: string;
  isMilestone: boolean;
  status: 'todo' | 'doing' | 'done' | 'blocked';
  parentId: string | null;
  owners: string[];
  ownerText: string;
  projectId: string | null;
  pm: string;
  order: number;
  templateId: string;
  updates: Array<{ id: string; ts: number; author: string; text: string }>;
  attachments: Array<{ id?: string; name: string; url: string; type: string; size?: number }>;
}

export interface AtlasSnapshot {
  version: string;
  source: 'atlas';
  generatedAt: string;
  updatedAt: string | null;
  planStart: string | null;
  departments: AtlasDepartment[];
  projects: AtlasProject[];
  activities: AtlasActivity[];
  programs: Array<{ id: string; name: string; color: string; order: number; lead: string }>;
  taskTemplates: Array<{ id: string; name: string }>;
  locations: Array<{ id: string; name: string }>;
  skillsets: Array<{ id: string; name: string }>;
  certifications: Array<{ id: string; name: string }>;
  clearances: Array<{ id: string; name: string }>;
  pastProjects: Array<{ id: string; name: string }>;
  pastClients: Array<{ id: string; name: string }>;
  /** Local-only: populated by pullAtlasSnapshot() with the time of the pull,
   *  separate from `generatedAt` which Atlas stamps. */
  pulledAt?: string;
}

export interface AtlasConfigStatus {
  urlConfigured: boolean;
  tokenConfigured: boolean;
  baseUrl: string;
}

export function atlasConfigStatus(): AtlasConfigStatus {
  const url = (process.env.ATLAS_SYNC_URL || '').trim();
  const token = (process.env.ATLAS_SYNC_TOKEN || '').trim();
  return {
    urlConfigured: !!url,
    tokenConfigured: !!token,
    baseUrl: url,
  };
}

/**
 * Fetch the snapshot from Atlas. Throws on network/auth errors.
 * Pure read — does not write anywhere.
 */
export async function pullAtlasSnapshot(): Promise<AtlasSnapshot> {
  const url = (process.env.ATLAS_SYNC_URL || '').trim();
  const token = (process.env.ATLAS_SYNC_TOKEN || '').trim();
  if (!url) throw new Error('ATLAS_SYNC_URL env var is not set on this LevelUp deployment');

  // Tolerate URL with or without trailing slash
  const endpoint = url.replace(/\/+$/, '') + '/api/atlas-snapshot';
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), 30_000);
  let resp: Response;
  try {
    resp = await fetch(endpoint, { method: 'GET', headers, signal: ctrl.signal });
  } catch (e: any) {
    clearTimeout(timeout);
    throw new Error(`Atlas pull failed: ${e?.message || 'network error'}`);
  }
  clearTimeout(timeout);

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Atlas pull failed: HTTP ${resp.status} ${resp.statusText}${body ? ' — ' + body.slice(0, 200) : ''}`);
  }

  const json = (await resp.json()) as AtlasSnapshot;
  if (!json || json.source !== 'atlas') {
    throw new Error('Atlas pull returned an unexpected payload (missing source: "atlas")');
  }
  json.pulledAt = new Date().toISOString();
  return json;
}
