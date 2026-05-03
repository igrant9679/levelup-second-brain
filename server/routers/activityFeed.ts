/**
 * activityFeed router
 * - log: protectedProcedure — any authenticated user can log their own activity
 * - getTeamFeed: adminProcedure — paginated feed for all team members
 * - getMemberFeed: adminProcedure — feed for a specific member
 * - getMemberStats: adminProcedure — action counts per type for a member
 * - getTeamMembers: adminProcedure — list all users with last sign-in
 */
import { z } from 'zod';
import * as db from '../db';
import { protectedProcedure, adminProcedure, router } from '../_core/trpc';


export const activityFeedRouter = router({
  /**
   * Log an activity event for the currently authenticated user.
   */
  log: protectedProcedure
    .input(
      z.object({
        action: z.string().max(64),
        entityType: z.string().max(32).optional(),
        entityTitle: z.string().max(255).optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db.logActivity(
        ctx.user.id,
        input.action,
        input.entityType,
        input.entityTitle,
        input.metadata
      );
      return { success: true };
    }),

  /**
   * Get paginated activity feed for all team members (admin only).
   */
  getTeamFeed: adminProcedure
    .input(
      z.object({
        limit: z.number().int().min(1).max(200).default(50),
        since: z.union([z.date(), z.string()]).transform(v => (typeof v === 'string' ? new Date(v) : v)).optional(),
      })
    )
    .query(async ({ input }) => {
      const members = await db.getTeamMembers();
      const userIds = members.map(m => m.id);
      if (userIds.length === 0) return { feed: [], members: [] };
      const feed = await db.getActivityFeed(userIds, input.limit, input.since);
      return { feed, members };
    }),

  /**
   * Get activity feed for a specific member (admin only).
   */
  getMemberFeed: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        limit: z.number().int().min(1).max(200).default(30),
        since: z.union([z.date(), z.string()]).transform(v => (typeof v === 'string' ? new Date(v) : v)).optional(),
      })
    )
    .query(async ({ input }) => {
      const feed = await db.getActivityFeed([input.userId], input.limit, input.since);
      return { feed };
    }),

  /**
   * Get action counts per type for a member (admin only).
   */
  getMemberStats: adminProcedure
    .input(
      z.object({
        userId: z.number().int(),
        since: z.union([z.date(), z.string()]).transform(v => (typeof v === 'string' ? new Date(v) : v)).optional(),
      })
    )
    .query(async ({ input }) => {
      const summary = await db.getActivitySummary(input.userId, input.since);
      return { summary };
    }),

  /**
   * List all team members with last sign-in (admin only).
   */
  getTeamMembers: adminProcedure.query(async () => {
    const members = await db.getTeamMembers();
    return { members };
  }),
});
