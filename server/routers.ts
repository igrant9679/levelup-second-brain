import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
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

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts,
  // all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
});

export type AppRouter = typeof appRouter;
