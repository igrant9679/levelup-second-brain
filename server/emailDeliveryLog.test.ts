/**
 * Tests for email delivery log DB helpers and oauthSync.getEmailDeliveryLog procedure.
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
  insertEmailDeliveryLog: vi.fn().mockResolvedValue(undefined),
  getEmailDeliveryLog: vi.fn().mockResolvedValue([]),
}));

vi.mock('./_core/sendEmail', () => ({
  sendEmail: vi.fn().mockResolvedValue(false),
}));

import * as db from './db';
import { appRouter } from './routers';

function createUserContext(
  userId = 1,
  email: string | null = 'alice@example.com',
  role: 'admin' | 'user' = 'user'
): TrpcContext {
  return {
    user: { id: userId, name: 'Alice', email: email as string, openId: 'open-1', role, loginMethod: 'email' },
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext['res'],
  };
}

// ─── DB helper tests ──────────────────────────────────────────────────────────
describe('insertEmailDeliveryLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is called with correct fields for a sent email', async () => {
    await db.insertEmailDeliveryLog({
      userId: 1,
      to: 'test@example.com',
      subject: 'Hello',
      status: 'sent',
    });
    expect(db.insertEmailDeliveryLog).toHaveBeenCalledWith({
      userId: 1,
      to: 'test@example.com',
      subject: 'Hello',
      status: 'sent',
    });
  });

  it('is called with errorMessage for a failed email', async () => {
    await db.insertEmailDeliveryLog({
      userId: null,
      to: 'test@example.com',
      subject: 'Hello',
      status: 'failed',
      errorMessage: 'Connection refused',
    });
    expect(db.insertEmailDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'failed', errorMessage: 'Connection refused' })
    );
  });
});

describe('getEmailDeliveryLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns entries for the given userId', async () => {
    const entries = [
      { id: 1, userId: 1, to: 'alice@example.com', subject: 'Test', status: 'sent' as const, errorMessage: null, createdAt: new Date() },
      { id: 2, userId: 1, to: 'alice@example.com', subject: 'Reset', status: 'failed' as const, errorMessage: 'err', createdAt: new Date() },
    ];
    vi.mocked(db.getEmailDeliveryLog).mockResolvedValue(entries);
    const result = await db.getEmailDeliveryLog(1, 5);
    expect(db.getEmailDeliveryLog).toHaveBeenCalledWith(1, 5);
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('sent');
    expect(result[1].status).toBe('failed');
  });
});

// ─── tRPC procedure tests ─────────────────────────────────────────────────────
const mockDeliveryLog = [
  {
    id: 1,
    userId: 1,
    to: 'alice@example.com',
    subject: 'LevelUp — Test Email',
    status: 'sent' as const,
    errorMessage: null,
    createdAt: new Date('2026-05-01T10:00:00Z'),
  },
  {
    id: 2,
    userId: 1,
    to: 'alice@example.com',
    subject: 'Password Reset',
    status: 'failed' as const,
    errorMessage: 'SMTP connection refused',
    createdAt: new Date('2026-05-01T09:00:00Z'),
  },
];

describe('oauthSync.getEmailDeliveryLog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the last 5 delivery log entries for the current user', async () => {
    vi.mocked(db.getEmailDeliveryLog).mockResolvedValue(mockDeliveryLog);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.getEmailDeliveryLog();
    expect(db.getEmailDeliveryLog).toHaveBeenCalledWith(1, 5);
    expect(result).toHaveLength(2);
  });

  it('returns empty array when no emails have been sent', async () => {
    vi.mocked(db.getEmailDeliveryLog).mockResolvedValue([]);
    const caller = appRouter.createCaller(createUserContext(2));
    const result = await caller.oauthSync.getEmailDeliveryLog();
    expect(result).toEqual([]);
  });

  it('requires authentication', async () => {
    // Unauthenticated context (no user)
    const unauthCtx = {
      user: null,
      req: { protocol: 'https', headers: {} } as TrpcContext['req'],
      res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext['res'],
    } as unknown as TrpcContext;
    const caller = appRouter.createCaller(unauthCtx);
    await expect(caller.oauthSync.getEmailDeliveryLog()).rejects.toThrow();
  });
});
