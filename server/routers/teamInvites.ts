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
import { rlHit, clientIp } from '../_core/rateLimit';
import { createUserSerialised } from '../_core/dbLock';
import { createHash } from 'crypto';
import { getWorkspace, invalidateWorkspace, membershipsOf, wsIdOf } from '../_core/workspace';

/**
 * Throttle the public invite endpoints (audit F19): per IP and per token, in
 * the persistent limiter (shared by every instance, kept across deploys).
 * Tokens are 256-bit, so this is about bcrypt CPU and noise, not guessing.
 */
async function throttleInvite(kind: 'validate' | 'accept', req: any, token: string): Promise<void> {
  const ip = clientIp(req);
  const t = createHash('sha256').update(token).digest('hex').slice(0, 32);
  const [ipLimit, tLimit, win] = kind === 'validate' ? [60, 30, 15 * 60_000] : [10, 5, 3600_000];
  if (!(await rlHit(`inv:${kind}:ip:${ip}`, ipLimit, win)) || !(await rlHit(`inv:${kind}:t:${t}`, tLimit, win))) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts with this invite. Wait a while and try again.' });
  }
}


// ─── Email helpers ────────────────────────────────────────────────────────────
function buildInviteEmailHtml(opts: {
  workspaceName?: string | null;
  asOwner?: boolean;
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
    <p><strong>${h(opts.inviterName)}</strong> has invited you to ${opts.asOwner ? 'set up and own' : 'join'} <strong>${h(opts.workspaceName || 'LevelUp')}</strong>${opts.workspaceName ? ' on LevelUp' : ''}${opts.asOwner ? '' : ` as a <strong>${roleLabel}</strong>`}.</p>
    <p>Click the button below to accept. If you already have a LevelUp account you will join with it; otherwise you will set one up. This link expires on <strong>${expiry}</strong>.</p>
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
  workspaceId?: number | null;
  workspaceName?: string | null;
  asOwner?: boolean;
  to: string;
  inviteeName: string | null;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresAt: Date;
  isResend?: boolean;
}): Promise<boolean> {
  const wsName = opts.workspaceName ? `${opts.workspaceName} on LevelUp` : 'LevelUp';
  const subject = opts.isResend
    ? `Reminder: You've been invited to ${wsName}`
    : `You've been invited to join ${wsName}`;
  const html = buildInviteEmailHtml({
    workspaceName: opts.workspaceName,
    asOwner: opts.asOwner,
    inviterName: opts.inviterName,
    inviteeName: opts.inviteeName,
    email: opts.to,
    role: opts.role,
    inviteUrl: opts.inviteUrl,
    expiresAt: opts.expiresAt,
  });
  const sent = await sendEmail({ to: opts.to, subject, html, senderUserId: null, workspaceId: opts.workspaceId ?? null, kind: "account" });
  if (!sent) {
    // Non-fatal: log but don't throw — the invite was still created
    console.warn(`[teamInvites] Email not sent to ${opts.to} (no SMTP sender configured or send failed)`);
  }
  return !!sent;
}

/**
 * Audit 3: what the inviter gets back. The link itself goes ONLY to the invited address (so
 * accepting proves that mailbox) — except for the platform operator, who may hand it over by
 * other means. The stored token is a hash and is never returned.
 */
async function inviteResult(ctx: any, row: any, inviteUrl: string, emailed: boolean) {
  const { token: _t, ...rest } = row || {};
  const { isOperator } = await import('../_core/workspace');
  const op = await isOperator(ctx.user as any).catch(() => false);
  return { ...rest, emailed, ...(op ? { inviteUrl } : {}) };
}
/** Invitations are email the platform sends: limited per workspace and counted as email (Audit 3). */
async function inviteBudget(ctx: any, wsId: number | null, key: string): Promise<void> {
  const w = wsId ?? 0;
  if (!(await rlHit(`invite:ws:${w}`, 30, 24 * 3_600_000)) || !(await rlHit(key, 5, 24 * 3_600_000))) {
    throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many invitations sent today. Please try again tomorrow.' });
  }
  await (await import('../_core/quota')).spendQuota(ctx.user, 'email');
}

/** The platform operator's invitation to the future OWNER of a new workspace. */
export async function sendWorkspaceOwnerInvite(opts: { workspaceId: number; workspaceName: string; to: string; inviteeName: string | null; inviterName: string; inviteUrl: string; expiresAt: Date }): Promise<boolean> {
  const html = buildInviteEmailHtml({ workspaceName: opts.workspaceName, asOwner: true, inviterName: opts.inviterName, inviteeName: opts.inviteeName, email: opts.to, role: "admin", inviteUrl: opts.inviteUrl, expiresAt: opts.expiresAt });
  // kind "account": nothing from any workspace is in it, so it may go through the platform's sender
  return sendEmail({ to: opts.to, subject: `Set up ${opts.workspaceName} on LevelUp`, html, senderUserId: null, workspaceId: opts.workspaceId, kind: "account" }).catch(() => false);
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
      const wsId = await wsIdOf(ctx.user as any);
      const ws = await getWorkspace(wsId);
      // Multi-workspace (-278): someone who already has a LevelUp login CAN be
      // invited — accepting adds this workspace to their login (it never
      // changes their password, name or role anywhere else). Only a person who
      // is already a member HERE is refused.
      const existingUser = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (existingUser) {
        if (wsId === null) throw new TRPCError({ code: 'CONFLICT', message: 'That email already has a LevelUp account.' });
        const here = (await membershipsOf(existingUser as any)).some(m => m.workspaceId === wsId);
        if (here) throw new TRPCError({ code: 'CONFLICT', message: 'That person is already a member of this workspace.' });
      }
      // The plan's head count (-279): members plus invitations still open.
      if (wsId) {
        const { seatCheck, seatMessage } = await import('../_core/billing');
        const seats = await seatCheck(wsId, { countInvites: true });
        if (!seats.ok) throw new TRPCError({ code: 'FORBIDDEN', message: seatMessage(seats) });
      }
      await inviteBudget(ctx, wsId, `invite:to:${wsId ?? 0}:${createHash('sha256').update(input.email.toLowerCase().trim()).digest('hex').slice(0, 32)}`);
      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000);
      const invite = await db.createTeamInvite({
        invitedBy: ctx.user.id,
        workspaceId: wsId ?? 1,
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
      const emailed = await sendInviteEmail({
        workspaceId: wsId, workspaceName: ws?.name ?? null,
        to: input.email,
        inviteeName: input.name ?? null,
        inviterName: ctx.user.name ?? 'Your admin',
        role: input.role,
        inviteUrl,
        expiresAt,
      });

      return await inviteResult(ctx, invite, inviteUrl, emailed);
    }),

  // ── Admin: list all invites ───────────────────────────────────────────────
  list: adminProcedure
    .query(async ({ ctx }) => {
      await assertOwner(ctx.user);
      // the stored token is a hash: never sent to the browser (Audit 3)
      return (await db.getAllTeamInvites(await wsIdOf(ctx.user as any))).map((r: any) => { const { token: _t, ...rest } = r || {}; return rest; });
    }),

  // ── Admin: delete invite ──────────────────────────────────────────────────
  delete: adminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwner(ctx.user);
      const allInvites = await db.getAllTeamInvites(await wsIdOf(ctx.user as any));
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
      const wsId = await wsIdOf(ctx.user as any);
      const ws = await getWorkspace(wsId);
      const allInvites = await db.getAllTeamInvites(wsId);
      const invite = allInvites.find(i => i.id === input.id);
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot resend an already accepted invite' });
      await inviteBudget(ctx, wsId, `invite:resend:${invite.id}`);
      // the plan's head count still applies (Audit 3: resend skipped it)
      if (wsId) {
        const { seatCheck, seatMessage } = await import('../_core/billing');
        const seats = await seatCheck(wsId, { countInvites: true, adding: 0 });
        if (!seats.ok) throw new TRPCError({ code: 'FORBIDDEN', message: seatMessage(seats) });
      }

      const newToken = randomBytes(32).toString('hex');
      const newExpiresAt = new Date(Date.now() + input.expiryDays * 24 * 60 * 60 * 1000);
      const updated = await db.resendTeamInvite(input.id, newToken, newExpiresAt);
      if (!updated) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to resend invite' });

      // Re-send invite email with new link (non-fatal)
      const inviteUrl = `${appOrigin()}/invite/${newToken}`;
      const emailed = await sendInviteEmail({
        workspaceId: wsId, workspaceName: ws?.name ?? null, asOwner: !!(invite as any).asOwner,
        to: invite.email,
        inviteeName: invite.name ?? null,
        inviterName: ctx.user.name ?? 'Your admin',
        role: invite.role,
        inviteUrl,
        expiresAt: newExpiresAt,
        isResend: true,
      });

      return await inviteResult(ctx, updated, inviteUrl, emailed);
    }),

  // ── Public: validate token (used on the accept-invite page) ──────────────
  validate: publicProcedure
    .input(z.object({ token: z.string().min(1).max(200) }))
    .query(async ({ input, ctx }) => {
      const token = input.token.trim();
      await throttleInvite('validate', ctx?.req, token);
      const invite = await db.getTeamInviteByToken(token);
      if (!invite) {
        // Most common cause: the invite was RESENT (resend regenerates the
        // token, so an earlier email's link stops working) or it was deleted.
        // Log the token prefix + total invite count so the cause is visible in
        // the logs without exposing the full token.
        console.warn(`[teamInvites.validate] No invite for token ${token.slice(0, 8)}…. Likely replaced by a newer invite (resend) or deleted.`);
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
      // What the accept page needs (-278): which workspace, and whether this
      // address already has a login (then the person confirms with THEIR
      // password and the workspace is added to it — no new account).
      const ws = await getWorkspace((invite as any).workspaceId);
      if ((invite as any).workspaceId !== undefined && (!ws || ws.status !== 'active')) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This workspace is not available. Ask whoever invited you.' });
      }
      const hasAccount = await Promise.resolve().then(() => db.emailHasAccount(invite.email)).catch(() => false);
      return { email: invite.email, name: invite.name, role: invite.role, expiresAt: invite.expiresAt, workspaceName: ws?.name ?? null, asOwner: !!(invite as any).asOwner, hasAccount: !!hasAccount };
    }),

  // ── Public: accept invite ────────────────────────────────────────────────
  // A NEW person sets a password and gets a login in the inviting workspace.
  // A person who ALREADY has a LevelUp login proves it is theirs with that
  // login's password (or by being signed in to it) and the workspace is added
  // to the login: a new member row, nothing else about the login changes
  // (multi-workspace, -278).
  accept: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      name: z.string().min(1).max(128),
      password: z.string().min(8).max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      await throttleInvite('accept', ctx?.req, input.token.trim());
      const invite = await db.getTeamInviteByToken(input.token.trim());
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'This invite link is no longer valid — it may have been replaced by a newer invite or removed. Ask your admin to resend it.' });
      if (invite.accepted) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has already been used — your account already exists. Use the Sign in option instead.' });
      if (new Date() > invite.expiresAt) throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite has expired. Ask your admin to resend it.' });

      // Rows written before workspaces (and the older unit tests) have no
      // workspaceId: they are workspace 1's.
      const legacy = (invite as any).workspaceId === undefined;
      const workspaceId = legacy ? 1 : Number((invite as any).workspaceId);
      if (!legacy) {
        const ws = await getWorkspace(workspaceId);
        if (!ws || ws.status !== 'active') throw new TRPCError({ code: 'BAD_REQUEST', message: 'This workspace is not available. Ask whoever invited you.' });
      }
      const asOwner = !!(invite as any).asOwner;
      // The plan may have changed since the invitation went out (-279).
      if (!legacy) {
        const { seatCheck, isBillingLocked } = await import('../_core/billing');
        if (await isBillingLocked(workspaceId)) throw new TRPCError({ code: 'FORBIDDEN', message: 'This workspace is not open at the moment. Ask whoever invited you.' });
        const seats = await seatCheck(workspaceId);
        if (!seats.ok) throw new TRPCError({ code: 'FORBIDDEN', message: 'This workspace is full on its current plan. Ask whoever invited you to make room, then try the link again.' });
      }
      const seatsStillFree = async () => {
        if (legacy) return;
        const { seatCheck } = await import('../_core/billing');
        // re-checked inside the account-creation lock: two accepts at once can't both take the last seat (Audit 3)
        if (!(await seatCheck(workspaceId)).ok) throw new TRPCError({ code: 'FORBIDDEN', message: 'This workspace is full on its current plan. Ask whoever invited you to make room, then try the link again.' });
      };

      const { getDb } = await import('../db');
      const dbConn = await getDb();
      if (!dbConn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });

      const { users, workspaces } = await import('../../drizzle/schema');
      const { and, eq, isNull } = await import('drizzle-orm');

      let userId: number;
      let joinedExisting = false;
      try {
        // Audit F70: serialised with every other account creation
        // (GET_LOCK lu_user_create), the email checked case-insensitively
        // inside the lock — two accepts of the same invite, or an accept racing
        // a sign-up, can't create two accounts.
        userId = await createUserSerialised(invite.email, async () => false, () => { throw new Error('unreachable'); }, async () => {
          await seatsStillFree();
          // tenancy: login identity is platform-wide — the LOGIN row for this address
          const [login] = await dbConn.select().from(users).where(and(eq(users.email, invite.email), isNull(users.accountId))).limit(1);
          const loginCI: any = login || (await db.emailHasAccount(invite.email) ? await db.getUserByEmail(invite.email) : null);
          if (loginCI || (!login && await db.emailHasAccount(invite.email))) {
            // ── an existing login: add this workspace to it ──
            const acct: any = loginCI;
            if (legacy || !acct) {
              // Never let an invite replace an existing account's password, name
              // or role: that would let whoever holds the invite link take it over.
              throw new TRPCError({ code: 'CONFLICT', message: 'This email already has a LevelUp account. Use Sign in (or Forgot password) instead.' });
            }
            // Proof that the login is theirs: its password, or a session of it.
            const session: any = ctx?.user || (ctx as any)?.inactiveUser || null;
            const sessionIsThem = !!session && (Number(session.accountId) || Number(session.id)) === Number(acct.id);
            if (!sessionIsThem) {
              // Audit 3: guesses here count against the same sign-in limits as the sign-in box
              const em = String(acct.email || invite.email).toLowerCase().trim(), ip = clientIp(ctx?.req), WIN = 15 * 60_000;
              const { loginKeyFor } = await import('./emailAuth');
              if (!(await rlHit(loginKeyFor(em, ip), 8, WIN)) || !(await rlHit('login:e:' + em, 100, WIN))) {
                throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Wait 15 minutes and try again, or reset your password.' });
              }
              const ok = !!acct.passwordHash && await bcrypt.compare(input.password, acct.passwordHash);
              if (!ok) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'This email already has a LevelUp account. Enter that account\'s password to add this workspace to it (or use Forgot password first).' });
            }
            const mine = await membershipsOf(acct);
            const already = mine.find(m => m.workspaceId === workspaceId);
            if (already) { joinedExisting = true; return already.userId; }
            const openId = `m:${randomBytes(24).toString('hex')}`;
            await dbConn.insert(users).values({
              openId,
              name: input.name,
              email: acct.email,
              loginMethod: 'member',
              role: asOwner ? 'admin' : invite.role,
              workspaceId,
              accountId: acct.id,
              lastSignedIn: new Date(),
            });
            const [created] = await dbConn.select().from(users).where(eq(users.openId, openId)).limit(1);
            joinedExisting = true;
            return created.id as number;
          }
          // ── a new person: a login in the inviting workspace ──
          const passwordHash = await bcrypt.hash(input.password, 12);
          // a random id (Audit 3: it was derived from the token)
          const openId = `inv:${randomBytes(24).toString('hex')}`;
          await dbConn.insert(users).values({
            openId,
            name: input.name,
            email: invite.email,
            loginMethod: 'invite',
            role: asOwner ? 'admin' : invite.role,
            passwordHash,
            workspaceId,
            lastSignedIn: new Date(),
          });
          const [created] = await dbConn.select().from(users).where(eq(users.openId, openId)).limit(1);
          return created.id as number;
        });
      } catch (dbErr: any) {
        if (dbErr instanceof TRPCError) throw dbErr;
        if (dbErr?.message === 'busy') throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Busy creating another account — please try again in a moment.' });
        console.error('[teamInvites.accept] DB error creating user:', dbErr);
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create account. Please try again or contact support.' });
      }

      // An owner invite (the operator made the workspace): the invitee owns it,
      // unless it already has an owner.
      if (asOwner && !legacy) {
        try { await dbConn.update(workspaces).set({ ownerUserId: userId }).where(and(eq(workspaces.id, workspaceId), isNull(workspaces.ownerUserId))); }
        catch (e) { console.error('[teamInvites.accept] could not set the workspace owner:', e); }
      }
      if (!legacy) invalidateWorkspace(workspaceId);
      // a per-seat subscription follows the head count (-279; never throws)
      if (!legacy && !joinedExisting) void (await import('../_core/billing')).syncSeats(workspaceId);
      else if (!legacy) void (await import('../_core/billing')).syncSeats(workspaceId);

      await db.acceptTeamInvite(input.token, userId);
      // Log account creation activity (best-effort)
      db.logActivity(userId, joinedExisting ? 'workspace_joined' : 'account_created', 'user', input.name).catch(() => {});
      return { success: true, email: invite.email, joinedExisting };
    }),
});
