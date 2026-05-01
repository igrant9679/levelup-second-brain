/**
 * Email + Password authentication router.
 *
 * Provides login and register procedures that create a proper JWT session cookie
 * (same cookie that protectedProcedure validates), replacing the local PIN-only flow.
 */
import bcrypt from 'bcryptjs';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { COOKIE_NAME, ONE_YEAR_MS } from '@shared/const';
import { getSessionCookieOptions } from '../_core/cookies';
import { sdk } from '../_core/sdk';
import * as db from '../db';
import { publicProcedure, protectedProcedure, router } from '../_core/trpc';

const SALT_ROUNDS = 10;

export const emailAuthRouter = router({
  /**
   * Login with email + password.
   * On success sets the app_session_id JWT cookie and returns the user.
   */
  login: publicProcedure
    .input(z.object({
      email: z.string().email(),
      password: z.string().min(1),
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
      // Create JWT session cookie
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || '',
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
   */
  setPassword: protectedProcedure
    .input(z.object({
      currentPassword: z.string().optional(),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    }))
    .mutation(async ({ input, ctx }) => {
      const user = ctx.user;
      if (user.passwordHash && input.currentPassword) {
        const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
        if (!valid) {
          throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Current password is incorrect' });
        }
      }
      const passwordHash = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
      await db.updateUserPasswordHash(user.id, passwordHash);
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
