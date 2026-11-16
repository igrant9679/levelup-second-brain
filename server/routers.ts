import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { eq } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { oauthSyncRouter } from "./routers/oauth-sync";
import { helpRouter } from "./routers/help";
import { onenoteRouter } from "./routers/onenote";
import { emailAuthRouter, reissueSessionCookie } from "./routers/emailAuth";
import { teamRouter } from "./routers/team";
import { userProfileRouter } from "./routers/userProfile";
import { aiRouter } from "./routers/ai";
import { wordImportRouter } from "./routers/wordImport";
import { bookmarksRouter } from "./routers/bookmarks";
import { newsRouter } from "./routers/news";
import { teamInvitesRouter } from "./routers/teamInvites";
import { activityFeedRouter } from "./routers/activityFeed";
import { pdfImportRouter } from "./routers/pdfImport";
import { appDataRouter } from "./routers/appData";
import { notesImportRouter } from "./routers/notesImport";
import { aiSettingsRouter } from "./routers/aiSettings";
import { imageMigrationRouter } from "./routers/imageMigration";
import { externalSourcesRouter } from "./routers/externalSources";
import { timeEntriesRouter } from "./routers/timeEntries";
import { taskMigrationsRouter } from "./routers/taskMigrations";
import { dailyDigestRouter } from "./routers/dailyDigest";
import { reportsScheduleRouter } from "./routers/reportsSchedule";
import { claimsRouter } from "./routers/claims";
import { noteVersionsRouter } from "./routers/noteVersions";
import { opsRouter } from "./routers/ops";
import { weeklyReviewRouter } from "./routers/weeklyReview";
import { customFieldsRouter } from "./routers/customFields";
import { automationsRouter } from "./routers/automations";
import { atlasRouter } from "./routers/atlas";
import { simplefinRouter } from "./routers/simplefin";
import { coachRouter } from "./routers/coach";
import { pmRouter } from "./routers/pm";
import { demoAdminRouter } from "./routers/demoAdmin";
import { workspaceRouter } from "./routers/workspace";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts,
  // all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      // Never send the password hash (or other secrets on the users row) to the browser.
      const raw = opts.ctx.user;
      if (!raw) {
        // Signed in, but the workspace this session belongs to is suspended or
        // closed (-278): say so, with the person's other workspaces, so the
        // app can offer to switch instead of showing the sign-in page.
        const inactive: any = (opts.ctx as any).inactiveUser;
        if (inactive) {
          const { myWorkspaces } = await import("./routers/workspace");
          return { workspaceInactive: true as const, wsStatus: String(inactive.wsStatus || "suspended"), name: inactive.name ?? null, email: inactive.email ?? null, workspaces: await myWorkspaces(inactive) } as any;
        }
        return raw;
      }
      const { passwordHash: _ph, tokenVersion: _tv, wsStatus: _ws, ...u } = raw as any;
      // Multi-workspace (-278): who you are HERE. The owner is the member the
      // workspace names (workspaces.ownerUserId) — not "the first account" —
      // and always has the admin role in it (persisted so the role sticks).
      let isOwner = false;
      try {
        const { isOwner: isWsOwner } = await import("./_core/ownerGuard");
        isOwner = await isWsOwner(raw as any);
        if (isOwner && u.role !== "admin") {
          const db = await getDb();
          if (db) await db.update(users).set({ role: "admin" }).where(eq(users.id, u.id));
          u.role = "admin";
        }
      } catch (err) {
        console.warn("[auth.me] owner check failed:", err);
      }
      // Only when the row has a workspace (the tests that predate workspaces don't).
      if (u.workspaceId === undefined) return u;
      try {
        const { getWorkspace } = await import("./_core/workspace");
        const { myWorkspaces } = await import("./routers/workspace");
        const ws = await getWorkspace(u.workspaceId);
        return {
          ...u,
          isOwner,
          isOperator: u.platformRole === "operator",
          workspace: ws ? { id: ws.id, name: ws.name, features: ws.features, branding: ws.branding, role: isOwner ? "owner" : u.role === "admin" ? "admin" : "member" } : null,
          workspaces: await myWorkspaces(raw),
        };
      } catch (err) {
        console.warn("[auth.me] workspace lookup failed:", err);
        return u;
      }
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
    /**
     * Sign out every other device (audit F20): bumps users.tokenVersion, so
     * every session cookie issued before now is refused, then gives THIS
     * device a fresh cookie with the new version (it stays signed in).
     */
    signOutEverywhere: protectedProcedure.mutation(async ({ ctx }) => {
      const { bumpTokenVersion } = await import("./db");
      const tv = await bumpTokenVersion(ctx.user.id);
      if (tv == null) return { success: false as const, error: "Database unavailable" };
      await reissueSessionCookie(ctx, ctx.user, tv);
      return { success: true as const };
    }),
  }),

  oauthSync: oauthSyncRouter,
  help: helpRouter,
  onenote: onenoteRouter,
  emailAuth: emailAuthRouter,
  team: teamRouter,
  userProfile: userProfileRouter,
  ai: aiRouter,
  wordImport: wordImportRouter,
  bookmarks: bookmarksRouter,
  news: newsRouter,
  teamInvites: teamInvitesRouter,
  activityFeed: activityFeedRouter,
  pdfImport: pdfImportRouter,
  appData: appDataRouter,
  notesImport: notesImportRouter,
  aiSettings: aiSettingsRouter,
  imageMigration: imageMigrationRouter,
  externalSources: externalSourcesRouter,
  timeEntries: timeEntriesRouter,
  taskMigrations: taskMigrationsRouter,
  dailyDigest: dailyDigestRouter,
  reportsSchedule: reportsScheduleRouter,
  claims: claimsRouter,
  noteVersions: noteVersionsRouter,
  ops: opsRouter,
  coach: coachRouter,
  pm: pmRouter,
  demoAdmin: demoAdminRouter,
  weeklyReview: weeklyReviewRouter,
  customFields: customFieldsRouter,
  automations: automationsRouter,
  atlas: atlasRouter,
  simplefin: simplefinRouter,
  workspace: workspaceRouter,
});

export type AppRouter = typeof appRouter;
