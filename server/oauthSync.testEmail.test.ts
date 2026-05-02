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
// ─── Mock forceRefreshOAuthToken ──────────────────────────────────────────────
vi.mock('./_core/refreshOAuthToken', () => ({
  refreshOAuthTokenSilently: vi.fn().mockResolvedValue(false),
  forceRefreshOAuthToken: vi.fn().mockResolvedValue({
    success: false,
    message: 'No refresh token stored — please Disconnect and Connect again to get a new token.',
  }),
}));
import * as sendEmailModule from './_core/sendEmail';
import * as refreshModule from './_core/refreshOAuthToken';
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
// ─── refreshToken tests (silent server-side refresh) ──────────────────────────
describe('oauthSync.refreshToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns success:true when forceRefreshOAuthToken succeeds', async () => {
    const expiresAt = new Date(Date.now() + 3600 * 1000);
    vi.mocked(refreshModule.forceRefreshOAuthToken).mockResolvedValue({
      success: true,
      message: 'Token refreshed successfully.',
      expiresAt,
    });
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.refreshToken({ provider: 'google' });
    expect(result.success).toBe(true);
    expect(result.message).toContain('refreshed');
    expect(result.expiresAt).toEqual(expiresAt);
    expect(refreshModule.forceRefreshOAuthToken).toHaveBeenCalledWith(1, 'google');
  });

  it('returns success:false when no refresh token is stored', async () => {
    vi.mocked(refreshModule.forceRefreshOAuthToken).mockResolvedValue({
      success: false,
      message: 'No refresh token stored — please Disconnect and Connect again to get a new token.',
    });
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.refreshToken({ provider: 'microsoft' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/refresh token/i);
    expect(result.expiresAt).toBeNull();
    expect(refreshModule.forceRefreshOAuthToken).toHaveBeenCalledWith(1, 'microsoft');
  });

  it('returns success:false when token refresh fails (revoked token)', async () => {
    vi.mocked(refreshModule.forceRefreshOAuthToken).mockResolvedValue({
      success: false,
      message: 'Token refresh failed — the refresh token may have been revoked. Please Disconnect and Connect again.',
    });
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.refreshToken({ provider: 'google' });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/revoked/i);
  });

  it('does not require origin parameter (silent refresh)', async () => {
    vi.mocked(refreshModule.forceRefreshOAuthToken).mockResolvedValue({
      success: true,
      message: 'Token refreshed successfully.',
      expiresAt: new Date(),
    });
    const caller = appRouter.createCaller(createUserContext(1));
    // Should not throw — origin is no longer required
    const result = await caller.oauthSync.refreshToken({ provider: 'microsoft' });
    expect(result.success).toBe(true);
  });
});
