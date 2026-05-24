/**
 * Recurrence engine.
 *
 * Replaces the freeform string `recurring` field that lived inside task.raw
 * with a structured rule on tasks.recurrenceRule (added in migration 0032).
 *
 * Rule shape (JSON-encoded mediumtext):
 *   {
 *     freq: 'daily' | 'weekly' | 'monthly' | 'yearly',
 *     interval: number,                  // every N days/weeks/months/years
 *     byDay?: Array<0..6>,               // weekly only: 0=Sun … 6=Sat
 *     until?: string,                    // YYYY-MM-DD inclusive
 *     count?: number,                    // max total instances generated
 *     keepAhead?: number,                // how many future instances to maintain (default 5)
 *   }
 *
 * On each tick we look at every task with a non-null recurrenceRule, count
 * how many future instances already exist (children with the same template
 * marker), and create more until `keepAhead` is satisfied.
 *
 * Instances are stored in tasks (not a separate table) with:
 *   - status:'Not Started', myDay:0
 *   - new taskId = Date.now() + counter
 *   - raw._recurrenceParentId = the template's taskId  (so we can count)
 *   - raw._recurrenceInstance = true                   (skip when generating)
 *
 * This is intentionally minimal — no RRULE library, no edge-case handling
 * for DST transitions or month-end (Feb 30 → Feb 28). If the user needs
 * full iCal RRULE semantics later, this is the place to swap in `rrule`.
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { tasksTable, type TaskRow } from "../../drizzle/schema";

interface RecurrenceRule {
  freq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval?: number;
  byDay?: number[];
  until?: string;
  count?: number;
  keepAhead?: number;
}

function safeParseRule(s: string | null): RecurrenceRule | null {
  if (!s) return null;
  try {
    const r = JSON.parse(s) as RecurrenceRule;
    if (!r.freq || !['daily', 'weekly', 'monthly', 'yearly'].includes(r.freq)) return null;
    return r;
  } catch { return null; }
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseYmd(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Next occurrence strictly after `from`, given the rule's anchor date. */
function nextOccurrence(rule: RecurrenceRule, anchor: Date, from: Date): Date {
  const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1); // strictly after

  switch (rule.freq) {
    case 'daily':
      // Walk forward in interval-day steps from anchor until past `from`.
      {
        const diff = Math.ceil((d.getTime() - anchor.getTime()) / (interval * 86400000));
        const next = new Date(anchor);
        next.setDate(anchor.getDate() + diff * interval);
        if (next < d) next.setDate(next.getDate() + interval);
        return next;
      }
    case 'weekly':
      // If byDay specified, find the next matching weekday after `from`.
      if (rule.byDay && rule.byDay.length) {
        const wantSet = new Set(rule.byDay);
        for (let i = 0; i < 8 * interval; i++) {
          const cand = new Date(d);
          cand.setDate(d.getDate() + i);
          if (wantSet.has(cand.getDay())) return cand;
        }
      }
      // Else: anchor day-of-week, +interval weeks
      {
        const next = new Date(anchor);
        while (next <= from) next.setDate(next.getDate() + 7 * interval);
        return next;
      }
    case 'monthly':
      {
        const next = new Date(anchor);
        while (next <= from) next.setMonth(next.getMonth() + interval);
        return next;
      }
    case 'yearly':
      {
        const next = new Date(anchor);
        while (next <= from) next.setFullYear(next.getFullYear() + interval);
        return next;
      }
  }
}

/**
 * Generate up to `keepAhead` future instances for one template task.
 * Returns the number of instances created.
 */
async function generateForTemplate(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  template: TaskRow,
): Promise<number> {
  const rule = safeParseRule(template.recurrenceRule);
  if (!rule) return 0;

  const keepAhead = rule.keepAhead ?? 5;
  const untilDate = rule.until ? parseYmd(rule.until) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Anchor date: the template's `due` (or `startDate`, or today).
  const anchor = parseYmd(template.due) ?? parseYmd(template.startDate) ?? today;

  // Count existing future instances of this template.
  const allChildren = await db.select().from(tasksTable)
    .where(and(eq(tasksTable.userId, template.userId), isNotNull(tasksTable.raw)));
  const existing = allChildren.filter(c => {
    if (!c.raw) return false;
    try {
      const raw = JSON.parse(c.raw) as { _recurrenceParentId?: string; _recurrenceInstance?: boolean };
      return raw._recurrenceParentId === template.taskId && raw._recurrenceInstance === true;
    } catch { return false; }
  });

  // Find the latest existing due so we generate after it.
  let cursor = today;
  for (const c of existing) {
    const cDue = parseYmd(c.due);
    if (cDue && cDue > cursor) cursor = cDue;
  }
  // If the anchor is in the future and no instances exist, seed from anchor-1d.
  if (existing.length === 0 && anchor > today) {
    cursor = new Date(anchor);
    cursor.setDate(cursor.getDate() - 1);
  }

  const needed = Math.max(0, keepAhead - existing.length);
  if (needed === 0) return 0;
  let created = 0;
  let countCap = rule.count ? rule.count - existing.length : Infinity;

  for (let i = 0; i < needed && countCap > 0; i++) {
    cursor = nextOccurrence(rule, anchor, cursor);
    if (untilDate && cursor > untilDate) break;

    const newTaskId = `r${Date.now()}${i}${template.id}`;
    const rawObj = template.raw ? safeJson(template.raw) : {};
    const newRaw = {
      ...rawObj,
      id: newTaskId,
      due: ymd(cursor),
      status: 'Not Started',
      myDay: false,
      completedAt: null,
      _recurrenceParentId: template.taskId,
      _recurrenceInstance: true,
      _recurrenceCreatedAt: new Date().toISOString(),
    };

    await db.insert(tasksTable).values({
      userId: template.userId,
      taskId: newTaskId,
      title: template.title,
      status: 'Not Started',
      priority: template.priority,
      due: ymd(cursor),
      startDate: ymd(cursor),
      projectId: template.projectId,
      clusterId: template.clusterId,
      myDay: 0,
      context: template.context,
      assignedTo: template.assignedTo,
      createdBy: template.createdBy,
      parentTaskId: template.parentTaskId,
      recurrenceRule: null, // instances don't recur — only the template does
      raw: JSON.stringify(newRaw),
    });
    created++;
    countCap--;
  }
  return created;
}

function safeJson(s: string): Record<string, unknown> {
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return {}; }
}

/**
 * One pass: process every template with a non-null recurrenceRule and ensure
 * keepAhead future instances exist for each.
 */
export async function processRecurrence(opts?: { userId?: number }): Promise<{
  templates: number; created: number;
}> {
  const db = await getDb();
  if (!db) return { templates: 0, created: 0 };

  const where = opts?.userId
    ? and(isNotNull(tasksTable.recurrenceRule), eq(tasksTable.userId, opts.userId))
    : isNotNull(tasksTable.recurrenceRule);
  const templates = await db.select().from(tasksTable).where(where);

  let created = 0;
  for (const t of templates) {
    try {
      created += await generateForTemplate(db, t);
    } catch (err) {
      console.warn(`[recurrence] template ${t.taskId} failed:`, err);
    }
  }
  console.log(`[recurrence] pass complete: ${templates.length} templates, ${created} instances created`);
  return { templates: templates.length, created };
}

let _recStarted = false;

/**
 * Start the recurrence cron. Once per day at ~02:00 server time is plenty
 * for "keep 5 instances ahead" purposes. We approximate with a 24h interval
 * triggered 5 minutes after boot (so a deploy doesn't have to wait a day).
 */
export function startRecurrenceCron(): void {
  if (_recStarted) return;
  _recStarted = true;
  const DAY_MS = 24 * 60 * 60 * 1000;
  setTimeout(() => {
    processRecurrence().catch(err => console.error('[recurrence] initial run failed:', err));
    setInterval(() => {
      processRecurrence().catch(err => console.error('[recurrence] tick failed:', err));
    }, DAY_MS);
  }, 5 * 60 * 1000);
  console.log('[recurrence] cron registered — first run in 5min, then every 24h');
}
