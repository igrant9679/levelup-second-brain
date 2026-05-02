/**
 * Tests for new tRPC procedures:
 * - oauthSync.getEmailNotifications
 * - oauthSync.markEmailNotificationRead
 * - oauthSync.markAllEmailNotificationsRead
 * - oauthSync.getEventReminders
 * - oauthSync.createEventReminders
 * - oauthSync.dismissEventReminder
 * - oauthSync.getSyncStatusAll
 * - oauthSync.bulkImportCalendar
 * - oauthSync.bulkImportMail
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// ─── Mocks ────────────────────────────────────────────────────────────────────
vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getUnreadEmailNotifications: vi.fn().mockResolvedValue([]),
    getDb: vi.fn().mockResolvedValue(null),
    getAllSyncStatus: vi.fn().mockResolvedValue([]),
    getOAuthToken: vi.fn().mockResolvedValue(null),
    createEventReminder: vi.fn().mockResolvedValue(undefined),
    updateOAuthTokenLastSynced: vi.fn().mockResolvedValue(undefined),
    updateSyncStatus: vi.fn().mockResolvedValue(undefined),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function createUserContext(
  userId = 1,
  name = "Test User",
  email: string | null = "test@example.com",
  role: "admin" | "user" = "user"
): TrpcContext {
  return {
    user: { id: userId, name, email: email as string, openId: "open-1", role, loginMethod: "email" },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Email Notifications ──────────────────────────────────────────────────────
describe("oauthSync.getEmailNotifications", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when no notifications exist", async () => {
    const { getUnreadEmailNotifications } = await import("./db");
    vi.mocked(getUnreadEmailNotifications).mockResolvedValue([]);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.getEmailNotifications();
    expect(result).toEqual([]);
    expect(getUnreadEmailNotifications).toHaveBeenCalledWith(1);
  });

  it("returns notifications for the correct user", async () => {
    const { getUnreadEmailNotifications } = await import("./db");
    const mockNotifications = [
      {
        id: 1,
        userId: 2,
        provider: "microsoft",
        emailSubject: "Test Email",
        emailFrom: "sender@example.com",
        emailId: "msg-001",
        read: 0 as 0,
        createdAt: new Date("2026-05-01T10:00:00Z"),
      },
    ];
    vi.mocked(getUnreadEmailNotifications).mockResolvedValue(mockNotifications);
    const caller = appRouter.createCaller(createUserContext(2));
    const result = await caller.oauthSync.getEmailNotifications();
    expect(result).toHaveLength(1);
    expect(result[0].emailSubject).toBe("Test Email");
    expect(getUnreadEmailNotifications).toHaveBeenCalledWith(2);
  });
});

describe("oauthSync.markEmailNotificationRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success:false when db is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.markEmailNotificationRead({ id: 42 });
    expect(result.success).toBe(false);
  });
});

describe("oauthSync.markAllEmailNotificationsRead", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success:false when db is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.markAllEmailNotificationsRead();
    expect(result.success).toBe(false);
  });
});

// ─── Event Reminders ──────────────────────────────────────────────────────────
describe("oauthSync.getEventReminders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty array when db is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.getEventReminders();
    expect(result).toEqual([]);
  });
});

describe("oauthSync.createEventReminders", () => {
  beforeEach(() => vi.clearAllMocks());

  it("skips past events and only creates reminders for future events", async () => {
    const { createEventReminder } = await import("./db");
    vi.mocked(createEventReminder).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createUserContext(1));
    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const result = await caller.oauthSync.createEventReminders({
      events: [
        { eventId: "past-1", eventTitle: "Past Event", eventStart: pastDate, provider: "microsoft" },
        { eventId: "future-1", eventTitle: "Future Event", eventStart: futureDate, provider: "microsoft" },
      ],
    });
    // 3 reminder types for 1 future event = 3 created
    expect(result.created).toBe(3);
    expect(createEventReminder).toHaveBeenCalledTimes(3);
  });

  it("returns 0 when all events are in the past", async () => {
    const { createEventReminder } = await import("./db");
    vi.mocked(createEventReminder).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createUserContext(1));
    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const result = await caller.oauthSync.createEventReminders({
      events: [
        { eventId: "past-1", eventTitle: "Old Meeting", eventStart: pastDate, provider: "microsoft" },
      ],
    });
    expect(result.created).toBe(0);
    expect(createEventReminder).not.toHaveBeenCalled();
  });

  it("creates 3 reminder types (5min, 15min, 1hour) per future event", async () => {
    const { createEventReminder } = await import("./db");
    vi.mocked(createEventReminder).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createUserContext(1));
    const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
    await caller.oauthSync.createEventReminders({
      events: [
        { eventId: "ev-1", eventTitle: "Team Meeting", eventStart: futureDate, provider: "microsoft" },
      ],
    });
    const calls = vi.mocked(createEventReminder).mock.calls;
    const reminderTypes = calls.map((c) => c[0].reminderType);
    expect(reminderTypes).toContain("5min");
    expect(reminderTypes).toContain("15min");
    expect(reminderTypes).toContain("1hour");
  });
});

describe("oauthSync.dismissEventReminder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns success:false when db is unavailable", async () => {
    const { getDb } = await import("./db");
    vi.mocked(getDb).mockResolvedValue(null);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.dismissEventReminder({ id: 5 });
    expect(result.success).toBe(false);
  });
});

// ─── Sync Status Dashboard ────────────────────────────────────────────────────
describe("oauthSync.getSyncStatusAll", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns empty providers and null microsoftLastSyncedAt when no data", async () => {
    const { getAllSyncStatus, getOAuthToken } = await import("./db");
    vi.mocked(getAllSyncStatus).mockResolvedValue([]);
    vi.mocked(getOAuthToken).mockResolvedValue(null);
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.getSyncStatusAll();
    expect(result.providers).toEqual([]);
    expect(result.microsoftLastSyncedAt).toBeNull();
  });

  it("includes microsoftLastSyncedAt from oauth token when available", async () => {
    const { getAllSyncStatus, getOAuthToken } = await import("./db");
    vi.mocked(getAllSyncStatus).mockResolvedValue([]);
    const lastSynced = new Date("2026-05-01T12:00:00Z");
    vi.mocked(getOAuthToken).mockResolvedValue({
      id: 1,
      userId: 1,
      provider: "microsoft",
      accessToken: "tok",
      refreshToken: "ref",
      expiresAt: new Date(Date.now() + 3600000),
      email: "user@example.com",
      displayName: "User",
      lastSyncedAt: lastSynced,
      syncFrequency: "manual",
      autoSyncEnabled: 0,
    });
    const caller = appRouter.createCaller(createUserContext(1));
    const result = await caller.oauthSync.getSyncStatusAll();
    expect(result.microsoftLastSyncedAt).toEqual(lastSynced);
  });
});

// ─── Bulk Import ──────────────────────────────────────────────────────────────
describe("oauthSync.bulkImportCalendar", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws PRECONDITION_FAILED when not connected to provider", async () => {
    const { getOAuthToken } = await import("./db");
    vi.mocked(getOAuthToken).mockResolvedValue(null);
    const caller = appRouter.createCaller(createUserContext(1));
    await expect(
      caller.oauthSync.bulkImportCalendar({
        provider: "microsoft",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
      })
    ).rejects.toThrow();
  });
});

describe("oauthSync.bulkImportMail", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws PRECONDITION_FAILED when not connected to provider", async () => {
    const { getOAuthToken } = await import("./db");
    vi.mocked(getOAuthToken).mockResolvedValue(null);
    const caller = appRouter.createCaller(createUserContext(1));
    await expect(
      caller.oauthSync.bulkImportMail({
        provider: "microsoft",
        startDate: "2026-01-01",
        endDate: "2026-01-31",
        limit: 50,
      })
    ).rejects.toThrow();
  });
});
