/**
 * Server-side scheduled reports cron.
 *
 * Walks every `user_app_data` row whose `prefs` blob contains
 * `savedReports[*].schedule` with a non-"off" frequency, decides which
 * reports are due (based on `lastSentISO` + frequency + time-of-day +
 * dow/dom), renders a minimal HTML email, and ships it via `sendEmail`.
 *
 * Why a mini renderer: the client renders reports via DOM manipulation
 * and embedded SVG. Reproducing that headless is heavy. Instead, we ship
 * a stripped-down email — KPI tiles, a few key tables, and a "View full
 * dashboard" CTA. Widgets are summarised as a list rather than
 * re-rendered as charts.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { userAppData, users, type UserAppData } from "../../drizzle/schema";
import { sendEmail } from "./sendEmail";
import { insertScheduledTaskLog } from "../db";

type Task = { status?: string; priority?: string; due?: string; completedAt?: string; createdAt?: string; title?: string; project?: string; tags?: string[] };
type Goal = { title?: string; pct?: number; category?: string; dueDate?: string };
type Habit = { title?: string; cadence?: string; streak?: number; doneToday?: boolean; completedDates?: string[] };
type Journal = { date?: string; title?: string; mood?: string; body?: string };
type Project = { name?: string; status?: string; pct?: number };

interface ReportSchedule {
  frequency?: 'off' | 'daily' | 'weekly' | 'monthly';
  time?: string;       // "HH:MM"
  dow?: number | string; // 0–6
  dom?: number | string; // 1–31
  lastSentISO?: string;
}
interface SavedReport {
  id?: number | string;
  name?: string;
  range?: '7d' | '30d' | '90d' | '365d' | 'all';
  sections?: Record<string, boolean>;
  widgets?: Array<{ title?: string; source?: string; viz?: string; metric?: string; groupBy?: string }>;
  schedule?: ReportSchedule;
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function rangeStartKey(range: SavedReport['range']): string {
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === '365d' ? 365 : 9999;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function rangeLabel(range: SavedReport['range']): string {
  return range === '7d' ? 'Last 7 days'
    : range === '30d' ? 'Last 30 days'
    : range === '90d' ? 'Last 90 days'
    : range === '365d' ? 'Last year'
    : 'All time';
}

/**
 * Decide whether a scheduled report is due **right now**.
 * Mirrors the client-side `_checkReportSchedules` logic so emails are
 * not sent twice (once from server, once from client login catch-up).
 */
function isReportDue(s: ReportSchedule | undefined, now: Date): boolean {
  if (!s || !s.frequency || s.frequency === 'off') return false;
  const [hh, mm] = (s.time || '08:00').split(':').map(n => Number(n) || 0);
  const target = new Date(now);
  target.setHours(hh || 8, mm || 0, 0, 0);
  if (now < target) return false; // not yet today
  const last = s.lastSentISO ? new Date(s.lastSentISO) : null;
  if (s.frequency === 'daily') {
    return !last || last < target;
  }
  if (s.frequency === 'weekly') {
    if (now.getDay() !== Number(s.dow ?? 1)) return false;
    return !last || (now.getTime() - last.getTime()) > 24 * 60 * 60 * 1000;
  }
  if (s.frequency === 'monthly') {
    if (now.getDate() !== Number(s.dom ?? 1)) return false;
    return !last || (now.getTime() - last.getTime()) > 24 * 60 * 60 * 1000;
  }
  return false;
}

function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c] as string));
}

interface UserBlobs {
  tasks: Task[];
  goals: Goal[];
  habits: Habit[];
  journal: Journal[];
  projects: Project[];
}

/**
 * Render the email HTML. KPI tiles + per-section tables. No SVG, no JS.
 * Inlined styles only — many email clients strip <style>.
 */
function renderReportEmailHtml(opts: {
  reportName: string;
  rangeKey: SavedReport['range'];
  sections: Record<string, boolean>;
  widgets: SavedReport['widgets'];
  blobs: UserBlobs;
  appUrl: string;
  userName: string;
}): string {
  const { reportName, rangeKey, sections, widgets, blobs, appUrl, userName } = opts;
  const startKey = rangeStartKey(rangeKey);
  const todayKey = new Date().toISOString().slice(0, 10);
  const inRange = (d?: string) => d != null && d >= startKey && d <= todayKey;

  const tasks = blobs.tasks || [];
  const goals = blobs.goals || [];
  const habits = blobs.habits || [];
  const journal = blobs.journal || [];
  const projects = blobs.projects || [];

  // KPIs
  const tasksDone = tasks.filter(t => t.status === 'Done' && inRange(t.completedAt || t.createdAt)).length;
  const overdue = tasks.filter(t => t.status !== 'Done' && t.due && t.due < todayKey).length;
  const activeGoals = goals.filter(g => (g.pct || 0) < 100).length;
  const avgGoalPct = goals.length ? Math.round(goals.reduce((s, g) => s + (g.pct || 0), 0) / goals.length) : 0;
  const dailyHabits = habits.filter(h => h.cadence === 'Daily');
  const habitsDoneToday = dailyHabits.filter(h => h.doneToday).length;
  const longestStreak = habits.reduce((m, h) => Math.max(m, h.streak || 0), 0);
  const journalEntries = journal.filter(j => inRange(j.date)).length;
  const activeProjects = projects.filter(p => (p.pct || 0) < 100).length;

  const tile = (label: string, value: string | number, color: string) =>
    `<td style="padding:0 6px;vertical-align:top"><div style="background:#161d2e;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:14px 16px"><div style="font-size:22px;font-weight:800;color:${color};line-height:1.1">${esc(value)}</div><div style="font-size:11px;color:#94a3b8;margin-top:3px">${esc(label)}</div></div></td>`;

  const kpisTable = `<table cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:0;margin:0 -6px"><tr>
    ${sections.tasks !== false ? tile('Tasks done', tasksDone, '#22c55e') : ''}
    ${sections.tasks !== false ? tile('Overdue', overdue, overdue > 0 ? '#ef4444' : '#94a3b8') : ''}
    ${sections.goals !== false ? tile('Avg goal %', avgGoalPct + '%', '#a855f7') : ''}
    ${sections.habits !== false ? tile('Habits today', `${habitsDoneToday}/${dailyHabits.length}`, '#3b82f6') : ''}
  </tr></table>`;

  const sectionHdr = (icon: string, title: string) =>
    `<h2 style="font-size:14px;font-weight:700;color:#e2e8f0;margin:28px 0 10px;border-bottom:1px solid rgba(255,255,255,.08);padding-bottom:6px">${icon} ${esc(title)}</h2>`;

  // Tasks completed this range
  let tasksHtml = '';
  if (sections.tasks !== false) {
    const recent = tasks
      .filter(t => t.status === 'Done' && inRange(t.completedAt || t.createdAt))
      .sort((a, b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')))
      .slice(0, 8);
    const overdueList = tasks
      .filter(t => t.status !== 'Done' && t.due && t.due < todayKey)
      .sort((a, b) => String(a.due || '').localeCompare(String(b.due || '')))
      .slice(0, 5);
    const row = (t: Task, dim = false) => `<tr><td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:12px;color:${dim ? '#94a3b8' : '#e2e8f0'}">${esc(t.title || '(untitled)')}</td><td style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:11px;color:#94a3b8;text-align:right;white-space:nowrap">${esc(t.priority || '')} ${t.due ? '· ' + esc(t.due) : ''}</td></tr>`;
    tasksHtml = sectionHdr('✓', `Tasks (${recent.length} done · ${overdueList.length} overdue)`) +
      (recent.length || overdueList.length
        ? `<table style="width:100%;border-collapse:collapse">${recent.map(t => row(t)).join('')}${overdueList.map(t => row(t, true)).join('')}</table>`
        : `<p style="font-size:12px;color:#94a3b8;margin:6px 0">No task activity in this range.</p>`);
  }

  // Goals
  let goalsHtml = '';
  if (sections.goals !== false && goals.length) {
    const rows = goals.slice(0, 8).map(g => {
      const pct = Math.max(0, Math.min(100, Math.round(g.pct || 0)));
      const barColor = pct >= 75 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444';
      return `<tr><td style="padding:6px 0;font-size:12px;color:#e2e8f0">${esc(g.title || '(untitled)')}${g.dueDate ? ` <span style="color:#94a3b8;font-size:10px">· due ${esc(g.dueDate)}</span>` : ''}</td><td style="padding:6px 0;width:140px;vertical-align:middle"><div style="background:rgba(255,255,255,.08);border-radius:3px;height:6px;overflow:hidden"><div style="height:6px;background:${barColor};width:${pct}%"></div></div></td><td style="padding:6px 0;font-size:11px;color:#94a3b8;text-align:right;width:40px">${pct}%</td></tr>`;
    }).join('');
    goalsHtml = sectionHdr('🎯', `Goals (${activeGoals} active)`) +
      `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
  }

  // Habits
  let habitsHtml = '';
  if (sections.habits !== false && habits.length) {
    const rows = habits.slice(0, 8).map(h => {
      const completions30 = (h.completedDates || []).filter(d => d >= startKey).length;
      return `<tr><td style="padding:6px 0;font-size:12px;color:#e2e8f0">${esc(h.title || '(untitled)')}</td><td style="padding:6px 0;font-size:11px;color:#94a3b8;text-align:right">streak ${h.streak || 0} · ${completions30} in range</td></tr>`;
    }).join('');
    habitsHtml = sectionHdr('🌱', `Habits (longest streak: ${longestStreak})`) +
      `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
  }

  // Projects
  let projectsHtml = '';
  if (sections.projects !== false && projects.length) {
    const rows = projects.slice(0, 6).map(p => `<tr><td style="padding:6px 0;font-size:12px;color:#e2e8f0">${esc(p.name || '(untitled)')}</td><td style="padding:6px 0;font-size:11px;color:#94a3b8;text-align:right">${esc(p.status || '')} · ${Math.round(p.pct || 0)}%</td></tr>`).join('');
    projectsHtml = sectionHdr('📁', `Projects (${activeProjects} active)`) +
      `<table style="width:100%;border-collapse:collapse">${rows}</table>`;
  }

  // Journal
  let journalHtml = '';
  if (sections.journal !== false && journalEntries) {
    journalHtml = sectionHdr('📓', `Journal (${journalEntries} entr${journalEntries === 1 ? 'y' : 'ies'} in range)`) +
      `<p style="font-size:12px;color:#94a3b8;margin:6px 0">View full entries in LevelUp.</p>`;
  }

  // Widget summary (no charts — just a list)
  let widgetsHtml = '';
  if (Array.isArray(widgets) && widgets.length) {
    const rows = widgets.slice(0, 10).map(w => `<tr><td style="padding:5px 0;font-size:12px;color:#e2e8f0">• ${esc(w.title || w.source || 'Widget')}</td><td style="padding:5px 0;font-size:11px;color:#94a3b8;text-align:right">${esc(w.viz || '')}${w.groupBy ? ' · by ' + esc(w.groupBy) : ''}</td></tr>`).join('');
    widgetsHtml = sectionHdr('📊', `Custom widgets (${widgets.length})`) +
      `<table style="width:100%;border-collapse:collapse">${rows}</table>
       <p style="font-size:11px;color:#94a3b8;margin:8px 0 0">Charts render in the app — <a href="${esc(appUrl)}" style="color:#a78bfa">open dashboard</a> to view.</p>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(reportName)}</title></head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:640px;margin:0 auto;padding:28px 24px;color:#e2e8f0">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
      <h1 style="font-size:20px;font-weight:800;color:#fff;margin:0">📊 ${esc(reportName)}</h1>
      <span style="font-size:11px;color:#94a3b8">${esc(new Date().toLocaleDateString())}</span>
    </div>
    <p style="font-size:12px;color:#94a3b8;margin:0 0 18px">Hi ${esc(userName)} — here's your scheduled report (${esc(rangeLabel(rangeKey))}).</p>
    ${kpisTable}
    ${tasksHtml}
    ${goalsHtml}
    ${habitsHtml}
    ${projectsHtml}
    ${journalHtml}
    ${widgetsHtml}
    <div style="margin-top:32px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08);text-align:center">
      <a href="${esc(appUrl)}" style="background:#7c3aed;color:#fff;padding:10px 22px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;display:inline-block">Open LevelUp →</a>
      <p style="font-size:10px;color:#64748b;margin:14px 0 0">You're receiving this because you scheduled "${esc(reportName)}" in LevelUp. Manage in Reports → Schedule.</p>
    </div>
  </div>
</body></html>`;
}

/**
 * One pass over every user with scheduled reports. Returns aggregate stats.
 */
export async function processScheduledReports(): Promise<{ usersChecked: number; emailsSent: number; errors: number }> {
  const startMs = Date.now();
  const stats = { usersChecked: 0, emailsSent: 0, errors: 0 };
  const db = await getDb();
  if (!db) {
    console.warn('[scheduled-reports] DB not available, skipping');
    return stats;
  }

  let rows: UserAppData[];
  try {
    rows = await db.select().from(userAppData);
  } catch (e) {
    console.error('[scheduled-reports] Failed to query user_app_data:', e);
    stats.errors++;
    return stats;
  }

  const now = new Date();
  const appUrl = (process.env.VITE_OAUTH_PORTAL_URL || 'https://levelupnow.tools').replace(/\/+$/, '');

  for (const row of rows) {
    stats.usersChecked++;
    const prefs = safeParse<any>(row.prefs, null);
    if (!prefs || !Array.isArray(prefs.savedReports) || prefs.savedReports.length === 0) continue;

    // Filter to due reports up front so we don't parse blobs for users
    // who have nothing scheduled.
    const due: SavedReport[] = prefs.savedReports.filter((r: SavedReport) => isReportDue(r.schedule, now));
    if (due.length === 0) continue;

    // Look up the user's email
    let userEmail: string | null = null;
    let userName = 'there';
    try {
      const [u] = await db.select({ email: users.email, name: users.name }).from(users).where(eq(users.id, row.userId)).limit(1);
      if (u && u.email) {
        userEmail = u.email;
        if (u.name) userName = u.name.split(' ')[0] || 'there';
      }
    } catch { /* fall through */ }
    if (!userEmail) continue;

    // Parse the user's data blobs once for all due reports
    const blobs: UserBlobs = {
      tasks: safeParse<Task[]>(row.tasks, []),
      goals: safeParse<Goal[]>(row.goals, []),
      habits: safeParse<Habit[]>(row.habits, []),
      journal: safeParse<Journal[]>(row.journal, []),
      projects: safeParse<Project[]>(row.projects, []),
    };

    let prefsChanged = false;
    for (const report of due) {
      try {
        const html = renderReportEmailHtml({
          reportName: report.name || 'LevelUp Report',
          rangeKey: report.range || '30d',
          sections: report.sections || { tasks: true, goals: true, habits: true, focus: true, journal: true, projects: true },
          widgets: report.widgets,
          blobs,
          appUrl,
          userName,
        });
        const ok = await sendEmail({
          to: userEmail,
          subject: `📊 ${report.name || 'LevelUp Report'} — ${now.toLocaleDateString()}`,
          html,
          senderUserId: null,
          recipientUserId: row.userId,
        });
        if (ok) {
          stats.emailsSent++;
          report.schedule = report.schedule || {};
          report.schedule.lastSentISO = now.toISOString();
          prefsChanged = true;
        } else {
          stats.errors++;
        }
      } catch (e) {
        console.error(`[scheduled-reports] Failed for user ${row.userId} report "${report.name}":`, e);
        stats.errors++;
      }
    }

    // Persist updated lastSentISO so we don't re-send on the next hourly tick
    if (prefsChanged) {
      try {
        await db.update(userAppData)
          .set({ prefs: JSON.stringify(prefs) })
          .where(eq(userAppData.userId, row.userId));
      } catch (e) {
        console.error(`[scheduled-reports] Failed to persist lastSentISO for user ${row.userId}:`, e);
        stats.errors++;
      }
    }
  }

  const durationMs = Date.now() - startMs;
  await insertScheduledTaskLog({
    taskName: 'scheduled-reports',
    emailsSent: stats.emailsSent,
    ownerNotified: 0,
    durationMs,
    error: stats.errors > 0 ? `${stats.errors} error(s)` : null,
  }).catch(() => {});

  if (stats.emailsSent > 0 || stats.errors > 0) {
    console.log(`[scheduled-reports] checked=${stats.usersChecked} sent=${stats.emailsSent} errors=${stats.errors} duration=${durationMs}ms`);
  }
  return stats;
}

/**
 * Start the hourly scheduler. Idempotent — safe to call once at boot.
 * Runs ~30s after startup (let migrations + listeners settle), then every hour.
 */
let _schedulerStarted = false;
export function startScheduledReportsCron(): void {
  if (_schedulerStarted) return;
  _schedulerStarted = true;
  const HOUR_MS = 60 * 60 * 1000;
  setTimeout(() => {
    processScheduledReports().catch(err => console.error('[scheduled-reports] initial run failed:', err));
    setInterval(() => {
      processScheduledReports().catch(err => console.error('[scheduled-reports] tick failed:', err));
    }, HOUR_MS);
  }, 30_000);
  console.log('[scheduled-reports] cron registered — first run in 30s, then hourly');
}
