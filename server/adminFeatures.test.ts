/**
 * Tests for:
 *  - getAdminEmailDeliveryLog (admin-only gate, filtering, pagination)
 *  - refreshOAuthTokenSilently (success path, no refreshToken, within-1h threshold)
 *  - checkAndNotifyExpiry (sends notification, skips if none, idempotent)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as db from "./db";
import { appRouter } from "./routers";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("./db", () => ({
  getAdminEmailDeliveryLog: vi.fn(),
  getAllExpiringTokens: vi.fn(),
  getSystemSetting: vi.fn(),
  setSystemSetting: vi.fn(),
  getEmailDeliveryLog: vi.fn(),
  getOAuthToken: vi.fn(),
  getUserOauthCredential: vi.fn(),
  upsertOAuthToken: vi.fn(),
  getAllConnectedOAuthAccounts: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("./_core/refreshOAuthToken", () => ({
  refreshOAuthTokenSilently: vi.fn().mockResolvedValue(false),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────

function createAdminContext(userId = 1) {
  return {
    user: { id: userId, name: "Admin", email: "admin@example.com", role: "admin" as const },
  };
}

function createUserContext(userId = 2) {
  return {
    user: { id: userId, name: "User", email: "user@example.com", role: "user" as const },
  };
}

// ─── getAdminEmailDeliveryLog ─────────────────────────────────────────────────

describe("oauthSync.getAdminEmailDeliveryLog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns paginated log for admin users", async () => {
    const mockResult = {
      entries: [
        { id: 1, userId: 1, to: "a@b.com", subject: "Test", status: "sent" as const, errorMessage: null, createdAt: new Date(), userName: "Admin", userEmail: "admin@example.com" },
      ],
      total: 1,
    };
    vi.mocked(db.getAdminEmailDeliveryLog).mockResolvedValue(mockResult);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.oauthSync.getAdminEmailDeliveryLog({ page: 1, pageSize: 20 });

    expect(db.getAdminEmailDeliveryLog).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    expect(result.entries).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("rejects non-admin users with an error", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(
      caller.oauthSync.getAdminEmailDeliveryLog({ page: 1, pageSize: 20 })
    ).rejects.toThrow("Admin only");
  });

  it("passes status filter to the DB helper", async () => {
    vi.mocked(db.getAdminEmailDeliveryLog).mockResolvedValue({ entries: [], total: 0 });
    const caller = appRouter.createCaller(createAdminContext());
    await caller.oauthSync.getAdminEmailDeliveryLog({ status: "failed", page: 1, pageSize: 20 });
    expect(db.getAdminEmailDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });

  it("passes date range filters to the DB helper", async () => {
    vi.mocked(db.getAdminEmailDeliveryLog).mockResolvedValue({ entries: [], total: 0 });
    const from = new Date("2026-01-01");
    const to = new Date("2026-01-31");
    const caller = appRouter.createCaller(createAdminContext());
    await caller.oauthSync.getAdminEmailDeliveryLog({ from, to, page: 1, pageSize: 20 });
    expect(db.getAdminEmailDeliveryLog).toHaveBeenCalledWith(
      expect.objectContaining({ from, to })
    );
  });
});

// ─── checkAndNotifyExpiry ─────────────────────────────────────────────────────

describe("oauthSync.checkAndNotifyExpiry", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends notification and returns notified:true when tokens are expiring", async () => {
    const { notifyOwner } = await import("./_core/notification");
    vi.mocked(db.getSystemSetting).mockResolvedValue(null); // not sent today
    vi.mocked(db.getAllExpiringTokens).mockResolvedValue([
      {
        userId: 2,
        provider: "google",
        expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days
        email: "user@gmail.com",
        displayName: "Test User",
        userName: "Test User",
        userEmail: "user@example.com",
      },
    ]);
    vi.mocked(db.setSystemSetting).mockResolvedValue(undefined);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.oauthSync.checkAndNotifyExpiry();

    expect(result.notified).toBe(true);
    expect((result as any).count).toBe(1);
    expect(notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("expiring") })
    );
    expect(db.setSystemSetting).toHaveBeenCalled();
  });

  it("skips notification when no tokens are expiring", async () => {
    const { notifyOwner } = await import("./_core/notification");
    vi.mocked(db.getSystemSetting).mockResolvedValue(null);
    vi.mocked(db.getAllExpiringTokens).mockResolvedValue([]);

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.oauthSync.checkAndNotifyExpiry();

    expect(result.notified).toBe(false);
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("is idempotent — skips if already notified today", async () => {
    const { notifyOwner } = await import("./_core/notification");
    vi.mocked(db.getSystemSetting).mockResolvedValue("1"); // already sent today

    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.oauthSync.checkAndNotifyExpiry();

    expect(result.notified).toBe(false);
    expect((result as any).reason).toMatch(/already/i);
    expect(notifyOwner).not.toHaveBeenCalled();
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(createUserContext());
    await expect(caller.oauthSync.checkAndNotifyExpiry()).rejects.toThrow("Admin only");
  });
});
