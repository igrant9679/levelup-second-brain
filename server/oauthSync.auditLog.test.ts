/**
 * Tests for oauthSync credential audit log procedures:
 *  - saveCredentials logs a 'saved' action
 *  - deleteCredentials logs a 'cleared' action
 *  - getCredentialAuditLog returns entries for the current user
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { TrpcContext } from './_core/context';

// ─── Mock the DB module ───────────────────────────────────────────────────────
vi.mock('./db', () => ({
  upsertUserOauthCredential: vi.fn().mockResolvedValue(undefined),
  getUserOauthCredential: vi.fn().mockResolvedValue(null),
  deleteUserOauthCredential: vi.fn().mockResolvedValue(undefined),
  insertCredentialAuditLog: vi.fn().mockResolvedValue(undefined),
  getCredentialAuditLog: vi.fn().mockResolvedValue([]),
  getOAuthToken: vi.fn().mockResolvedValue(null),
  getAllConnectedOAuthAccounts: vi.fn().mockResolvedValue([]),
  getSystemSetting: vi.fn().mockResolvedValue(null),
  setSystemSetting: vi.fn().mockResolvedValue(undefined),
}));

import * as db from './db';
import { appRouter } from './routers';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createUserContext(userId = 1, name = 'Test User', role: 'admin' | 'user' = 'user'): TrpcContext {
  return {
    user: { id: userId, name, email: 'test@example.com', openId: 'open-1', role, loginMethod: 'email' },
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext['res'],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('oauthSync.saveCredentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts credentials and logs a saved action', async () => {
    const caller = appRouter.createCaller(createUserContext(1, 'Alice'));
    await caller.oauthSync.saveCredentials({
      provider: 'google',
      clientId: 'client-id-123',
      clientSecret: 'secret-abc',
    });

    expect(db.upsertUserOauthCredential).toHaveBeenCalledWith({
      userId: 1,
      provider: 'google',
      clientId: 'client-id-123',
      clientSecret: 'secret-abc',
      tenantId: null,
    });

    expect(db.insertCredentialAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        provider: 'google',
        action: 'saved',
        performedBy: 1,
        performedByName: 'Alice',
      })
    );
  });

  it('logs a saved action for microsoft provider', async () => {
    const caller = appRouter.createCaller(createUserContext(2, 'Bob'));
    await caller.oauthSync.saveCredentials({
      provider: 'microsoft',
      clientId: 'ms-client-id',
      clientSecret: 'ms-secret',
    });

    expect(db.insertCredentialAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 2,
        provider: 'microsoft',
        action: 'saved',
        performedBy: 2,
        performedByName: 'Bob',
      })
    );
  });
});

describe('oauthSync.deleteCredentials', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes credentials and logs a cleared action', async () => {
    const caller = appRouter.createCaller(createUserContext(1, 'Alice'));
    await caller.oauthSync.deleteCredentials({ provider: 'google' });

    expect(db.deleteUserOauthCredential).toHaveBeenCalledWith(1, 'google');

    expect(db.insertCredentialAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1,
        provider: 'google',
        action: 'cleared',
        performedBy: 1,
        performedByName: 'Alice',
      })
    );
  });
});

describe('oauthSync.getCredentialAuditLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array when no entries exist', async () => {
    vi.mocked(db.getCredentialAuditLog).mockResolvedValue([]);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.getCredentialAuditLog({ provider: 'google' });
    expect(result).toEqual([]);
    expect(db.getCredentialAuditLog).toHaveBeenCalledWith(1, 'google', 10);
  });

  it('returns audit log entries for the current user', async () => {
    const mockEntries = [
      { id: 1, userId: 1, provider: 'google', action: 'saved', performedBy: 1, performedByName: 'Alice', createdAt: new Date() },
      { id: 2, userId: 1, provider: 'google', action: 'cleared', performedBy: 1, performedByName: 'Alice', createdAt: new Date() },
    ];
    vi.mocked(db.getCredentialAuditLog).mockResolvedValue(mockEntries as any);
    const caller = appRouter.createCaller(createUserContext(1, 'Alice'));
    const result = await caller.oauthSync.getCredentialAuditLog({ provider: 'google' });
    expect(result).toHaveLength(2);
    expect(result[0].action).toBe('saved');
    expect(result[1].action).toBe('cleared');
  });
});
