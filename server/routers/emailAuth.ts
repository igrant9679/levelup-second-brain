/**
 * Email + Password authentication router.
 *
 * Provides login, register, setPassword, forgotPassword, and resetPassword procedures.
 * All auth procedures create a proper JWT session cookie (same cookie that
 * protectedProcedure validates), replacing the local PIN-only flow.
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { COOKIE_NAME, ONE_YEAR_MS } from '@shared/const';
import { getSessionCookieOptions } from '../_core/cookies';
import { sdk } from '../_core/sdk';
import * as db from '../db';
import { getDb } from '../db';
import { passwordResetTokens } from '../../drizzle/schema';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';
import { notifyOwner } from '../_core/notification';
import { sendEmail } from '../_core/sendEmail';
import { appOrigin } from '../_core/appOrigin';
import { and, isNull, sql } from 'drizzle-orm';
import { users } from '../../drizzle/schema';
import { rlHit, rlBlocked, rlClear, clientIp } from "../_core/rateLimit";
import { createUserSerialised } from "../_core/dbLock";

/** Reset tokens are stored as SHA-256 hashes, so a DB read can't reveal a live link. */
function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
/**
 * F12 (audit 2026-10-25): display name and email are unverified and editable.
 * Access is decided by numeric user ids only, but the OWNER's save still turns
 * a legacy name/email assignment string into an id (unique matches only), so
 * an account must not be able to take a name or email another account already
 * uses. Returns the other accounts (not selfId) whose email OR display name
 * equals `value`, case-insensitively. Best effort: if the list can't be read,
 * returns [] (getUserByEmail still guards exact email matches).
 */
async function otherAccountsUsing(self: { id: number; workspaceId?: number | null; accountId?: number | null }, value: string): Promise<Array<{ id: number }>> {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return [];
  try {
    // Multi-workspace (-278): names only have to be unique among the people
    // you can be confused with — the members of YOUR workspace. (A login's
    // email is unique platform-wide; db.emailHasAccount / getUserByEmail
    // check that.) Your own member rows in other workspaces are not "others".
    const all: any[] = (self as any).workspaceId === undefined ? await db.adminListAllUsers() : await db.listWorkspaceUsers(self as any);
    const myAccount = Number((self as any).accountId) || self.id;
    return (all || []).filter((u: any) => u && u.id !== self.id && (Number(u.accountId) || u.id) !== myAccount && (
      (u.email && String(u.email).trim().toLowerCase() === key) ||
      (u.name && String(u.name).trim().toLowerCase() === key)));
  } catch { return []; }
}
async function invalidateIdentityCache() {
  try { (await import('./appData'))._invalidateUserIdMap(); } catch { /* not loaded */ }
}
/**
 * Give the CURRENT device a fresh session cookie carrying the account's new
 * tokenVersion (audit F20), keeping the remaining lifetime of the cookie it
 * had (1 day / 30 days / 1 year), so a password change or "sign out
 * everywhere" doesn't sign out the device that asked for it.
 */
export async function reissueSessionCookie(ctx: { req: any; res: any }, user: { openId: string; name?: string | null }, tokenVersion: number): Promise<void> {
  const cur = await sdk.sessionOf(ctx.req).catch(() => null);
  const left = cur?.exp ? cur.exp * 1000 - Date.now() : 0;
  const ms = left > 60_000 ? Math.min(left, ONE_YEAR_MS) : 86_400_000;
  const token = await sdk.createSessionToken(user.openId, { name: user.name || '', expiresInMs: ms, tokenVersion });
  ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ms });
}

/** Bump users.tokenVersion; a failure is logged (→ error log), never thrown at the caller. */
async function bumpTv(userId: number): Promise<number | null> {
  try { return await db.bumpTokenVersion(userId); }
  catch (e) { console.error('[auth] could not revoke sessions for user ' + userId + ':', e); return null; }
}

/** The login row behind the signed-in member row (itself, unless it is a member row in a further workspace). */
async function accountOf(user: any): Promise<any> {
  if (!user || !user.accountId) return user;
  return db.getAccountRow(user);
}

const escHtml = (s: string) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c]);

/**
 * `register` creates ONLY the very first account of a fresh install (empty users
 * table), so a new deploy can be bootstrapped. Everyone else joins through an
 * invitation (teamInvites.accept) or self-serve sign-up (billing.signupStart,
 * which proves the address first). Audit 3: ALLOW_SIGNUP=true no longer opens
 * this path — it had no email check, no rate limit, and could overwrite an
 * existing row through upsertUser.
 */
async function signupAllowed(): Promise<boolean> {
  const conn = await getDb();
  if (!conn) return false;
  // tenancy: platform — "is this a brand-new install with no accounts at all?"
  const [row] = await conn.select({ n: sql<number>`count(*)` }).from(users);
  return Number(row?.n || 0) === 0;
}

/**
 * Which member row a login enters after signing in: the workspace it used
 * most recently (member rows record lastSignedIn), among the ones that are
 * active. Falls back to the login row itself.
 */
async function entryMemberRow(login: any): Promise<any> {
  try {
    const { membershipsOf } = await import('../_core/workspace');
    const ms = (await membershipsOf(login)).filter(m => m.status === 'active');
    if (!ms.length) return login;
    let best: any = null;
    for (const m of ms) {
      const row: any = m.userId === login.id ? login : await db.getUserById(m.userId);
      if (!row) continue;
      const at = row.lastSignedIn ? new Date(row.lastSignedIn).getTime() : 0;
      if (!best || at > best.at) best = { row, at };
    }
    return best ? best.row : login;
  } catch { return login; }
}

const SALT_ROUNDS = 10;
const ONE_DAY_MS = 86_400_000;
/** A bcrypt hash of nothing anyone types: compared against when there is no account (equal timing). */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO6bSO7RnZ9lBEN6PL4ZuI3ifUYGFbIim';
/** The per-address-and-IP sign-in counter (shared with invite accepts, Audit 3). */
export function loginKeyFor(email: string, ip: string): string {
  return 'login:ei:' + crypto.createHash('sha256').update(String(email).toLowerCase().trim() + '|' + String(ip || '')).digest('hex').slice(0, 40);
}
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export const emailAuthRouter = router({
  /**
   * Login with email + password.
   * On success sets the app_session_id JWT cookie and returns the user.
   * Optional `rememberMe: true` extends the session to 30 days (default: 1 day).
   */
  login: publicProcedure
    .input(z.object({
      email: z.string().email().max(320),
      password: z.string().min(1).max(500),
      rememberMe: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      // Throttle guessing (-255, Audit 3). Counters are persistent and shared by every instance (F19).
      //  - 8 tries per address FROM ONE IP: a stranger hammering an address no longer locks its
      //    owner out everywhere (the old per-address block refused even the right password);
      //  - 30 failures per IP; 100 tries per address from anywhere (slows a spread-out attack).
      //  - The try is counted BEFORE the password is checked, so a burst of parallel requests
      //    can't all slip past the check before any failure is recorded.
      const em = input.email.toLowerCase().trim(), ip = clientIp(ctx.req), WIN = 15 * 60_000;
      const kEI = loginKeyFor(em, ip), kE = 'login:e:' + em, kI = 'login:ip:' + ip;
      const tooMany = () => new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many sign-in attempts. Wait 15 minutes and try again, or reset your password.' });
      if ((await rlBlocked(kI, 30, WIN))) throw tooMany();
      if (!(await rlHit(kEI, 8, WIN)) || !(await rlHit(kE, 100, WIN))) throw tooMany();
      const failed = async (): Promise<never> => {
        await rlHit(kI, 30, WIN);
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      };
      const user = await db.getUserByEmail(em);
      // Audit 3: the same bcrypt work whether or not the address has an account (timing gave it away)
      if (!user || !user.passwordHash) { await bcrypt.compare(input.password, DUMMY_HASH); return failed(); }
      // Audit F36: an account with no password gets the same answer as a
      // wrong password — a distinct "no password set" message told anyone
      // which addresses have accounts. (Forgot password sets one.)
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) return failed();
      await rlClear(kEI); await rlClear(kE);
      // The password belongs to the login; the session belongs to one of its
      // member rows — the workspace this person used last (-278).
      const member = await entryMemberRow(user);
      await db.upsertUser({ openId: member.openId, lastSignedIn: new Date() });
      const freshUser = (await db.getUserById(member.id)) ?? member;
      // Log login activity
      await db.logActivity(member.id, 'login');
      // Determine session duration based on rememberMe
      const sessionDurationMs = input.rememberMe ? THIRTY_DAYS_MS : ONE_DAY_MS;
      // Create JWT session cookie
      const sessionToken = await sdk.createSessionToken(member.openId, {
        name: member.name || '',
        expiresInMs: sessionDurationMs,
        tokenVersion: Number((user as any).tokenVersion) || 0,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDurationMs });
      return {
        success: true,
        user: {
          id: freshUser.id,
          name: freshUser.name,
          email: freshUser.email,
          role: freshUser.role,
        },
      };
    }),

  /**
   * Register a new account with email + password.
   * Creates the user in the DB and sets the session cookie.
   */
  register: publicProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      email: z.string().email(),
      password: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ input, ctx }) => {
      if (!(await signupAllowed())) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'LevelUp accounts are by invitation. Ask the workspace owner for an invite.' });
      }
      const conflict = (): never => { throw new TRPCError({ code: 'CONFLICT', message: 'An account with this email already exists' }); };
      const existing = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (existing) conflict();
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      // Use email as openId for email-registered users (prefixed to avoid collision with Manus OAuth openIds)
      const openId = `acct:${crypto.randomBytes(24).toString('hex')}`; // Audit 3: random (was email:<address>)
      // Which workspace? (-278) The very first account of a fresh install owns
      // workspace 1. With ALLOW_SIGNUP=true every later sign-up gets a NEW
      // workspace of its own — never a seat in somebody else's.
      const ws = await import('../_core/workspace');
      const conn0 = await getDb();
      let workspaceId = 1;
      let firstEver = true;
      if (conn0) {
        // tenancy: platform — is this the first account of the install?
        const [cnt] = await conn0.select({ n: sql<number>`count(*)` }).from(users);
        firstEver = Number(cnt?.n || 0) === 0;
        if (!firstEver) throw new TRPCError({ code: 'FORBIDDEN', message: 'LevelUp accounts are by invitation. Ask the workspace owner for an invite.' });
        if (!firstEver) {
          const { workspaces } = await import('../../drizzle/schema');
          const base = ws.slugify(input.name);
          const ins: any = await conn0.insert(workspaces).values({ name: (input.name.trim() + "'s workspace").slice(0, 120), slug: `${base}-${crypto.randomBytes(3).toString('hex')}`, status: 'active' });
          workspaceId = Number(ins?.[0]?.insertId ?? ins?.insertId);
          if (!Number.isInteger(workspaceId) || workspaceId <= 0) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create workspace' });
        }
      }
      // Audit F70: account creation is serialised (GET_LOCK lu_user_create) with
      // a case-insensitive check inside the lock, so two concurrent sign-ups
      // (or a sign-up racing an invite accept) can't create two accounts.
      try {
        await createUserSerialised(input.email, (e) => Promise.resolve().then(() => db.emailHasAccount(e)).catch(() => false), conflict, () => db.upsertUser({
          openId,
          name: input.name,
          email: input.email.toLowerCase().trim(),
          loginMethod: 'email',
          lastSignedIn: new Date(),
          workspaceId,
          role: 'admin',
        } as any));
      } catch (e: any) {
        if (e instanceof TRPCError) throw e;
        if (e?.message === 'busy') throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Busy creating another account — please try again in a moment.' });
        throw e;
      }
      const user = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (!user) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create account' });
      }
      await db.updateUserPasswordHash(user.id, passwordHash);
      // The registrant owns the workspace that was just made for them (or
      // workspace 1 on a fresh install, where they are also the operator).
      if (conn0) {
        const { workspaces } = await import('../../drizzle/schema');
        await conn0.update(workspaces).set({ ownerUserId: user.id, createdBy: user.id }).where(and(eq(workspaces.id, workspaceId), isNull(workspaces.ownerUserId)));
        ws.invalidateWorkspace(workspaceId);
        if (firstEver) await ws.ensureWorkspaceBootstrap();
        else { try { await (await import('../_core/billing')).startTrial(workspaceId); } catch (e) { console.error('[register] could not start the trial:', e); } }
      }
      const sessionToken = await sdk.createSessionToken(openId, {
        name: input.name,
        expiresInMs: ONE_YEAR_MS,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
    }),

  /**
   * Set or change password for the currently logged-in user.
   * If the user already has a password, `currentPassword` is required.
   */
  setPassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      confirmPassword: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = ctx.user;
      // Validate confirm password if provided
      if (input.confirmPassword !== undefined && input.confirmPassword !== input.newPassword) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'New password and confirmation do not match' });
      }
      // The password is the LOGIN's (a member row in a further workspace has
      // none of its own — reading it there would skip this check).
      const account: any = await accountOf(user);
      if (!account) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Account not found' });
      if (account.passwordHash && input.currentPassword) {
        const valid = await bcrypt.compare(input.currentPassword, account.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
        }
      } else if (account.passwordHash && !input.currentPassword) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Current password is required' });
      }
      const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.updateUserPasswordHash(user.id, passwordHash);
      // Audit F20: a new password signs out every other device; this one gets
      // a fresh cookie with the new token version.
      const tv = await bumpTv(user.id);
      if (tv != null) await reissueSessionCookie(ctx, user, tv);
      return { success: true };
    }),

  /**
   * Initiate password reset: generate a secure token, store it in DB,
   * and notify the app owner (since no SMTP is configured).
   * Always returns success to avoid user enumeration.
   */
  forgotPassword: publicProcedure
    .input(z.object({
      email: z.string().email().max(320),
      origin: z.string().url().max(500).optional(), // frontend origin for building the reset link
    }))
    .mutation(async ({ input, ctx }) => {
      const email = input.email.toLowerCase().trim();
      // At most 3 reset emails per address and 10 per IP an hour (-255) — each
      // one cancels the previous link, so a flood would also block a real reset.
      // Over the limit the answer is the same, so it reveals nothing.
      if (!(await rlHit('reset:e:' + email, 3, 3600_000)) || !(await rlHit('reset:ip:' + clientIp(ctx.req), 10, 3600_000))) {
        return { success: true, message: 'If that email is registered, a reset link has been sent.' };
      }
      const user = await db.getUserByEmail(email);

      // Always return success to prevent user enumeration
      if (!user) {
        return { success: true, message: 'If that email is registered, a reset link has been sent.' };
      }

      // Generate a cryptographically secure token. Only its hash is stored,
      // and any earlier unused tokens for this user stop working.
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

      const dbConn = await getDb();
      if (dbConn) {
        await dbConn.update(passwordResetTokens)
          .set({ usedAt: new Date() })
          .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
        await dbConn.insert(passwordResetTokens).values({
          token: hashResetToken(token),
          userId: user.id,
          expiresAt,
        });
      }

      // Build reset URL from the app's own origin. input.origin is accepted
      // for older clients but ignored: a caller-chosen origin would let the
      // emailed link point somewhere else.
      const resetUrl = `${appOrigin()}/?reset_token=${token}`;

      // Try to send directly to the user via the configured SMTP sender.
      // Fall back to notifyOwner (owner notification) if no sender is configured.
      const emailSent = await sendEmail({
        to: email,
        subject: 'LevelUp — Password Reset',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#3B82F6">Reset your password</h2>
            <p>Hi ${escHtml(user.name || 'there')},</p>
            <p>We received a request to reset the password for your LevelUp account.</p>
            <p style="margin:24px 0">
              <a href="${resetUrl}" style="background:#3B82F6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
            </p>
            <p style="color:#888;font-size:13px">This link expires in 1 hour. If you did not request a reset, you can safely ignore this email.</p>
          </div>`,
      }).catch(() => false);

      if (!emailSent) {
        // Fallback: tell the owner the email failed. The live link is NOT
        // included — it must only ever reach the account holder.
        try {
          await notifyOwner({
            title: `Password reset email failed — ${user.name || email}`,
            content: `A password reset was requested for **${email}**, but the email could not be sent. Check Settings → Notifications → Email Delivery Log, then ask them to request a new link.`,
          });
        } catch (e) {
          console.warn('[forgotPassword] notifyOwner fallback failed:', e);
        }
      }

      return {
        success: true,
        message: 'If that email is registered, a reset link has been sent.',
        // In dev mode, expose the token so it can be used directly
        ...(process.env.NODE_ENV === 'development' ? { devToken: token } : {}),
      };
    }),

  /**
   * Reset password using a valid reset token.
   * Validates the token (not expired, not used), hashes the new password,
   * updates the user, and marks the token as used.
   */
  resetPassword: publicProcedure
    .input(z.object({
      token: z.string().min(1),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
      confirmPassword: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.newPassword !== input.confirmPassword) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Passwords do not match' });
      }
      // Throttle (audit F19): 20 attempts an hour per IP, 5 per link — the
      // token is 256 bits, but every attempt costs a bcrypt hash.
      {
        const th = hashResetToken(String(input.token || '').trim());
        if (!(await rlHit('rp:ip:' + clientIp(ctx?.req), 20, 3600_000)) || !(await rlHit('rp:t:' + th, 5, 3600_000))) {
          throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Wait an hour, or request a new reset link.' });
        }
      }

      const dbConn = await getDb();
      if (!dbConn) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Look up the token by its hash
      const tokenHash = hashResetToken(input.token.trim());
      const rows = await dbConn
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, tokenHash))
        .limit(1);

      const resetToken = rows[0];

      if (!resetToken) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid or expired reset link' });
      }
      if (resetToken.usedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This reset link has already been used' });
      }
      if (new Date() > resetToken.expiresAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This reset link has expired. Please request a new one.' });
      }

      // Claim the token atomically before changing anything, so two
      // concurrent requests can't both use it.
      const claim: any = await dbConn
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.token, tokenHash), isNull(passwordResetTokens.usedAt)));
      const claimed = Number(claim?.[0]?.affectedRows ?? claim?.affectedRows ?? 0);
      if (claimed !== 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This reset link has already been used' });
      }

      // Hash new password and update user
      const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.updateUserPasswordHash(resetToken.userId, passwordHash);

      // Any other outstanding links for this account stop working too.
      await dbConn
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(and(eq(passwordResetTokens.userId, resetToken.userId), isNull(passwordResetTokens.usedAt)));
      // Audit F20: every existing session of the account ends (a reset is
      // what you do when someone else may be signed in).
      await bumpTv(resetToken.userId);
      // Audit 3: a reset clears the address's sign-in counters (someone else's failed guesses
      // must not keep the owner out after they proved the mailbox is theirs)
      try {
        const u: any = await db.getUserById(resetToken.userId);
        const em = String(u?.email || '').toLowerCase().trim();
        if (em) { await rlClear('login:e:' + em); await rlClear(loginKeyFor(em, clientIp(ctx.req))); }
      } catch { /* best effort */ }

      return { success: true, message: 'Password updated successfully. You can now sign in.' };
    }),

  /**
   * Update the currently logged-in user's email address.
   * For email-based accounts (openId starts with 'email:'), also updates the openId
   * so future logins with the new email work correctly.
   */
  updateEmail: protectedProcedure
    .input(z.object({
      newEmail: z.string().email('Please enter a valid email address'),
      currentPassword: z.string().min(1, 'Please enter your current password to confirm this change'),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = ctx.user;
      // Require password confirmation for security (the password is the login's)
      const account: any = await accountOf(user);
      if (!account || !account.passwordHash) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No password set on this account. Please set a password first.' });
      }
      const valid = await bcrypt.compare(input.currentPassword, account.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
      }
      const newEmail = input.newEmail.toLowerCase().trim();
      // Check if new email is already taken by another user
      const existing = await db.getUserByEmail(newEmail);
      if (existing && existing.id !== account.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This email address is already in use by another account' });
      }
      // F12: also case-insensitive (a stored mixed-case email, or a column
      // collation that compares case), and never another account's display name.
      if ((await otherAccountsUsing(user as any, newEmail)).length || ((user as any).workspaceId !== undefined && (await db.emailHasAccount(newEmail)) && String(account.email || '').trim().toLowerCase() !== newEmail)) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This email address is already in use by another account' });
      }
      // Audit 3: the address changes only when the link sent TO it is opened — the new address
      // must be proven (it receives digests, check-ins and password resets), and the old one is told.
      const conn = await getDb();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      if (!(await rlHit('emailchange:' + account.id, 5, 3_600_000))) throw new TRPCError({ code: 'TOO_MANY_REQUESTS', message: 'Too many email changes in the last hour. Please try again later.' });
      const { emailChanges } = await import('../../drizzle/schema');
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      // tenancy: the caller's OWN login row's pending changes
      await conn.delete(emailChanges).where(and(eq(emailChanges.userId, account.id), isNull(emailChanges.usedAt)));
      await conn.insert(emailChanges).values({ tokenHash, userId: account.id, newEmail, expiresAt: new Date(Date.now() + 3_600_000) });
      const link = `${appOrigin()}/?confirmEmail=${token}`;
      const wsId = await (await import('../_core/workspace')).wsIdOf(user as any).catch(() => null);
      const sent = await sendEmail({
        to: newEmail, kind: 'account', senderUserId: null, workspaceId: wsId ?? null,
        subject: 'Confirm your new LevelUp sign-in email',
        html: `<p>Someone asked to make this address the sign-in email of a LevelUp account.</p><p><a href="${link}">Confirm this address</a></p><p>The link works once and for one hour. If you didn't ask for this, ignore this email — nothing changes.</p>`,
        text: `Confirm this address as your LevelUp sign-in email:
${link}

The link works once and for one hour. If you didn't ask for this, ignore this email.`,
      } as any).catch(() => false);
      if (!sent) {
        // tenancy: the request row just inserted, by its unguessable token hash
        await conn.delete(emailChanges).where(eq(emailChanges.tokenHash, tokenHash));
        throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: "We couldn't send the confirmation email to the new address just now. Please try again later." });
      }
      const oldEmail = String(account.email || '').trim();
      if (oldEmail) {
        void sendEmail({
          to: oldEmail, kind: 'account', senderUserId: null, workspaceId: wsId ?? null,
          subject: 'Your LevelUp sign-in email is about to change',
          html: `<p>Someone signed in to your LevelUp account asked to change its sign-in email to <b>${escHtml(newEmail)}</b>. It changes once that address confirms.</p><p>If this wasn't you, reset your password now from the sign-in page and use “Sign out everywhere” in Settings.</p>`,
        } as any).catch(() => false);
      }
      return { success: true, pending: true, newEmail };
    }),

  /**
   * The link from the "confirm your new sign-in email" mail (Audit 3). Changes the LOGIN's
   * email and its member rows' copies, once. The login's id and openId stay as they are,
   * so its sessions carry on; new accounts never get an `email:` openId any more.
   */
  confirmEmailChange: publicProcedure
    .input(z.object({ token: z.string().min(1).max(128) }))
    .mutation(async ({ input }) => {
      const bad = () => new TRPCError({ code: 'BAD_REQUEST', message: 'This confirmation link is no longer valid. Change the email again from Settings → Profile.' });
      if (!/^[a-f0-9]{64}$/.test(input.token)) throw bad();
      const conn = await getDb();
      if (!conn) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database unavailable' });
      const { emailChanges, users } = await import('../../drizzle/schema');
      const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
      // tenancy: by an unguessable token (stored hashed)
      const [row] = await conn.select().from(emailChanges).where(eq(emailChanges.tokenHash, tokenHash)).limit(1);
      if (!row || row.usedAt || new Date(row.expiresAt).getTime() < Date.now()) throw bad();
      const newEmail = String(row.newEmail).toLowerCase().trim();
      // still free? (someone may have taken it in the meantime)
      const taken: any = await db.getUserByEmail(newEmail);
      if ((taken && Number(taken.id) !== Number(row.userId) && Number(taken.accountId) !== Number(row.userId)) || (await otherAccountsUsing({ id: row.userId } as any, newEmail)).length) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This email address is already in use by another account.' });
      }
      // tenancy: claiming the confirmed request, by its unguessable token hash
      const claim: any = await conn.update(emailChanges).set({ usedAt: new Date() }).where(and(eq(emailChanges.tokenHash, tokenHash), isNull(emailChanges.usedAt)));
      if (Number(claim?.[0]?.affectedRows ?? claim?.affectedRows ?? 0) !== 1) throw bad();
      // the login row and every member row of that login carry the address
      // tenancy: the confirmed login's own rows (by its id / accountId)
      await conn.update(users).set({ email: newEmail }).where(eq(users.id, row.userId));
      await conn.update(users).set({ email: newEmail }).where(eq(users.accountId, row.userId));
      await invalidateIdentityCache();
      return { success: true, newEmail };
    }),

  /**
   * Update the currently logged-in user's display name.
   */
  updateName: protectedProcedure
    .input(z.object({
      newName: z.string().min(1, 'Name cannot be empty').max(128),
    }))
    .mutation(async ({ input, ctx }) => {
      const newName = input.newName.trim();
      if (!newName) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Name cannot be empty' });
      // F12: a display name another account already uses (as its name or its
      // email) is refused — two accounts sharing a name is how one user's
      // assignments once reached another account.
      const unchanged = String(ctx.user.name || '').trim().toLowerCase() === newName.toLowerCase();
      if (!unchanged && (await otherAccountsUsing(ctx.user as any, newName)).length) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Another account already uses this name. Please choose a different display name.' });
      }
      await db.updateUserName(ctx.user.id, newName);
      await invalidateIdentityCache();
      return { success: true };
    }),

  // seedDemoPassword was removed in -214: it was PUBLIC and set ANY account's
  // password for anyone holding the email plus a setup key that defaulted to a
  // value hard-coded in this file (despite its comment, it never checked that
  // the account had no password). Nothing called it. Do not bring it back —
  // reset a password through forgotPassword / resetPassword instead.
});
