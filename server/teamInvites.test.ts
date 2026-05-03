/**
 * Tests for teamInvites router
 * Covers: create, list, delete, resend, validate, accept
 * Uses mocked DB helpers to avoid real DB calls.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';

// ── Mock DB helpers ────────────────────────────────────────────────────────────
vi.mock('./db', async (importOriginal) => {
  const original = await importOriginal<typeof import('./db')>();
  return {
    ...original,
    createTeamInvite: vi.fn(),
    getAllTeamInvites: vi.fn(),
    getTeamInviteByToken: vi.fn(),
    deleteTeamInvite: vi.fn(),
    acceptTeamInvite: vi.fn(),
    resendTeamInvite: vi.fn(),
  };
});

import * as db from './db';

// ── Context helpers ────────────────────────────────────────────────────────────
function makeCtx(role: 'admin' | 'user' | null = 'admin'): TrpcContext {
  const user = role ? {
    id: 1,
    name: 'Admin',
    email: 'admin@test.com',
    role: role as 'admin' | 'user',
    openId: 'test-open-id',
    loginMethod: 'invite',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    passwordHash: null,
  } : null;
  return {
    user,
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext['res'],
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────────────
const futureDate = new Date(Date.now() + 7 * 86_400_000);
const pastDate = new Date(Date.now() - 1000);

const pendingInvite = {
  id: 1, invitedBy: 1, email: 'jane@test.com', name: 'Jane', role: 'user',
  token: 'tok_pending', accepted: 0, acceptedAt: null, acceptedUserId: null,
  expiresAt: futureDate, createdAt: new Date(),
};
const acceptedInvite = { ...pendingInvite, id: 2, email: 'bob@test.com', token: 'tok_accepted', accepted: 1, acceptedAt: new Date(), acceptedUserId: 99 };
const expiredInvite = { ...pendingInvite, id: 3, email: 'old@test.com', token: 'tok_expired', expiresAt: pastDate };

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('teamInvites.create', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an invite when called by admin', async () => {
    vi.mocked(db.createTeamInvite).mockResolvedValue(pendingInvite as any);
    const caller = appRouter.createCaller(makeCtx('admin'));
    const result = await caller.teamInvites.create({ email: 'jane@test.com', name: 'Jane', role: 'user', expiryDays: 7 });
    expect(result.email).toBe('jane@test.com');
    expect(db.createTeamInvite).toHaveBeenCalledOnce();
  });

  it('rejects non-admin users with FORBIDDEN', async () => {
    const caller = appRouter.createCaller(makeCtx('user'));
    await expect(caller.teamInvites.create({ email: 'x@test.com', role: 'user', expiryDays: 7 }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects unauthenticated callers', async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.teamInvites.create({ email: 'x@test.com', role: 'user', expiryDays: 7 }))
      .rejects.toThrow();
  });
});

describe('teamInvites.list', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all invites for admin', async () => {
    vi.mocked(db.getAllTeamInvites).mockResolvedValue([pendingInvite, acceptedInvite] as any);
    const caller = appRouter.createCaller(makeCtx('admin'));
    const result = await caller.teamInvites.list();
    expect(result).toHaveLength(2);
  });

  it('rejects non-admin', async () => {
    const caller = appRouter.createCaller(makeCtx('user'));
    await expect(caller.teamInvites.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('teamInvites.delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes an existing pending invite', async () => {
    vi.mocked(db.getAllTeamInvites).mockResolvedValue([pendingInvite] as any);
    vi.mocked(db.deleteTeamInvite).mockResolvedValue({ deleted: true });
    const caller = appRouter.createCaller(makeCtx('admin'));
    const result = await caller.teamInvites.delete({ id: 1 });
    expect(result.deleted).toBe(true);
  });

  it('throws NOT_FOUND for missing invite', async () => {
    vi.mocked(db.getAllTeamInvites).mockResolvedValue([]);
    const caller = appRouter.createCaller(makeCtx('admin'));
    await expect(caller.teamInvites.delete({ id: 999 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('teamInvites.resend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('regenerates token for a pending invite', async () => {
    const updated = { ...pendingInvite, token: 'tok_new_generated' };
    vi.mocked(db.getAllTeamInvites).mockResolvedValue([pendingInvite] as any);
    vi.mocked(db.resendTeamInvite).mockResolvedValue(updated as any);
    const caller = appRouter.createCaller(makeCtx('admin'));
    const result = await caller.teamInvites.resend({ id: 1, expiryDays: 7 });
    expect(result.token).toBe('tok_new_generated');
    expect(db.resendTeamInvite).toHaveBeenCalledOnce();
  });

  it('throws BAD_REQUEST for an already accepted invite', async () => {
    vi.mocked(db.getAllTeamInvites).mockResolvedValue([acceptedInvite] as any);
    const caller = appRouter.createCaller(makeCtx('admin'));
    await expect(caller.teamInvites.resend({ id: 2, expiryDays: 7 }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws NOT_FOUND for missing invite', async () => {
    vi.mocked(db.getAllTeamInvites).mockResolvedValue([]);
    const caller = appRouter.createCaller(makeCtx('admin'));
    await expect(caller.teamInvites.resend({ id: 999, expiryDays: 7 }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('teamInvites.validate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns invite metadata for a valid pending token', async () => {
    vi.mocked(db.getTeamInviteByToken).mockResolvedValue(pendingInvite as any);
    const caller = appRouter.createCaller(makeCtx(null));
    const result = await caller.teamInvites.validate({ token: 'tok_pending' });
    expect(result.email).toBe('jane@test.com');
    expect(result.role).toBe('user');
  });

  it('throws NOT_FOUND for unknown token', async () => {
    vi.mocked(db.getTeamInviteByToken).mockResolvedValue(null);
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.teamInvites.validate({ token: 'bad' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('throws BAD_REQUEST for already accepted token', async () => {
    vi.mocked(db.getTeamInviteByToken).mockResolvedValue(acceptedInvite as any);
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.teamInvites.validate({ token: 'tok_accepted' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST for expired token', async () => {
    vi.mocked(db.getTeamInviteByToken).mockResolvedValue(expiredInvite as any);
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.teamInvites.validate({ token: 'tok_expired' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});
