/**
 * Weekly review email.
 *
 * Friday afternoon (or whenever the user picks) summary email:
 *   - What shipped this week (Done with completedAt in the last 7 days)
 *   - What's still open and overdue (carryover risk)
 *   - What's coming next week (due in next 7 days)
 *   - Per-source split (Personal / CF / LSI)
 *   - AI-generated reflection on themes (if the user has an AI key)
 *
 * Reuses the daily-digest plumbing (15-min cron tick, prefs in
 * user_app_data.prefs.weeklyReview, sendEmail for delivery). Pref shape:
 *   prefs.weeklyReview = {
 *     enabled: bool,
 *     dayOfWeek: 0..6 (Sun..Sat, default 5=Fri),
 *     time: "HH:MM",
 *     lastSentDate: "YYYY-MM-DD",
 *     recipientEmail: string | null,
 *   }
 */

import { and, eq, gte, isNotNull } from "drizzle-orm";
import { getDb } from "../db";
import { userAppData, externalTasks, externalTaskOverrides, users, type UserAppData } from "../../drizzle/schema";
import { sendEmail } from "./sendEmail";

interface WeeklyPref {
  enabled?: boolean;
  dayOfWeek?: number;
  time?: string;
  lastSentDate?: string;
  recipientEmail?: string | null;
}

interface NativeTask {
  id?: number | string;
  title?: string;
  status?: string;
  priority?: string;
  due?: string;
  completedAt?: string | null;
  project?: string;
  projectId?: number | string | null;
  myDay?: boolean;
}

interface WeeklyRow {
  source: 'personal' | 'CF' | 'LSI';
  title: string;
  status?: string | null;
  priority?: string | null;
  due?: string | null;
  completedAt?: string | null;
  url?: string | null;
  project?: string | null;
}

function ymd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parsePrefs(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

function isExtDone(status: string | null | undefined): boolean {
  const s = (status || '').toLowerCase().trim();
  return s === 'done' || s === 'complete' || s === 'completed' || s === 'closed' || s === 'cancelled';
}

function escHtml(s: string): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]);
}

function priColor(pri: string | null | undefined): string {
  const p = (pri || '').toLowerCase();
  if (p === 'high' || p === 'urgent') return '#ef4444';
  if (p === 'medium') return '#f59e0b';
  if (p === 'low') return '#10b981';
  return '#6b7280';
}

interface BuiltRows {
  shipped: WeeklyRow[];        // Done this past week
  overdue: WeeklyRow[];        // Open and past due
  nextWeek: WeeklyRow[];       // Open, due in next 7 days
  totalOpen: number;
}

/** Build the four week-scoped buckets for one user. */
async function buildRowsForUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
  tasksBlob: string | null,
): Promise<BuiltRows> {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayStr = ymd(today);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 7);
  const weekStartStr = ymd(weekStart);
  const horizon = new Date(today); horizon.setDate(today.getDate() + 7);
  const horizonStr = ymd(horizon);

  const shipped: WeeklyRow[] = [];
  const overdue: WeeklyRow[] = [];
  const nextWeek: WeeklyRow[] = [];
  let totalOpen = 0;

  let nativeTasks: NativeTask[] = [];
  try { nativeTasks = JSON.parse(tasksBlob ?? '[]') as NativeTask[]; } catch { nativeTasks = []; }

  for (const t of nativeTasks) {
    if (t.status === 'Done') {
      const c = (t.completedAt || '').slice(0, 10);
      if (c >= weekStartStr && c <= todayStr) {
        shipped.push({ source: 'personal', title: t.title || '(untitled)', status: 'Done', priority: t.priority || null, completedAt: c, project: t.project || null });
      }
      continue;
    }
    if (t.status === 'Someday') continue;
    totalOpen++;
    const due = t.due || null;
    if (due && due < todayStr) {
      overdue.push({ source: 'personal', title: t.title || '(untitled)', status: t.status || null, priority: t.priority || null, due, project: t.project || null });
    } else if (due && due <= horizonStr) {
      nextWeek.push({ source: 'personal', title: t.title || '(untitled)', status: t.status || null, priority: t.priority || null, due, project: t.project || null });
    }
  }

  // External tasks. Done rows are NOT filtered at pull time anymore
  // (migration 0036) — the cron stamps external_tasks.completedAt when
  // LevelUp first sees a row become done, preserving it across subsequent
  // polls. We treat completedAt within the past week as "shipped" — same
  // semantics as native tasks.
  const ext = await db.select().from(externalTasks).where(eq(externalTasks.userId, userId));
  const overrides = await db.select().from(externalTaskOverrides).where(eq(externalTaskOverrides.userId, userId));
  const ovMap = new Map<string, typeof overrides[number]>();
  for (const o of overrides) ovMap.set(`${o.source}:${o.externalId}`, o);

  for (const e of ext) {
    if (e.removedAt) continue;
    const ov = ovMap.get(`${e.source}:${e.externalId}`);
    if (ov?.tombstoned) continue;
    const src: WeeklyRow['source'] = e.source === 'smartsheet' ? 'CF' : (e.source === 'nifty' ? 'LSI' : 'personal');
    const due = (ov?.localDue) || e.due;
    if (isExtDone(e.status)) {
      // Shipped this week if completedAt falls in window. completedAt could
      // also be older — if the row stayed Done for weeks, don't surface it
      // every week.
      if (e.completedAt) {
        const cYmd = ymd(new Date(e.completedAt));
        if (cYmd >= weekStartStr && cYmd <= todayStr) {
          shipped.push({ source: src, title: e.title, status: e.status, priority: (ov?.localPriority) || e.priority, completedAt: cYmd, url: e.externalUrl, project: e.projectLabel });
        }
      }
      continue; // done rows never go into overdue / nextWeek
    }
    totalOpen++;
    const row: WeeklyRow = { source: src, title: e.title, status: e.status, priority: (ov?.localPriority) || e.priority, due, url: e.externalUrl, project: e.projectLabel };
    if (due && due < todayStr) overdue.push(row);
    else if (due && due <= horizonStr) nextWeek.push(row);
  }

  // Sort each list deterministically.
  shipped.sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''));
  overdue.sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  nextWeek.sort((a, b) => (a.due || '').localeCompare(b.due || ''));
  return { shipped, overdue, nextWeek, totalOpen };
}

/**
 * Ask the AI for a 3-4 sentence reflection on the week. Optional — only
 * fires when the user has an AI key configured at the workspace level
 * (system_settings.aiKey_*). Returns empty string on any failure so the
 * email still sends.
 */
interface AIBlock {
  reflection: string;
  picks: Array<{ title: string; reason: string; source: string }>;
}

async function generateAIBlock(rows: BuiltRows): Promise<AIBlock> {
  try {
    const { callAIProvider } = await import("./aiProviders");
    const compact = {
      shipped: rows.shipped.slice(0, 20).map(r => ({ s: r.source, t: r.title, c: r.completedAt })),
      overdue: rows.overdue.slice(0, 20).map(r => ({ s: r.source, t: r.title, due: r.due })),
      nextWeek: rows.nextWeek.slice(0, 20).map(r => ({ s: r.source, t: r.title, due: r.due, pri: r.priority })),
    };
    const sys = `You are a productivity coach writing a brief weekly reflection for a COO/CEO running two companies (CommunityForce + LSI Media).

Read the week's shipped / overdue / next-week task lists and return STRICTLY a JSON object (no markdown, no prose) with two keys:
1. "reflection": 3-4 sentences (under 80 words) that acknowledge the most meaningful wins, flag the single biggest carryover risk, and name the one highest-leverage thing to start next week.
2. "picks": an array of exactly 3 objects, each {"title":"<exact task title from input>","source":"<personal|CF|LSI>","reason":"<one short sentence why this matters next week>"}. Choose from the overdue + nextWeek arrays. Pick high-leverage items, not busy work. Use exact titles as they appear in the input.`;
    const res = await callAIProvider({ provider: 'manus', systemPrompt: sys, userContent: JSON.stringify(compact), maxTokens: 600, jsonMode: true });
    const raw = String((res as { result?: string; text?: string }).result || (res as { text?: string }).text || '').trim();
    // Tolerate fenced code blocks + leading prose
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { reflection: raw.slice(0, 800), picks: [] };
    try {
      const parsed = JSON.parse(m[0]) as { reflection?: string; picks?: AIBlock['picks'] };
      return {
        reflection: String(parsed.reflection || '').trim().slice(0, 800),
        picks: Array.isArray(parsed.picks) ? parsed.picks.slice(0, 4).map(p => ({
          title: String(p.title || '').slice(0, 200),
          source: String(p.source || ''),
          reason: String(p.reason || '').slice(0, 200),
        })) : [],
      };
    } catch {
      return { reflection: raw.slice(0, 800), picks: [] };
    }
  } catch (err) {
    console.warn('[weekly-review] AI block skipped:', (err as Error).message);
    return { reflection: '', picks: [] };
  }
}

function rowsHtml(rows: WeeklyRow[], emptyText: string): string {
  if (!rows.length) return `<p style="font-size:12px;color:#9ca3af;font-style:italic;margin:6px 0">${emptyText}</p>`;
  const sourceBadge = (s: WeeklyRow['source']) => {
    if (s === 'CF') return '<span style="padding:1px 5px;background:#1f6feb;color:#fff;font-size:9px;font-weight:600;border-radius:3px;margin-right:4px">CF</span>';
    if (s === 'LSI') return '<span style="padding:1px 5px;background:#9333ea;color:#fff;font-size:9px;font-weight:600;border-radius:3px;margin-right:4px">LSI</span>';
    return '';
  };
  return `<table style="width:100%;border-collapse:collapse">${rows.slice(0, 40).map(r => {
    const titleCell = r.url
      ? `<a href="${r.url}" style="color:#1f6feb;text-decoration:none">${escHtml(r.title)}</a>`
      : escHtml(r.title);
    const meta: string[] = [];
    if (r.due) meta.push(`due ${escHtml(r.due)}`);
    if (r.completedAt) meta.push(`✓ ${escHtml(r.completedAt)}`);
    if (r.project) meta.push(`📁 ${escHtml(r.project)}`);
    return `<tr><td style="padding:5px 0;font-size:13px;border-bottom:1px solid #f3f4f6">
      ${sourceBadge(r.source)}${titleCell}
      ${r.priority ? `<span style="padding:1px 5px;background:${priColor(r.priority)};color:#fff;font-size:10px;border-radius:3px;margin-left:6px">${escHtml(r.priority)}</span>` : ''}
      <div style="font-size:10px;color:#9ca3af;margin-top:2px">${meta.join(' · ')}</div>
    </td></tr>`;
  }).join('')}${rows.length > 40 ? `<tr><td style="padding:6px;font-size:10px;color:#9ca3af;text-align:center">… and ${rows.length - 40} more</td></tr>` : ''}</table>`;
}

function renderWeeklyHtml(name: string, rows: BuiltRows, ai: AIBlock): string {
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
  const weekRange = `${weekStart.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  const picksHtml = ai.picks.length ? `
  <div style="background:#fef3c7;border-left:3px solid #f59e0b;padding:12px 16px;border-radius:0 6px 6px 0;margin:8px 0 16px;font-size:13px;color:#451a03">
    <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#92400e;margin-bottom:6px">✨ Suggested focus for next week</div>
    <ol style="margin:0;padding-left:20px;line-height:1.6">${ai.picks.map(p => {
      const badge = p.source === 'CF' ? '<span style="padding:1px 5px;background:#1f6feb;color:#fff;font-size:9px;font-weight:600;border-radius:3px;margin-right:4px">CF</span>' :
                    p.source === 'LSI' ? '<span style="padding:1px 5px;background:#9333ea;color:#fff;font-size:9px;font-weight:600;border-radius:3px;margin-right:4px">LSI</span>' : '';
      return `<li><strong>${badge}${escHtml(p.title)}</strong><br><span style="font-size:12px;color:#78350f;font-style:italic">${escHtml(p.reason)}</span></li>`;
    }).join('')}</ol>
  </div>` : '';
  return `<!DOCTYPE html>
<html><body style="font-family:-apple-system,'Segoe UI',Inter,Arial,sans-serif;margin:0;padding:24px;background:#f3f4f6;color:#111827">
<div style="max-width:720px;margin:0 auto;background:#fff;border-radius:10px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.08)">
  <div style="font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:2px">Weekly review · ${escHtml(weekRange)}</div>
  <h1 style="font-size:22px;margin:0 0 4px;color:#111827">Week recap, ${escHtml(name)}</h1>
  <div style="font-size:14px;color:#374151;margin-bottom:10px">
    <strong style="color:#10b981">${rows.shipped.length}</strong> shipped ·
    <strong style="color:#dc2626">${rows.overdue.length}</strong> overdue ·
    <strong style="color:#1f6feb">${rows.nextWeek.length}</strong> due in next 7 days
  </div>
  ${ai.reflection ? `<div style="background:#eef2ff;border-left:3px solid #6366f1;padding:12px 16px;border-radius:0 6px 6px 0;margin:16px 0 8px;font-size:13px;color:#1e1b4b;line-height:1.55">${escHtml(ai.reflection)}</div>` : ''}
  ${picksHtml}
  <h2 style="font-size:15px;color:#10b981;border-bottom:2px solid #10b981;padding-bottom:4px;margin:20px 0 6px">✅ Shipped this week <span style="color:#9ca3af;font-weight:400;font-size:12px">(${rows.shipped.length})</span></h2>
  ${rowsHtml(rows.shipped, "Nothing marked done this week — make sure you're stamping completedAt as you ship.")}
  <h2 style="font-size:15px;color:#dc2626;border-bottom:2px solid #dc2626;padding-bottom:4px;margin:20px 0 6px">⚠ Overdue / carryover <span style="color:#9ca3af;font-weight:400;font-size:12px">(${rows.overdue.length})</span></h2>
  ${rowsHtml(rows.overdue, 'Nothing overdue. Clean slate.')}
  <h2 style="font-size:15px;color:#1f6feb;border-bottom:2px solid #1f6feb;padding-bottom:4px;margin:20px 0 6px">📅 Next 7 days <span style="color:#9ca3af;font-weight:400;font-size:12px">(${rows.nextWeek.length})</span></h2>
  ${rowsHtml(rows.nextWeek, 'Nothing scheduled in the next 7 days.')}
  <p style="font-size:11px;color:#9ca3af;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">
    Open LevelUp: <a href="https://levelupnow.tools/" style="color:#1f6feb">levelupnow.tools</a> · Disable this review in Settings → Notifications · <em>"Shipped" timestamps for CF/LSI rows reflect when LevelUp first observed completion (not the source's actual completion time).</em>
  </p>
</div></body></html>`;
}

function shouldSendNow(pref: WeeklyPref): boolean {
  if (!pref.enabled) return false;
  const now = new Date();
  const today = ymd(now);
  if (pref.lastSentDate === today) return false;
  const targetDow = pref.dayOfWeek ?? 5;
  if (now.getDay() !== targetDow) return false;
  const [hh, mm] = (pref.time || '16:30').split(':').map(n => parseInt(n, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  return now.getTime() >= target.getTime();
}

/**
 * One pass. opts.userId scopes to one user; opts.force ignores the time
 * check (for the sendNow tRPC mutation).
 */
export async function processWeeklyReview(opts?: { userId?: number; force?: boolean }): Promise<{
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
      const wp = (prefs.weeklyReview as WeeklyPref | undefined) || {};
      if (!opts?.force && !shouldSendNow(wp)) { skipped++; continue; }
      if (!wp.enabled && !opts?.force) { skipped++; continue; }

      const [userRow] = await db.select().from(users).where(eq(users.id, row.userId)).limit(1);
      if (!userRow) { skipped++; continue; }
      const recipient = wp.recipientEmail || userRow.email;
      if (!recipient) { skipped++; continue; }

      const built = await buildRowsForUser(db, row.userId, row.tasks);
      // Send the review even on a quiet week — knowing "nothing happened" is
      // also a signal. Only skip if the user has literally no open tasks AND
      // shipped nothing AND has nothing upcoming.
      const totallyEmpty = !built.shipped.length && !built.overdue.length && !built.nextWeek.length && built.totalOpen === 0;
      if (totallyEmpty) {
        skipped++;
        const newPrefs = { ...prefs, weeklyReview: { ...wp, lastSentDate: ymd() } };
        await db.update(userAppData).set({ prefs: JSON.stringify(newPrefs) }).where(eq(userAppData.userId, row.userId));
        continue;
      }
      const aiBlock = await generateAIBlock(built);
      const name = (userRow.name || (userRow.email || '').split('@')[0] || 'there').split(' ')[0];
      const html = renderWeeklyHtml(name, built, aiBlock);
      const ok = await sendEmail({
        to: recipient,
        subject: `📊 Weekly review — ${built.shipped.length} shipped, ${built.overdue.length} overdue, ${built.nextWeek.length} ahead`,
        html,
        text: `Weekly review: ${built.shipped.length} shipped, ${built.overdue.length} overdue, ${built.nextWeek.length} in next 7 days. Open https://levelupnow.tools/`,
        senderUserId: null,
        recipientUserId: row.userId,
      });
      if (ok) {
        sent++;
        const newPrefs = { ...prefs, weeklyReview: { ...wp, lastSentDate: ymd() } };
        await db.update(userAppData).set({ prefs: JSON.stringify(newPrefs) }).where(eq(userAppData.userId, row.userId));
      } else {
        errors++;
        console.error(`[weekly-review] sendEmail returned false for user ${row.userId}`);
      }
    } catch (err) {
      errors++;
      console.error(`[weekly-review] user ${row.userId} failed:`, err);
    }
  }
  console.log(`[weekly-review] pass complete: scanned=${rows.length} sent=${sent} skipped=${skipped} errors=${errors}`);
  return { scanned: rows.length, sent, skipped, errors };
}

let _weeklyStarted = false;
/**
 * 30-min cron. Idempotent. First tick 120s after boot.
 */
export function startWeeklyReviewCron(): void {
  if (_weeklyStarted) return;
  _weeklyStarted = true;
  const HALF_HOUR = 30 * 60 * 1000;
  setTimeout(() => {
    processWeeklyReview().catch(err => console.error('[weekly-review] initial run failed:', err));
    setInterval(() => {
      processWeeklyReview().catch(err => console.error('[weekly-review] tick failed:', err));
    }, HALF_HOUR);
  }, 120_000);
  console.log('[weekly-review] cron registered — first run in 120s, then every 30min');
}
