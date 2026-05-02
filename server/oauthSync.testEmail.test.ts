/**
 * Tests for oauthSync.testEmail and oauthSync.refreshToken procedures.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TrpcContext } from './_core/context';

// ─── Mock the DB module ───────────────────────────────────────────────────────
vi.mock('./db', () => ({
  upsertUserOauthCredential: vi.fn(),
  getUserOauthCredential: vi.fn().mockResolvedValue(null),
  deleteUserOauthCredential: vi.fn(),
  insertCredentialAuditLog: vi.fn(),
  getCredentialAuditLog: vi.fn().mockResolvedValue([]),
  getOAuthToken: vi.fn().mockResolvedValue(null),
  getAllConnectedOAuthAccounts: vi.fn().mockResolvedValue([]),
  getSystemSetting: vi.fn().mockResolvedValue(null),
  setSystemSetting: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock sendEmail ───────────────────────────────────────────────────────────
vi.mock('./_core/sendEmail', () => ({
  sendEmail: vi.fn().mockResolvedValue(false),
}));

import * as sendEmailModule from './_core/sendEmail';
import * as db from './db';
import { appRouter } from './routers';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createUserContext(
  userId = 1,
  name = 'Test User',
  email: string | null = 'test@example.com',
  role: 'admin' | 'user' = 'user'
): TrpcContext {
  return {
    user: { id: userId, name, email: email as string, openId: 'open-1', role, loginMethod: 'email' },
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext['res'],
  };
}

// ─── testEmail tests ──────────────────────────────────────────────────────────
describe('oauthSync.testEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success:false with helpful message when no SMTP sender configured', async () => {
    vi.mocked(sendEmailModule.sendEmail).mockResolvedValue(false);
    const caller = appRouter.createCaller(createUserContext(1, 'Alice', 'alice@example.com'));
    const result = await caller.oauthSync.testEmail();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/No SMTP sender/i);
    expect(sendEmailModule.sendEmail).toHaveBeenCalledOnce();
  });

  it('returns success:true with recipient address when email is sent', async () => {
    vi.mocked(sendEmailModule.sendEmail).mockResolvedValue(true);
    const caller = appRouter.createCaller(createUserContext(1, 'Alice', 'alice@example.com'));
    const result = await caller.oauthSync.testEmail();
    expect(result.success).toBe(true);
    expect(result.message).toContain('alice@example.com');
  });

  it('calls sendEmail with the user\'s own email as recipient', async () => {
    vi.mocked(sendEmailModule.sendEmail).mockResolvedValue(true);
    const caller = appRouter.createCaller(createUserContext(1, 'Bob', 'bob@company.com'));
    await caller.oauthSync.testEmail();
    expect(sendEmailModule.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'bob@company.com' })
    );
  });

  it('returns success:false when user has no email address', async () => {
    const caller = appRouter.createCaller(createUserContext(1, 'NoEmail', null));
    const result = await caller.oauthSync.testEmail();
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/no email address/i);
    expect(sendEmailModule.sendEmail).not.toHaveBeenCalled();
  });
});

// ─── refreshToken tests ───────────────────────────────────────────────────────
describe('oauthSync.refreshToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a Google OAuth URL when google credentials are configured', async () => {
    vi.mocked(db.getUserOauthCredential).mockResolvedValue({
      id: 1,
      userId: 1,
      provider: 'google',
      clientId: 'google-client-id',
      clientSecret: 'google-secret',
      updatedAt: new Date(),
    } as any);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.refreshToken({
      provider: 'google',
      origin: 'https://example.com',
    });
    expect(result.url).toContain('accounts.google.com');
    expect(result.url).toContain('google-client-id');
  });

  it('returns a Microsoft OAuth URL when microsoft credentials are configured', async () => {
    vi.mocked(db.getUserOauthCredential).mockResolvedValue({
      id: 1,
      userId: 1,
      provider: 'microsoft',
      clientId: 'ms-client-id',
      clientSecret: 'ms-secret',
      updatedAt: new Date(),
    } as any);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.refreshToken({
      provider: 'microsoft',
      origin: 'https://example.com',
    });
    expect(result.url).toContain('login.microsoftonline.com');
    expect(result.url).toContain('ms-client-id');
  });

  it('returns a URL even when only env credentials are available (no per-user creds)', async () => {
    // getUserOauthCredential returns null (no per-user creds)
    vi.mocked(db.getUserOauthCredential).mockResolvedValue(null);
    const caller = appRouter.createCaller(createUserContext(1));
    // In the test environment, GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET may or may not be set.
    // Either way the procedure should not throw when env creds are present, or throw with
    // a meaningful message when they are absent. We just verify it resolves or rejects cleanly.
    const resultOrError = await caller.oauthSync
      .refreshToken({ provider: 'google', origin: 'https://example.com' })
      .then((r) => ({ ok: true as const, url: r.url }))
      .catch((e: Error) => ({ ok: false as const, message: e.message }));
    if (resultOrError.ok) {
      // Env creds were present — URL should be a valid Google auth URL
      expect(resultOrError.url).toContain('accounts.google.com');
    } else {
      // Env creds absent — error message should mention credentials
      expect(resultOrError.message).toMatch(/credentials/i);
    }
  });
});
