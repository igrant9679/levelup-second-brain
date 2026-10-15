/**
 * Demo-account cleanup (2026-10-14) — workspace OWNER only.
 *
 * Before build -199, switching accounts on one browser leaked the owner's
 * prefs into the demo account's server row (stored light theme, AI briefings
 * with real company content, note folders, weather ZIP, a saved report, the
 * daily-digest email switched ON), and before -198 the demo's seeded records
 * named the owner ("Idris Grant") instead of the persona. This puts the demo's
 * prefs back to the seed (keeping its assistant chat, agent settings, coach
 * and workspace layout) and renames the owner's display name to the persona
 * on its tasks and calendar events. Preview first (apply:false), then apply.
 *
 * Guard rails: owner only; never the caller's own account; never an admin
 * account. Close the demo in every browser before applying — an open demo tab
 * saves prefs whole and would put the old ones back.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { userAppData, users } from "../../drizzle/schema";
import { isOwnerCtxUser, readEntityArray, writeEntityArray } from "./appData";

/** The 18 prefs keys the demo was seeded with (2026-09-07). */
const DEMO_SEED_PREFS: Record<string, unknown> = {
  darkMode: true, compact: false, accent: "#3B82F6", density: "normal", workspaceName: "LevelUp",
  firstDayOfWeek: "monday", dateFormat: "MM/DD/YYYY", timeFormat: "12h", language: "en", autoSave: true,
  keyboardShortcuts: true, workingHours: { start: 9, end: 17 },
  workingHoursByDow: { "0": { nonWorking: true }, "6": { nonWorking: true } },
  pipelineQuota: { amount: 250000, periodLabel: "FY26", coverageTarget: 3 },
  taskContexts: ["Deep Work", "Calls", "Admin", "Errands", "Learning"],
  miniWeekStrip: true, notesMode: "notes",
  aiTopics: ["product strategy", "personal productivity", "team leadership"],
};
/** Keys the demo has legitimately used since — kept as they are. */
const KEEP = ["aiChat", "aiAgent", "workspace", "coach"];
const PERSON_FIELDS = ["assignee", "assignedTo", "createdBy", "owner"];

function parse(raw: string | null | undefined): any { if (!raw) return null; try { return JSON.parse(raw); } catch { return null; } }
function countStrings(v: unknown, needle: string): number {
  if (typeof v === "string") return v.includes(needle) ? 1 : 0;
  if (Array.isArray(v)) return v.reduce((n: number, x) => n + countStrings(x, needle), 0);
  if (v && typeof v === "object") return Object.values(v).reduce((n: number, x) => n + countStrings(x, needle), 0);
  return 0;
}

export const demoAdminRouter = router({
  cleanup: protectedProcedure
    .input(z.object({ email: z.string().email(), persona: z.string().min(2).max(80).default("Jordan Ellis"), apply: z.boolean().default(false) }))
    .mutation(async ({ ctx, input }) => {
      if (!(await isOwnerCtxUser(ctx.user))) throw new TRPCError({ code: "FORBIDDEN", message: "Only the workspace owner can do this." });
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [target] = await db.select().from(users).where(eq(users.email, input.email.toLowerCase().trim())).limit(1);
      if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "No account with that email." });
      if (target.id === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "That is your own account." });
      if (target.role === "admin") throw new TRPCError({ code: "BAD_REQUEST", message: "Refusing: that account is an admin, not a demo account." });
      const ownerName = String(ctx.user.name || "").trim();
      if (!ownerName || ownerName === input.persona) throw new TRPCError({ code: "BAD_REQUEST", message: "Persona must differ from your display name." });

      const [row] = await db.select().from(userAppData).where(eq(userAppData.userId, target.id)).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "That account has no saved data." });

      // prefs → seed + kept keys
      const oldPrefs = parse(row.prefs) || {};
      const nextPrefs: Record<string, unknown> = JSON.parse(JSON.stringify(DEMO_SEED_PREFS));
      KEEP.forEach((k) => { if (oldPrefs[k] !== undefined) nextPrefs[k] = oldPrefs[k]; });
      const droppedKeys = Object.keys(oldPrefs).filter((k) => !(k in DEMO_SEED_PREFS) && !KEEP.includes(k));

      // owner's name → persona on tasks (relational) and calendar attendees
      let renamed = 0;
      const tasks = await readEntityArray(db, target.id, "tasks");
      tasks.forEach((t: any) => PERSON_FIELDS.forEach((f) => { if (t && t[f] === ownerName) { t[f] = input.persona; renamed++; } }));
      const cal = parse(row.calEvents) || [];
      (Array.isArray(cal) ? cal : []).forEach((e: any) => {
        if (e && Array.isArray(e.attendees)) e.attendees = e.attendees.map((a: unknown) => { if (a === ownerName) { renamed++; return input.persona; } return a; });
      });

      // anything still naming the owner, per entity (reported, not rewritten)
      const leftover: Record<string, number> = {};
      const blobs: Record<string, unknown> = { tasks, notes: await readEntityArray(db, target.id, "notes"), prefs: nextPrefs, calEvents: cal };
      for (const k of ["projects", "programs", "goals", "habits", "journal", "contacts", "opportunities", "clusters", "mindmaps"] as const) blobs[k] = parse((row as any)[k]);
      Object.entries(blobs).forEach(([k, v]) => { const n = countStrings(v, ownerName); if (n) leftover[k] = n; });

      const report = {
        account: { id: target.id, name: target.name, email: target.email },
        prefsKeysBefore: Object.keys(oldPrefs).length, prefsKeysAfter: Object.keys(nextPrefs).length, droppedKeys,
        hadStoredTheme: !!oldPrefs.theme, hadBriefings: !!oldPrefs.briefings, dailyDigestWasOn: !!(oldPrefs.dailyDigest && oldPrefs.dailyDigest.enabled),
        renamed, leftoverMentionsOfYou: leftover, applied: false,
      };
      if (!input.apply) return report;

      await db.update(userAppData).set({ prefs: JSON.stringify(nextPrefs), calEvents: JSON.stringify(cal) }).where(eq(userAppData.userId, target.id));
      if (renamed) await writeEntityArray(db, target.id, "tasks", tasks);
      return { ...report, applied: true };
    }),
});
