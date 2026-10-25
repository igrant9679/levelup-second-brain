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
import { publicProcedure, protectedProcedure, adminProcedure, router } from '../_core/trpc';
import { sendEmail } from '../_core/sendEmail';
import { assertOwner } from '../_core/ownerGuard';
import { appOrigin } from '../_core/appOrigin';


// ─── Email helpers ────────────────────────────────────────────────────────────
function buildInviteEmailHtml(opts: {
  inviterName: string;
  inviteeName: string | null;
  email: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
}): string {
  const h = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);
  const greeting = opts.inviteeName ? `Hi ${h(opts.inviteeName)},` : 'Hi there,';
  const roleLabel = opts.role === 'admin' ? 'Admin' : 'Member';
  const expiry = opts.expiresAt.toLocaleDateString('en-US', { dateStyle: 'long' });
  return `
    <p>${greeting}</p>
    <p><strong>${h(opts.inviterName)}</strong> has invited you to join <strong>LevelUp</strong> as a <strong>${roleLabel}</strong>.</p>
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
      // Owner only (every invited teammate is an admin, so admin is not a trust boundary).
      await assertOwner(ctx.user);
      const existingUser = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (existingUser) throw new TRPCError({ code: 'CONFLICT', message: 'That email already has a LevelUp account.' });
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

      // Send invite email (non-fatal if SMTP not configured). The link always
      // uses the app's own origin, never one supplied by the browser.
      const inviteUrl = `${appOrigin()}/invite/${token}`;
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
    .query(async ({ ctx }) => {
      await assertOwner(ctx.user);
      return await db.getAllTeamInvites();
    }),

  // ── Admin: delete invite ──────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx.user);
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
      await assertOwner(ctx.user);
      const allInvites = await db.getAllTeamInvites();
      const invite = allInvites.find(i => i.id === input.id);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot resend an already accepted invite' });

      const newToken = randomBytes(32).toString('hex');
      const newExpiresAt = new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000);
      const updated = await db.resendTeamInvite(input.id, newToken, newExpiresAt);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to resend invite' });

      // Re-send invite email with new link (non-fatal)
      const inviteUrl = `${appOrigin()}/invite/${newToken}`;
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
      const token = input.token.trim();
      const invite = await db.getTeamInviteByToken(token);
      if (!invite) {
        // Most common cause: the invite was RESENT (resend regenerates the
        // token, so an earlier email's link stops working) or it was deleted.
        // Log the token prefix + total invite count so the cause is visible in
        // the logs without exposing the full token.
        try {
          const all = await db.getAllTeamInvites();
          console.warn(`[teamInvites.validate] No invite for token ${token.slice(0, 8)}… (${all.length} invite(s) exist). Likely replaced by a newer invite (resend) or deleted.`);
        } catch { /* best-effort logging only */ }
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'This invite link is no longer valid — it was most likely replaced by a newer invite (resending an invite generates a fresh link) or removed. Ask your admin to resend the invite, then use the link from the most recent email.',
        });
      }
      if (invite.accepted) throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This invite has already been used — your account already exists. Use the Sign in option with this email and the password you set.',
      });
      if (new Date() > invite.expiresAt) throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This invite has expired. Ask your admin to resend it.',
      });
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
      const invite = await db.getTeamInviteByToken(input.token.trim());
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'This invite link is no longer valid — it may have been replaced by a newer invite or removed. Ask your admin to resend it.' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used — your account already exists. Use the Sign in option instead.' });
      if (new Date() > invite.expiresAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired. Ask your admin to resend it.' });

      const passwordHash = await bcrypt.hash(input.password, 12);
      const { getDb } = await import('../db');
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const { users } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');

      let userId: number;
      try {
        const [existing] = await dbConn.select().from(users).where(eq(users.email, invite.email)).limit(1);

        if (existing) {
          // Never let an invite replace an existing account's password, name
          // or role: that would let whoever holds the invite link take it over.
          throw new TRPCError({ code: 'CONFLICT', message: 'This email already has a LevelUp account. Use Sign in (or Forgot password) instead.' });
        } else {
          // openId is varchar(64) — token is 64 hex chars, so truncate to fit
          const openId = `inv:${invite.token.slice(0, 60)}`;
          await dbConn.insert(users).values({
            openId,
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
      } catch (dbErr: any) {
        if (dbErr instanceof TRPCError) throw dbErr;
        console.error('[teamInvites.accept] DB error creating user:', dbErr);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create account. Please try again or contact support.' });
      }

      await db.acceptTeamInvite(input.token, userId);
      // Log account creation activity (best-effort)
      db.logActivity(userId, 'account_created', 'user', input.name).catch(() => {});
      return { success: true, email: invite.email };
    }),
});
