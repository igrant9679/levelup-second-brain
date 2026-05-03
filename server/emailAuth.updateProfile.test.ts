import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TrpcContext } from './_core/context';

vi.mock('./db', () => ({
  getUserByEmail: vi.fn(),
  updateUserEmail: vi.fn(),
  updateUserName: vi.fn(),
  updateUserPasswordHash: vi.fn(),
  getUserByOpenId: vi.fn(),
  upsertUser: vi.fn(),
  getDb: vi.fn().mockResolvedValue(null),
}));

vi.mock('./storage', () => ({}));
vi.mock('./_core/notification', () => ({ notifyOwner: vi.fn() }));
vi.mock('./_core/sendEmail', () => ({ sendEmail: vi.fn().mockResolvedValue(false) }));
vi.mock('./_core/sdk', () => ({
  sdk: {
    createSessionToken: vi.fn().mockResolvedValue('mock-token'),
    authenticateRequest: vi.fn(),
  },
}));
vi.mock('./_core/env', () => ({
  ENV: { ownerOpenId: 'owner-123', databaseUrl: 'mysql://test' },
}));

import * as db from './db';
import { appRouter } from './routers';
import bcrypt from 'bcryptjs';

function makeCtx(user: Partial<TrpcContext['user']> | null = null): TrpcContext {
  return {
    req: { headers: { cookie: '' }, protocol: 'https' } as TrpcContext['req'],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext['res'],
    user: user as TrpcContext['user'],
  };
}

const baseUser = {
  email: 'old@test.com', role: 'user' as const, loginMethod: 'email',
  createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
};

describe('emailAuth.updateEmail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects if no password hash on account', async () => {
    const user = { id: 1, openId: 'email:old@test.com', name: 'Test', passwordHash: null, ...baseUser };
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(
      caller.emailAuth.updateEmail({ newEmail: 'new@test.com', currentPassword: 'pass' })
    ).rejects.toThrow('No password set');
  });

  it('rejects if current password is wrong', async () => {
    const hash = await bcrypt.hash('correct', 10);
    const user = { id: 1, openId: 'email:old@test.com', name: 'Test', passwordHash: hash, ...baseUser };
    vi.mocked(db.getUserByEmail).mockResolvedValue(null);
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(
      caller.emailAuth.updateEmail({ newEmail: 'new@test.com', currentPassword: 'wrong' })
    ).rejects.toThrow('Current password is incorrect');
  });

  it('rejects if new email is already taken by another user', async () => {
    const hash = await bcrypt.hash('correct', 10);
    const user = { id: 1, openId: 'email:old@test.com', name: 'Test', passwordHash: hash, ...baseUser };
    vi.mocked(db.getUserByEmail).mockResolvedValue({ id: 99, email: 'new@test.com' } as any);
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(
      caller.emailAuth.updateEmail({ newEmail: 'new@test.com', currentPassword: 'correct' })
    ).rejects.toThrow('already in use');
  });
});

describe('emailAuth.updateName', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates name in DB', async () => {
    const user = { id: 1, openId: 'email:test@test.com', name: 'Old Name', passwordHash: null,
      ...baseUser, email: 'test@test.com' };
    vi.mocked(db.updateUserName).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(user));
    const result = await caller.emailAuth.updateName({ newName: 'New Name' });
    expect(result.success).toBe(true);
    expect(db.updateUserName).toHaveBeenCalledWith(1, 'New Name');
  });

  it('rejects empty name', async () => {
    const user = { id: 1, openId: 'email:test@test.com', name: 'Old Name', passwordHash: null,
      ...baseUser, email: 'test@test.com' };
    const caller = appRouter.createCaller(makeCtx(user));
    await expect(caller.emailAuth.updateName({ newName: '' })).rejects.toThrow();
  });
});
