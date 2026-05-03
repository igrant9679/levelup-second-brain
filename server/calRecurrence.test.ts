/**
 * Tests for calendar event recurrence and updateCalendarEvent procedure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { appRouter } from './routers';
import type { Context } from './_core/context';

// Mock the db module
vi.mock('./db', () => ({
  updateCalendarEvent: vi.fn(),
  deleteCalendarEvent: vi.fn(),
}));

import * as db from './db';

const mockUser = { id: 42, role: 'admin' as const, name: 'Test Admin', email: 'admin@test.com', openId: 'test-open-id', loginMethod: 'email', createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), passwordHash: null };

function makeCaller(user = mockUser) {
  const ctx = { user } as unknown as Context;
  return appRouter.createCaller(ctx);
}

describe('oauthSync.updateCalendarEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates a calendar event with recurrence field', async () => {
    const updatedEvent = {
      id: 1,
      userId: 42,
      provider: 'manual',
      eventId: 'evt-1',
      title: 'Weekly Standup',
      start: new Date('2026-05-05T09:00:00Z'),
      end: new Date('2026-05-05T09:30:00Z'),
      location: 'Zoom',
      description: null,
      organizer: null,
      isAllDay: 0,
      status: 'confirmed',
      recurrence: 'weekly',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(db.updateCalendarEvent).mockResolvedValue(updatedEvent);

    const caller = makeCaller();
    const result = await caller.oauthSync.updateCalendarEvent({
      id: 1,
      title: 'Weekly Standup',
      recurrence: 'weekly',
    });

    expect(db.updateCalendarEvent).toHaveBeenCalledWith(42, 1, expect.objectContaining({
      title: 'Weekly Standup',
      recurrence: 'weekly',
    }));
    expect(result.recurrence).toBe('weekly');
  });

  it('accepts all valid recurrence values', async () => {
    const validValues = ['none', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'] as const;
    for (const recurrence of validValues) {
      vi.mocked(db.updateCalendarEvent).mockResolvedValue({
        id: 1, userId: 42, provider: 'manual', eventId: 'evt-1',
        title: 'Test', start: new Date(), end: new Date(),
        location: null, description: null, organizer: null,
        isAllDay: 0, status: 'confirmed', recurrence,
        createdAt: new Date(), updatedAt: new Date(),
      });
      const caller = makeCaller();
      const result = await caller.oauthSync.updateCalendarEvent({ id: 1, recurrence });
      expect(result.recurrence).toBe(recurrence);
    }
  });

  it('throws NOT_FOUND when event does not exist', async () => {
    vi.mocked(db.updateCalendarEvent).mockResolvedValue(null);
    const caller = makeCaller();
    await expect(
      caller.oauthSync.updateCalendarEvent({ id: 999, title: 'Ghost' })
    ).rejects.toThrow('Calendar event not found');
  });

  it('rejects invalid recurrence values', async () => {
    const caller = makeCaller();
    await expect(
      // @ts-expect-error intentionally invalid
      caller.oauthSync.updateCalendarEvent({ id: 1, recurrence: 'hourly' })
    ).rejects.toThrow();
  });
});

describe('role-based gating: teamInvites admin procedures', () => {
  it('throws FORBIDDEN for non-admin user on teamInvites.list', async () => {
    const userCtx = { user: { ...mockUser, role: 'user' as const } } as unknown as Context;
    const caller = appRouter.createCaller(userCtx);
    await expect(caller.teamInvites.list()).rejects.toThrow();
  });

  it('allows admin user to call teamInvites.list without FORBIDDEN error', async () => {
    // We just check it doesn't throw FORBIDDEN — DB errors are fine in test
    const caller = makeCaller();
    // It may throw a DB error (no real DB in test) but NOT a FORBIDDEN error
    try {
      await caller.teamInvites.list();
    } catch (err: unknown) {
      const msg = (err as Error).message || '';
      expect(msg).not.toContain('FORBIDDEN');
      expect(msg).not.toContain('permission');
    }
  });
});
