/**
 * Automation rule engine — Phase 1.
 *
 * Runs every 15 minutes (idempotent cron). Walks every enabled rule per
 * user, evaluates the trigger, applies the action to matched tasks. Uses
 * the existing user_app_data.tasks JSON blob so changes ride the same
 * sync path as user edits. lastFiredAt is updated when a rule modifies
 * at least one task in the current pass.
 *
 * Triggers
 *   task_overdue_today  — matches native tasks where status != Done and
 *                         due < today
 *   task_status_done    — matches native tasks that flipped to Done since
 *                         the rule's lastFiredAt (or since user_app_data's
 *                         updatedAt if lastFiredAt is null)
 *   external_status     — matches external_tasks where status matches
 *                         triggerConfig.statusEquals (case-insensitive)
 *
 * Actions
 *   set_my_day      — actionConfig.on (default true)
 *   add_tag         — actionConfig.tag (string, idempotent)
 *   set_priority    — actionConfig.priority ('High'|'Medium'|'Low')
 *
 * External-task actions write to external_task_overrides (myDay,
 * localTags, localPriority) since LevelUp can't edit source fields.
 */

import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { userAppData, externalTasks, externalTaskOverrides, automationRules, type AutomationRule } from "../../drizzle/schema";

interface NativeTask {
  id?: number | string;
  title?: string;
  status?: string;
  priority?: string;
  due?: string | null;
  completedAt?: string | null;
  myDay?: boolean;
  tags?: string[];
}

function ymd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

interface RuleStats { matched: number; modified: number; errors: string[] }

async function applyActionToNativeTask(
  t: NativeTask,
  rule: AutomationRule,
  cfg: Record<string, unknown>,
): Promise<boolean> {
  let modified = false;
  if (rule.action === 'set_my_day') {
    const want = cfg.on !== false; // default true
    if (!!t.myDay !== want) { t.myDay = want; modified = true; }
  } else if (rule.action === 'add_tag') {
    const tag = String(cfg.tag || '').trim();
    if (tag) {
      const tags = Array.isArray(t.tags) ? t.tags : [];
      if (!tags.includes(tag)) { tags.push(tag); t.tags = tags; modified = true; }
    }
  } else if (rule.action === 'set_priority') {
    const pri = String(cfg.priority || '').trim();
    if (pri && t.priority !== pri) { t.priority = pri; modified = true; }
  }
  return modified;
}

async function runRuleForUser(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  rule: AutomationRule,
): Promise<RuleStats> {
  const stats: RuleStats = { matched: 0, modified: 0, errors: [] };
  const trigCfg = safeParse<Record<string, unknown>>(rule.triggerConfig, {});
  const actCfg = safeParse<Record<string, unknown>>(rule.actionConfig, {});
  const today = ymd();

  if (rule.trigger === 'task_overdue_today' || rule.trigger === 'task_status_done') {
    // Native task triggers — load + mutate user_app_data.tasks blob.
    const [row] = await db.select().from(userAppData).where(eq(userAppData.userId, rule.userId)).limit(1);
    if (!row) return stats;
    const tasks = safeParse<NativeTask[]>(row.tasks, []);
    if (!Array.isArray(tasks)) return stats;
    const lastFired = rule.lastFiredAt ? new Date(rule.lastFiredAt).getTime() : 0;

    let anyModified = false;
    for (const t of tasks) {
      let matches = false;
      if (rule.trigger === 'task_overdue_today') {
        if (t.status !== 'Done' && t.status !== 'Someday' && t.due && t.due < today) matches = true;
      } else if (rule.trigger === 'task_status_done') {
        if (t.status === 'Done') {
          const c = t.completedAt ? new Date(t.completedAt).getTime() : 0;
          if (c > lastFired) matches = true;
        }
      }
      if (!matches) continue;
      stats.matched++;
      const modified = await applyActionToNativeTask(t, rule, actCfg);
      if (modified) { stats.modified++; anyModified = true; }
    }
    if (anyModified) {
      await db.update(userAppData).set({ tasks: JSON.stringify(tasks) }).where(eq(userAppData.userId, rule.userId));
    }
  } else if (rule.trigger === 'external_status') {
    const wantStatus = String(trigCfg.statusEquals || '').toLowerCase().trim();
    if (!wantStatus) return stats;
    const ext = await db.select().from(externalTasks).where(eq(externalTasks.userId, rule.userId));
    for (const e of ext) {
      if (e.removedAt) continue;
      if (String(e.status || '').toLowerCase().trim() !== wantStatus) continue;
      stats.matched++;
      // Write to override
      const set: Record<string, unknown> = {};
      if (rule.action === 'set_my_day') set.myDay = (actCfg.on !== false) ? 1 : 0;
      else if (rule.action === 'add_tag') {
        const tag = String(actCfg.tag || '').trim();
        if (!tag) continue;
        // Read existing tags to dedupe.
        const [existing] = await db.select().from(externalTaskOverrides)
          .where(and(eq(externalTaskOverrides.userId, rule.userId), eq(externalTaskOverrides.source, e.source), eq(externalTaskOverrides.externalId, e.externalId)))
          .limit(1);
        const tags = existing?.localTags ? String(existing.localTags).split(',').map(t => t.trim()).filter(Boolean) : [];
        if (tags.includes(tag)) continue;
        tags.push(tag);
        set.localTags = tags.join(',');
      } else if (rule.action === 'set_priority') {
        const pri = String(actCfg.priority || '').trim();
        if (!pri) continue;
        set.localPriority = pri;
      }
      if (!Object.keys(set).length) continue;
      await db.insert(externalTaskOverrides).values({
        userId: rule.userId, source: e.source, externalId: e.externalId,
        myDay: rule.action === 'set_my_day' ? ((actCfg.on !== false) ? 1 : 0) : 0,
        localTags: rule.action === 'add_tag' ? (set.localTags as string) : null,
        localPriority: rule.action === 'set_priority' ? (set.localPriority as string) : null,
      }).onDuplicateKeyUpdate({ set });
      stats.modified++;
    }
  }
  return stats;
}

export async function processAutomations(opts?: { userId?: number }): Promise<{
  rulesEvaluated: number; matched: number; modified: number;
}> {
  const db = await getDb();
  if (!db) return { rulesEvaluated: 0, matched: 0, modified: 0 };
  const where = opts?.userId
    ? and(eq(automationRules.userId, opts.userId), eq(automationRules.enabled, 1))
    : eq(automationRules.enabled, 1);
  const rules = await db.select().from(automationRules).where(where);
  let matched = 0, modified = 0;
  for (const rule of rules) {
    try {
      const stats = await runRuleForUser(db, rule);
      matched += stats.matched; modified += stats.modified;
      if (stats.matched > 0) {
        await db.update(automationRules)
          .set({ lastFiredAt: sql`CURRENT_TIMESTAMP`, fireCount: sql`${automationRules.fireCount} + ${stats.matched}`, lastError: null })
          .where(eq(automationRules.id, rule.id));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[automations] rule ${rule.id} failed:`, msg);
      await db.update(automationRules).set({ lastError: msg.slice(0, 4000) }).where(eq(automationRules.id, rule.id));
    }
  }
  console.log(`[automations] pass complete: ${rules.length} rules, ${matched} matched, ${modified} modified`);
  return { rulesEvaluated: rules.length, matched, modified };
}

let _autoStarted = false;
export function startAutomationCron(): void {
  if (_autoStarted) return;
  _autoStarted = true;
  const FIFTEEN_MIN = 15 * 60 * 1000;
  setTimeout(() => {
    processAutomations().catch(err => console.error('[automations] initial run failed:', err));
    setInterval(() => {
      processAutomations().catch(err => console.error('[automations] tick failed:', err));
    }, FIFTEEN_MIN);
  }, 90_000);
  console.log('[automations] cron registered — first run in 90s, then every 15min');
}
