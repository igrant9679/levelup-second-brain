/**
 * Vitest tests for bookmark collections and shares tRPC procedures.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appRouter } from './routers';
import type { TrpcContext } from './_core/context';
import { getDb } from './db';
import { bookmarkCollections, bookmarkCollectionItems, bookmarkShares, bookmarks } from '../drizzle/schema';
import { eq } from 'drizzle-orm';

type AuthenticatedUser = NonNullable<TrpcContext['user']>;

const TEST_USER_ID = 9998;

function createAuthContext(userId = TEST_USER_ID): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-coll-${userId}`,
    email: `testcoll${userId}@example.com`,
    name: `Test Coll User ${userId}`,
    loginMethod: 'email',
    role: 'user',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: 'https', headers: {} } as TrpcContext['req'],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext['res'],
  };
}

async function cleanupTestData() {
  const db = await getDb();
  if (!db) return;
  await db.delete(bookmarkShares).where(eq(bookmarkShares.userId, TEST_USER_ID));
  await db.delete(bookmarkCollectionItems).where(eq(bookmarkCollectionItems.userId, TEST_USER_ID));
  await db.delete(bookmarkCollections).where(eq(bookmarkCollections.userId, TEST_USER_ID));
  await db.delete(bookmarks).where(eq(bookmarks.userId, TEST_USER_ID));
}

describe('bookmark collections', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(async () => {
    await cleanupTestData();
    caller = appRouter.createCaller(createAuthContext());
  });

  afterEach(cleanupTestData);

  it('creates a collection', async () => {
    const col = await caller.bookmarks.collections.create({ name: 'Test Collection', icon: '📁', color: '#ff0000' });
    expect(col).toBeDefined();
    expect(col!.name).toBe('Test Collection');
    expect(col!.icon).toBe('📁');
    expect(col!.userId).toBe(TEST_USER_ID);
  });

  it('lists collections', async () => {
    await caller.bookmarks.collections.create({ name: 'Alpha' });
    await caller.bookmarks.collections.create({ name: 'Beta' });
    const cols = await caller.bookmarks.collections.list();
    expect(cols.length).toBeGreaterThanOrEqual(2);
    const names = cols.map(c => c.name);
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
  });

  it('updates a collection', async () => {
    const col = await caller.bookmarks.collections.create({ name: 'Before' });
    const updated = await caller.bookmarks.collections.update({ id: col!.id, name: 'After', icon: '🚀' });
    expect(updated!.name).toBe('After');
    expect(updated!.icon).toBe('🚀');
  });

  it('deletes a collection', async () => {
    const col = await caller.bookmarks.collections.create({ name: 'ToDelete' });
    await caller.bookmarks.collections.delete({ id: col!.id });
    const cols = await caller.bookmarks.collections.list();
    expect(cols.find(c => c.id === col!.id)).toBeUndefined();
  });
});

describe('bookmark shares', () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(async () => {
    await cleanupTestData();
    caller = appRouter.createCaller(createAuthContext());
  });

  afterEach(cleanupTestData);

  it('creates a selection share', async () => {
    const share = await caller.bookmarks.shares.create({
      title: 'My Share',
      shareType: 'selection',
      bookmarkIds: [1, 2, 3],
    });
    expect(share).toBeDefined();
    expect(share!.token).toBeTruthy();
    expect(share!.shareType).toBe('selection');
    expect(share!.title).toBe('My Share');
  });

  it('lists shares for the user', async () => {
    await caller.bookmarks.shares.create({ shareType: 'selection', bookmarkIds: [1] });
    const shares = await caller.bookmarks.shares.list();
    expect(shares.length).toBeGreaterThanOrEqual(1);
  });

  it('deletes a share', async () => {
    const share = await caller.bookmarks.shares.create({ shareType: 'selection', bookmarkIds: [1] });
    await caller.bookmarks.shares.delete({ id: share!.id });
    const shares = await caller.bookmarks.shares.list();
    expect(shares.find(s => s.id === share!.id)).toBeUndefined();
  });
});
