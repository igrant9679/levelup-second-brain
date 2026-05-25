/**
 * Daily morning-digest email.
 *
 * Sends a per-user summary of today's plate across:
 *   - native LevelUp tasks (D.tasks via user_app_data.tasks blob)
 *   - external tasks (external_tasks table) from Smartsheet + NiftyPM
 *
 * Each user's digest is opted-in via prefs.dailyDigest:
 *   { enabled: true, time: "07:00", lastSentDate: "2026-05-25" }
 *
 * The cron ticks every 15 minutes. On each tick it walks every user_app_data
 * row, checks whether the configured time has passed in the user's local day
 * (server-local for now; per-user timezones is a follow-up), and sends if
 * lastSentDate !== today. The sendNow tRPC mutation bypasses the time check
 * for manual testing.
 */

import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { userAppData, externalTasks, externalTaskOverrides, users } from "../../drizzle/schema";
import { sendEmail } from "./sendEmail";

interface DigestPref {
  enabled?: boolean;
  time?: string;          // "HH:MM" server-local for now
  lastSentDate?: string;  // YYYY-MM-DD
  recipientEmail?: string | null; // override; default = user email
}

interface NativeTask {
  id?: number | string;
  title?: string;
  status?: string;
  priority?: string;
  due?: string;
  myDay?: boolean;
  project?: string;
  projectId?: number | string | null;
  completedAt?: string | null;
}

interface DigestRow {
  source: 'personal' | 'CF' | 'LSI';
  title: string;
  status?: string | null;
  priority?: string | null;
  due?: string | null;
  url?: string | null;
  overdue: boolean;
  myDay: boolean;
}

function ymd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parsePrefs(prefsCol: string | null): Record<string, unknown> {
  if (!prefsCol) return {};
  try { return JSON.parse(prefsCol) as Record<string, unknown>; } catch { return {}; }
}

function isExtDone(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase().trim();
  return s === 'done' || s === 'complete' || s === 'completed' || s === 'closed' || s === 'cancelled';
}

/**
 * Build the row set for one user's digest. Returns rows grouped + sorted.
 * Includes: anything overdue, anything due today, anything flagged myDay.
 */
async function buildRowsForUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  tasksBlob: string | null,
): Promise<DigestRow[]> {
  const today = ymd();
  const rows: DigestRow[] = [];

  // Native tasks from the JSON blob.
  let nativeTasks: NativeTask[] = [];
  try { nativeTasks = JSON.parse(tasksBlob ?? '[]') as NativeTask[]; } catch { nativeTasks = []; }
  for (const t of nativeTasks) {
    if (t.status === 'Done' || t.status === 'Someday') continue;
    const due = t.due || null;
    const overdue = !!(due && due < today);
    const dueToday = due === today;
    if (!overdue && !dueToday && !t.myDay) continue;
    rows.push({
      source: 'personal',
      title: t.title || '(untitled)',
      status: t.status ?? null,
      priority: t.priority ?? null,
      due,
      url: null,
      overdue,
      myDay: !!t.myDay,
    });
  }

  // External tasks (Smartsheet + Nifty).
  const ext = await db.select().from(externalTasks).where(eq(externalTasks.userId, userId));
  const overrides = await db.select().from(externalTaskOverrides).where(eq(externalTaskOverrides.userId, userId));
  const ovMap = new Map<string, typeof overrides[number]>();
  for (const o of overrides) ovMap.set(`${o.source}:${o.externalId}`, o);

  for (const e of ext) {
    if (e.removedAt) continue;
    if (isExtDone(e.status)) continue;
    const ov = ovMap.get(`${e.source}:${e.externalId}`);
    if (ov?.tombstoned) continue;
    const due = (ov?.localDue) || e.due;
    const overdue = !!(due && due < today);
    const dueToday = due === today;
    const myDay = !!ov?.myDay;
    if (!overdue && !dueToday && !myDay) continue;
    rows.push({
      source: e.source === 'smartsheet' ? 'CF' : (e.source === 'nifty' ? 'LSI' : 'personal'),
      title: e.title,
      status: e.status,
      priority: (ov?.localPriority) || e.priority,
      due,
      url: e.externalUrl,
      overdue,
      myDay,
    });
  }

  // Sort: overdue first (oldest first), then today, then my-day-only, then by title.
  rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
    if (!a.due && b.due) return 1;
    if (a.due && !b.due) return -1;
    return (a.title || '').localeCompare(b.title || '');
  });
  return rows;
}

function rowTableHtml(rows: DigestRow[], label: string, color: string): string {
  if (!rows.length) return '';
  const tbody = rows.slice(0, 50).map(r => {
    const titleCell = r.url
      ? `<a href="${r.url}" style="color:#1f6feb;text-decoration:none">${escHtml(r.title)}</a>`
      : escHtml(r.title);
    const dueCell = r.due ? (r.overdue ? `<span style="color:#dc2626;font-weight:600">${escHtml(r.due)} (overdue)</span>` : escHtml(r.due)) : '<span style="color:#9ca3af">—</span>';
    const priCell = r.priority ? `<span style="padding:1px 6px;border-radius:3px;background:${priColor(r.priority)};color:#fff;font-size:11px">${escHtml(r.priority)}</span>` : '';
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:13px">${titleCell}${r.myDay?' ☀':''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;color:#6b7280">${escHtml(r.status || '')}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;white-space:nowrap">${priCell}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-size:12px;white-space:nowrap">${dueCell}</td>
    </tr>`;
  }).join('');
  const overflow = rows.length > 50 ? `<tr><td colspan="4" style="padding:6px 8px;font-size:11px;color:#9ca3af;text-align:center">… and ${rows.length - 50} more</td></tr>` : '';
  return `<h2 style="font-size:15px;margin:20px 0 6px;color:${color};border-bottom:2px solid ${color};padding-bottom:4px">${escHtml(label)} <span style="color:#9ca3af;font-weight:400;font-size:12px">(${rows.length})</span></h2>
    <table style="width:100%;border-collapse:collapse">
      <thead><tr style="background:#f9fafb">
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Task</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Status</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Pri</th>
        <th style="padding:6px 8px;text-align:left;font-size:11px;color:#6b7280;text-transform:uppercase">Due</th>
      </tr></thead>
      <tbody>${tbody}${overflow}</tbody>
    </table>`;
}

function priColor(pri: string): string {
  const p = pri.toLowerCase();
  if (p === 'high' || p === 'urgent') return '#ef4444';
  if (p === 'medium') return '#f59e0b';
  if (p === 'low') return '#10b981';
  return '#6b7280';
}

function escHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

/**
 * Render the full email body for one user. Returns null when there's
 * literally nothing to surface (so we skip sending and don't spam an empty
 * digest).
 */
function renderDigestHtml(name: string, rows: DigestRow[]): string | null {
  if (!rows.length) return null;
  const overdueN = rows.filter(r => r.overdue).length;
  const cfRows = rows.filter(r => r.source === 'CF');
  const lsiRows = rows.filter(r => r.source === 'LSI');
  const personalRows = rows.filter(r => r.source === 'personal');
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const headline = overdueN > 0
    ? `${overdueN} overdue, ${rows.length - overdueN} more on today's plate`
    : `${rows.length} item${rows.length === 1 ? '' : 's'} on today's plate`;
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif;margin:0;padding:24px;background:#f3f4f6;color:#111827">
<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">${escHtml(today)}</div>
  <h1 style="font-size:22px;margin:0 0 4px;color:#111827">Good morning, ${escHtml(name)}</h1>
  <div style="font-size:14px;color:${overdueN > 0 ? '#dc2626' : '#374151'};margin-bottom:8px">${escHtml(headline)}</div>
  <div style="display:flex;gap:8px;font-size:11px;color:#6b7280;margin-bottom:8px">
    <span><strong style="color:#374151">${personalRows.length}</strong> Personal</span>
    <span>·</span>
    <span><strong style="color:#374151">${cfRows.length}</strong> CommunityForce</span>
    <span>·</span>
    <span><strong style="color:#374151">${lsiRows.length}</strong> LSI Media</span>
  </div>
  ${rowTableHtml(personalRows, '🟢 Personal', '#10b981')}
  ${rowTableHtml(cfRows, '🔵 CommunityForce (Smartsheet)', '#1f6feb')}
  ${rowTableHtml(lsiRows, '🟣 LSI Media (NiftyPM)', '#9333ea')}
  <p style="font-size:11px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
    Open LevelUp: <a href="https://levelupnow.tools/" style="color:#1f6feb">levelupnow.tools</a> · Disable this digest in Settings → Notifications
  </p>
</div></body></html>`;
}

function shouldSendNow(pref: DigestPref): boolean {
  if (!pref.enabled) return false;
  const now = new Date();
  const today = ymd(now);
  if (pref.lastSentDate === today) return false;
  const [hh, mm] = (pref.time || '07:00').split(':').map(n => parseInt(n, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  // Send when the local time is at or past the configured time. The 15-min
  // tick + the lastSentDate guard keeps it once-per-day.
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  return now.getTime() >= target.getTime();
}

/**
 * Run one pass over every user_app_data row. Returns counts.
 * opts.userId limits to a single user (for the sendNow mutation).
 * opts.force skips the time check (for manual sends).
 */
export async function processDailyDigest(opts?: { userId?: number; force?: boolean }): Promise<{
  scanned: number; sent: number; skipped: number; errors: number;
}> {
  const db = await getDb();
  if (!db) return { scanned: 0, sent: 0, skipped: 0, errors: 0 };

  const rows = opts?.userId
    ? await db.select().from(userAppData).where(eq(userAppData.userId, opts.userId))
    : await db.select().from(userAppData);

  let sent = 0, skipped = 0, errors = 0;
  for (const row of rows) {
    try {
      const prefs = parsePrefs(row.prefs);
      const digestPref = (prefs.dailyDigest as DigestPref | undefined) || {};
      if (!opts?.force && !shouldSendNow(digestPref)) { skipped++; continue; }
      if (!digestPref.enabled && !opts?.force) { skipped++; continue; }

      const [userRow] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
      if (!userRow) { skipped++; continue; }
      const recipient = digestPref.recipientEmail || userRow.email;
      if (!recipient) { skipped++; continue; }

      const digestRows = await buildRowsForUser(db, row.userId, row.tasks);
      const name = (userRow.name || (userRow.email || '').split('@')[0] || 'there').split(' ')[0];
      const html = renderDigestHtml(name, digestRows);
      if (!html) {
        // Nothing on the plate today — don't send an empty email but DO mark
        // lastSentDate so we don't reconsider every 15 min for the rest of the day.
        const newPrefs = { ...prefs, dailyDigest: { ...digestPref, lastSentDate: ymd() } };
        await db.update(userAppData).set({ prefs: JSON.stringify(newPrefs) }).where(eq(userAppData.userId, row.userId));
        skipped++;
        continue;
      }

      const ok = await sendEmail({
        to: recipient,
        subject: `☀ Daily plate — ${digestRows.length} item${digestRows.length === 1 ? '' : 's'}${digestRows.filter(r => r.overdue).length ? ` (${digestRows.filter(r => r.overdue).length} overdue)` : ''}`,
        html,
        text: `${digestRows.length} items on today's plate. Open https://levelupnow.tools/`,
        senderUserId: null,
        recipientUserId: row.userId,
      });
      if (ok) {
        sent++;
        const newPrefs = { ...prefs, dailyDigest: { ...digestPref, lastSentDate: ymd() } };
        await db.update(userAppData).set({ prefs: JSON.stringify(newPrefs) }).where(eq(userAppData.userId, row.userId));
      } else {
        errors++;
        console.error(`[daily-digest] sendEmail returned false for user ${row.userId}`);
      }
    } catch (err) {
      errors++;
      console.error(`[daily-digest] user ${row.userId} failed:`, err);
    }
  }
  console.log(`[daily-digest] pass complete: scanned=${rows.length} sent=${sent} skipped=${skipped} errors=${errors}`);
  return { scanned: rows.length, sent, skipped, errors };
}

let _digestStarted = false;
/**
 * Start the 15-minute cron. Idempotent. First tick 90s after boot to give
 * migrations + listeners time to settle.
 */
export function startDailyDigestCron(): void {
  if (_digestStarted) return;
  _digestStarted = true;
  const QUARTER_HOUR = 15 * 60 * 1000;
  setTimeout(() => {
    processDailyDigest().catch(err => console.error('[daily-digest] initial run failed:', err));
    setInterval(() => {
      processDailyDigest().catch(err => console.error('[daily-digest] tick failed:', err));
    }, QUARTER_HOUR);
  }, 90_000);
  console.log('[daily-digest] cron registered — first run in 90s, then every 15min');
}
