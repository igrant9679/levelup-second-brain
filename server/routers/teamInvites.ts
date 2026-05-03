/**
 * teamInvites router
 * Admin-only: create / list / delete invite links.
 * Public:     validate token + accept invite (set password and create account).
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as db from '../db';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';

// ─── Guard: admin only ────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

export const teamInvitesRouter = router({
  // ── Admin: create invite ──────────────────────────────────────────────────
  create: adminProcedure
    .input(z.object({
      email: z.string().email().max(320),
      name: z.string().max(128).optional(),
      role: z.enum(['user', 'admin']).default('user'),
      expiryDays: z.number().int().min(1).max(30).default(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000);
      const invite = await db.createTeamInvite({
        invitedBy: ctx.user.id,
        email: input.email,
        name: input.name ?? null,
        role: input.role,
        token,
        expiresAt,
      });
      if (!invite) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create invite' });
      return invite;
    }),

  // ── Admin: list all invites ───────────────────────────────────────────────
  list: adminProcedure
    .query(async () => {
      return await db.getAllTeamInvites();
    }),

   // ── Admin: delete invite ────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      // Admins can delete any invite
      const allInvites = await db.getAllTeamInvites();
      const invite = allInvites.find(i => i.id === input.id);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      return await db.deleteTeamInvite(input.id, invite.invitedBy);
    }),

  // ── Admin: resend invite (regenerate token + extend expiry) ──────────────
  resend: adminProcedure
    .input(z.object({
      id: z.number().int(),
      expiryDays: z.number().int().min(1).max(30).default(7),
    }))
    .mutation(async ({ input }) => {
      const allInvites = await db.getAllTeamInvites();
      const invite = allInvites.find(i => i.id === input.id);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot resend an already accepted invite' });
      const newToken = randomBytes(32).toString('hex');
      const newExpiresAt = new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000);
      const updated = await db.resendTeamInvite(input.id, newToken, newExpiresAt);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to resend invite' });
      return updated;
    }),

  // ── Public: validate token (used on the accept-invite page) ──────────────
  validate: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const invite = await db.getTeamInviteByToken(input.token);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found or already used' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used' });
      if (new Date() > invite.expiresAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired' });
      // Return safe subset (no token in response)
      return { email: invite.email, name: invite.name, role: invite.role, expiresAt: invite.expiresAt };
    }),

  // ── Public: accept invite — create account with password ─────────────────
  accept: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      name: z.string().min(1).max(128),
      password: z.string().min(8).max(128),
    }))
    .mutation(async ({ input }) => {
      const invite = await db.getTeamInviteByToken(input.token);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used' });
      if (new Date() > invite.expiresAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired' });

      const passwordHash = await bcrypt.hash(input.password, 12);

      // Create the user — use email as openId since they don't have Manus OAuth
      const { getDb } = await import('../db');
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const { users } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      // Check if user with this email already exists
      const [existing] = await dbConn.select().from(users).where(eq(users.email, invite.email)).limit(1);
      let userId: number;

      if (existing) {
        // Update existing user with password and role
        await dbConn.update(users)
          .set({ name: input.name, passwordHash, role: invite.role, updatedAt: new Date() })
          .where(eq(users.id, existing.id));
        userId = existing.id;
      } else {
        // Create new user — openId = 'invite:' + token (unique, not a real Manus openId)
        await dbConn.insert(users).values({
          openId: `invite:${invite.token}`,
          name: input.name,
          email: invite.email,
          loginMethod: 'invite',
          role: invite.role,
          passwordHash,
          lastSignedIn: new Date(),
        });
        const [created] = await dbConn.select().from(users).where(eq(users.email, invite.email)).limit(1);
        userId = created.id;
      }

      // Mark invite as accepted
      await db.acceptTeamInvite(input.token, userId);

      return { success: true, email: invite.email };
    }),
});
