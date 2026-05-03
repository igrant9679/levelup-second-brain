/**
 * teamInvites router
 * Admin-only: create / list / delete / resend invite links.
 * Public:     validate token + accept invite (set password and create account).
 *
 * Email delivery: uses the existing sendEmail helper (SMTP via connected OAuth account).
 * If no sender is configured the invite still succeeds — the link is shown in the UI.
 */
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as db from '../db';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { sendEmail } from '../_core/sendEmail';

// ─── Guard: admin only ────────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== 'admin') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({ ctx });
});

// ─── Email helpers ────────────────────────────────────────────────────────────
function buildInviteEmailHtml(opts: {
  inviterName: string;
  inviteeName: string | null;
  email: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): string {
  const greeting = opts.inviteeName ? `Hi ${opts.inviteeName},` : 'Hi there,';
  const roleLabel = opts.role === 'admin' ? 'Admin' : 'Member';
  const expiry = opts.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' });
  return `
    <p>${greeting}</p>
    <p><strong>${opts.inviterName}</strong> has invited you to join <strong>LevelUp</strong> as a <strong>${roleLabel}</strong>.</p>
    <p>Click the button below to set up your account. This link expires on <strong>${expiry}</strong>.</p>
    <p style="text-align:center;margin:28px 0">
      <a href="${opts.inviteUrl}"
         style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;display:inline-block">
        Accept Invitation
      </a>
    </p>
    <p style="font-size:12px;color:#888">Or copy this link: <a href="${opts.inviteUrl}">${opts.inviteUrl}</a></p>
    <p style="font-size:12px;color:#888">If you weren't expecting this invitation, you can safely ignore this email.</p>
  `;
}

async function sendInviteEmail(opts: {
  to: string;
  inviteeName: string | null;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
  isResend?: boolean;
}): Promise<void> {
  const subject = opts.isResend
    ? `Reminder: You've been invited to LevelUp`
    : `You've been invited to join LevelUp`;
  const html = buildInviteEmailHtml({
    inviterName: opts.inviterName,
    inviteeName: opts.inviteeName,
    email: opts.to,
    role: opts.role,
    inviteUrl: opts.inviteUrl,
    expiresAt: opts.expiresAt,
  });
  const sent = await sendEmail({ to: opts.to, subject, html, senderUserId: null });
  if (!sent) {
    // Non-fatal: log but don't throw — the invite was still created
    console.warn(`[teamInvites] Email not sent to ${opts.to} (no SMTP sender configured or send failed)`);
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const teamInvitesRouter = router({
  // ── Admin: create invite ──────────────────────────────────────────────────
  create: adminProcedure
    .input(z.object({
      email: z.string().email().max(320),
      name: z.string().max(128).optional(),
      role: z.enum(['user', 'admin']).default('user'),
      expiryDays: z.number().int().min(1).max(30).default(7),
      /** Frontend must pass window.location.origin so we can build the correct invite URL */
      origin: z.string().url().optional(),
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

      // Send invite email (non-fatal if SMTP not configured)
      const origin = input.origin ?? 'https://levelupnow.vip';
      const inviteUrl = `${origin}/invite/${token}`;
      await sendInviteEmail({
        to: input.email,
        inviteeName: input.name ?? null,
        inviterName: ctx.user.name ?? 'Your admin',
        role: input.role,
        inviteUrl,
        expiresAt,
      });

      return { ...invite, inviteUrl };
    }),

  // ── Admin: list all invites ───────────────────────────────────────────────
  list: adminProcedure
    .query(async () => {
      return await db.getAllTeamInvites();
    }),

  // ── Admin: delete invite ──────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ input }) => {
      const allInvites = await db.getAllTeamInvites();
      const invite = allInvites.find(i => i.id === input.id);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      return await db.deleteTeamInvite(input.id, invite.invitedBy);
    }),

  // ── Admin: resend invite (regenerate token + extend expiry + re-email) ────
  resend: adminProcedure
    .input(z.object({
      id: z.number().int(),
      expiryDays: z.number().int().min(1).max(30).default(7),
      origin: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const allInvites = await db.getAllTeamInvites();
      const invite = allInvites.find(i => i.id === input.id);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot resend an already accepted invite' });

      const newToken = randomBytes(32).toString('hex');
      const newExpiresAt = new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000);
      const updated = await db.resendTeamInvite(input.id, newToken, newExpiresAt);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to resend invite' });

      // Re-send invite email with new link (non-fatal)
      const origin = input.origin ?? 'https://levelupnow.vip';
      const inviteUrl = `${origin}/invite/${newToken}`;
      await sendInviteEmail({
        to: invite.email,
        inviteeName: invite.name ?? null,
        inviterName: ctx.user.name ?? 'Your admin',
        role: invite.role,
        inviteUrl,
        expiresAt: newExpiresAt,
        isResend: true,
      });

      return { ...updated, inviteUrl };
    }),

  // ── Public: validate token (used on the accept-invite page) ──────────────
  validate: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const invite = await db.getTeamInviteByToken(input.token);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found or already used' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used' });
      if (new Date() > invite.expiresAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired' });
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
      const { getDb } = await import('../db');
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const { users } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      const [existing] = await dbConn.select().from(users).where(eq(users.email, invite.email)).limit(1);
      let userId: number;

      if (existing) {
        await dbConn.update(users)
          .set({ name: input.name, passwordHash, role: invite.role, updatedAt: new Date() })
          .where(eq(users.id, existing.id));
        userId = existing.id;
      } else {
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

      await db.acceptTeamInvite(input.token, userId);
      return { success: true, email: invite.email };
    }),
});
