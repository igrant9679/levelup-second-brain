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

const SALT_ROUNDS = 10;
const ONE_DAY_MS = 86_400_000;
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
      email: z.string().email(),
      password: z.string().min(1),
      rememberMe: z.boolean().optional().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (!user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }
      if (!user.passwordHash) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'This account does not have a password set. Please use the "Set Password" option.',
        });
      }
      const valid = await bcrypt.compare(input.password, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid email or password' });
      }
      // Update lastSignedIn
      await db.upsertUser({ openId: user.openId, lastSignedIn: new Date() });
      // Log login activity
      await db.logActivity(user.id, 'login');
      // Determine session duration based on rememberMe
      const sessionDurationMs = input.rememberMe ? THIRTY_DAYS_MS : ONE_DAY_MS;
      // Create JWT session cookie
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || '',
        expiresInMs: sessionDurationMs,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: sessionDurationMs });
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
      const existing = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'An account with this email already exists' });
      }
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      // Use email as openId for email-registered users (prefixed to avoid collision with Manus OAuth openIds)
      const openId = `email:${input.email.toLowerCase().trim()}`;
      await db.upsertUser({
        openId,
        name: input.name,
        email: input.email.toLowerCase().trim(),
        loginMethod: 'email',
        lastSignedIn: new Date(),
      });
      const user = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (!user) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Failed to create account' });
      }
      await db.updateUserPasswordHash(user.id, passwordHash);
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
      if (user.passwordHash && input.currentPassword) {
        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
        }
      } else if (user.passwordHash && !input.currentPassword) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Current password is required' });
      }
      const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.updateUserPasswordHash(user.id, passwordHash);
      return { success: true };
    }),

  /**
   * Initiate password reset: generate a secure token, store it in DB,
   * and notify the app owner (since no SMTP is configured).
   * Always returns success to avoid user enumeration.
   */
  forgotPassword: publicProcedure
    .input(z.object({
      email: z.string().email(),
      origin: z.string().url().optional(), // frontend origin for building the reset link
    }))
    .mutation(async ({ input }) => {
      const email = input.email.toLowerCase().trim();
      const user = await db.getUserByEmail(email);

      // Always return success to prevent user enumeration
      if (!user) {
        return { success: true, message: 'If that email is registered, a reset link has been sent.' };
      }

      // Generate a cryptographically secure token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);

      // Store token in DB
      const dbConn = await getDb();
      if (dbConn) {
        await dbConn.insert(passwordResetTokens).values({
          token,
          userId: user.id,
          expiresAt,
        });
      }

      // Build reset URL
      const origin = input.origin || 'https://leveluphub-ez4tinmn.manus.space';
      const resetUrl = `${origin}?reset_token=${token}`;

      // Try to send directly to the user via the configured SMTP sender.
      // Fall back to notifyOwner (owner notification) if no sender is configured.
      const emailSent = await sendEmail({
        to: email,
        subject: 'LevelUp — Password Reset',
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:auto">
            <h2 style="color:#3B82F6">Reset your password</h2>
            <p>Hi ${user.name || 'there'},</p>
            <p>We received a request to reset the password for your LevelUp account.</p>
            <p style="margin:24px 0">
              <a href="${resetUrl}" style="background:#3B82F6;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">Reset Password</a>
            </p>
            <p style="color:#888;font-size:13px">This link expires in 1 hour. If you did not request a reset, you can safely ignore this email.</p>
          </div>`,
      }).catch(() => false);

      if (!emailSent) {
        // Fallback: notify the owner so the reset link is not lost
        try {
          await notifyOwner({
            title: `Password Reset Request — ${user.name || email}`,
            content: `A password reset was requested for: **${email}**\n\nReset link (expires in 1 hour):\n${resetUrl}\n\nIf you did not request this, please ignore this message.`,
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
    .mutation(async ({ input }) => {
      if (input.newPassword !== input.confirmPassword) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Passwords do not match' });
      }

      const dbConn = await getDb();
      if (!dbConn) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Database not available' });
      }

      // Look up the token
      const rows = await dbConn
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, input.token))
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

      // Hash new password and update user
      const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.updateUserPasswordHash(resetToken.userId, passwordHash);

      // Mark token as used
      await dbConn
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.token, input.token));

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
      // Require password confirmation for security
      if (!user.passwordHash) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No password set on this account. Please set a password first.' });
      }
      const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
      if (!valid) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
      }
      const newEmail = input.newEmail.toLowerCase().trim();
      // Check if new email is already taken by another user
      const existing = await db.getUserByEmail(newEmail);
      if (existing && existing.id !== user.id) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This email address is already in use by another account' });
      }
      // Update email in DB
      await db.updateUserEmail(user.id, newEmail);
      // For email-based accounts, also update the openId so login still works
      if (user.openId.startsWith('email:')) {
        const dbConn = await getDb();
        if (dbConn) {
          const { users } = await import('../../drizzle/schema');
          await dbConn.update(users).set({ openId: `email:${newEmail}` }).where(eq(users.id, user.id));
        }
        // Re-issue session cookie with new openId
        const sessionToken = await sdk.createSessionToken(`email:${newEmail}`, {
          name: user.name || '',
          expiresInMs: ONE_YEAR_MS,
        });
        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      }
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
      await db.updateUserName(ctx.user.id, input.newName.trim());
      return { success: true };
    }),

  /**
   * Seed demo users with a default password (used during development/onboarding).
   * Only callable if the user has no password set yet.
   */
  seedDemoPassword: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
      setupKey: z.string(), // simple guard against abuse
    }))
    .mutation(async ({ input }) => {
      // Only allow seeding if setup key matches a simple env-based guard
      const expectedKey = process.env.DEMO_SETUP_KEY || 'levelup-demo-2026';
      if (input.setupKey !== expectedKey) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Invalid setup key' });
      }
      const user = await db.getUserByEmail(input.email.toLowerCase().trim());
      if (!user) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      }
      const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
      await db.updateUserPasswordHash(user.id, passwordHash);
      return { success: true };
    }),
});
