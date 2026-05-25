import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { eq, asc } from "drizzle-orm";
import { users } from "../drizzle/schema";
import { getDb } from "./db";
import { oauthSyncRouter } from "./routers/oauth-sync";
import { helpRouter } from "./routers/help";
import { onenoteRouter } from "./routers/onenote";
import { emailAuthRouter } from "./routers/emailAuth";
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
import { weeklyReviewRouter } from "./routers/weeklyReview";

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts,
  // all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(async (opts) => {
      const u = opts.ctx.user;
      if (!u) return u;
      // Owner promotion: if this user is the configured owner (OWNER_OPEN_ID env)
      // OR they are the first registered user (lowest id) and no admin exists yet,
      // ensure they are role='admin'. Persisted to the DB so the role sticks.
      try {
        if (u.role !== "admin") {
          const isConfiguredOwner = !!ENV.ownerOpenId && u.openId === ENV.ownerOpenId;
          let isFirstUser = false;
          if (!isConfiguredOwner) {
            const db = await getDb();
            if (db) {
              const first = await db.select({ id: users.id }).from(users).orderBy(asc(users.id)).limit(1);
              isFirstUser = first.length > 0 && first[0].id === u.id;
            }
          }
          if (isConfiguredOwner || isFirstUser) {
            const db = await getDb();
            if (db) {
              await db.update(users).set({ role: "admin" }).where(eq(users.id, u.id));
            }
            return { ...u, role: "admin" as const };
          }
        }
      } catch (err) {
        console.warn("[auth.me] owner-promotion check failed:", err);
      }
      return u;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
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
  weeklyReview: weeklyReviewRouter,
});

export type AppRouter = typeof appRouter;
