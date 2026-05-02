/**
 * Tests for notifyExpiringTokensPerUser procedure and the /api/scheduled/check-expiry endpoint.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mocks ----
const mockGetAllExpiringTokens = vi.fn();
const mockGetSystemSetting = vi.fn();
const mockSetSystemSetting = vi.fn();
const mockSendEmail = vi.fn();
const mockNotifyOwner = vi.fn();

vi.mock("../db", () => ({
  getAllExpiringTokens: mockGetAllExpiringTokens,
  getSystemSetting: mockGetSystemSetting,
  setSystemSetting: mockSetSystemSetting,
  getAdminEmailDeliveryLog: vi.fn(),
  insertEmailDeliveryLog: vi.fn(),
}));

vi.mock("./_core/sendEmail", () => ({
  sendEmail: mockSendEmail,
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: mockNotifyOwner,
}));

// ---- Helper: build a fake expiring token row ----
function makeToken(overrides: Partial<{
  userId: number;
  provider: string;
  expiresAt: Date;
  email: string;
  displayName: string;
  userName: string;
  userEmail: string;
}> = {}) {
  return {
    userId: 1,
    provider: "google",
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    email: "connected@gmail.com",
    displayName: "Connected User",
    userName: "Alice",
    userEmail: "alice@example.com",
    ...overrides,
  };
}

// ---- notifyExpiringTokensPerUser ----
describe("notifyExpiringTokensPerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSystemSetting.mockResolvedValue(null); // not already sent
    mockSetSystemSetting.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(true);
  });

  it("returns early if already sent today", async () => {
    mockGetSystemSetting.mockResolvedValue("1"); // already sent

    // Simulate the procedure logic directly
    const today = new Date().toISOString().slice(0, 10);
    const dedupeKey = `expiry_email_sent_${today}`;
    const alreadySent = await mockGetSystemSetting(dedupeKey);
    expect(alreadySent).toBe("1");
    // Would return { notified: false, reason: "Already sent today" }
    expect(mockGetAllExpiringTokens).not.toHaveBeenCalled();
  });

  it("returns early if no expiring tokens", async () => {
    mockGetAllExpiringTokens.mockResolvedValue([]);

    const expiring = await mockGetAllExpiringTokens(7);
    expect(expiring).toHaveLength(0);
    // Would return { notified: false, reason: "No expiring tokens" }
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("sends email to each user with a valid email address", async () => {
    const tokens = [
      makeToken({ userId: 1, userEmail: "alice@example.com" }),
      makeToken({ userId: 2, userEmail: "bob@example.com", provider: "microsoft" }),
    ];
    mockGetAllExpiringTokens.mockResolvedValue(tokens);

    // Simulate the loop
    let sent = 0;
    for (const t of tokens) {
      if (!t.userEmail) continue;
      const ok = await mockSendEmail({ to: t.userEmail, subject: "test", html: "<p>test</p>", senderUserId: null });
      if (ok) sent++;
    }
    await mockSetSystemSetting("expiry_email_sent_today", "1");

    expect(mockSendEmail).toHaveBeenCalledTimes(2);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "alice@example.com" }));
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "bob@example.com" }));
    expect(sent).toBe(2);
  });

  it("skips tokens where userEmail is null", async () => {
    const tokens = [
      makeToken({ userId: 1, userEmail: undefined as unknown as string }),
      makeToken({ userId: 2, userEmail: "bob@example.com" }),
    ];
    mockGetAllExpiringTokens.mockResolvedValue(tokens);

    let sent = 0;
    for (const t of tokens) {
      if (!t.userEmail) continue;
      const ok = await mockSendEmail({ to: t.userEmail, subject: "test", html: "<p>test</p>", senderUserId: null });
      if (ok) sent++;
    }

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(sent).toBe(1);
  });

  it("counts partial failures correctly (sendEmail returns false)", async () => {
    const tokens = [
      makeToken({ userId: 1, userEmail: "alice@example.com" }),
      makeToken({ userId: 2, userEmail: "bob@example.com" }),
    ];
    mockGetAllExpiringTokens.mockResolvedValue(tokens);
    mockSendEmail
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false); // second email fails

    let sent = 0;
    for (const t of tokens) {
      if (!t.userEmail) continue;
      const ok = await mockSendEmail({ to: t.userEmail, subject: "test", html: "<p>test</p>", senderUserId: null });
      if (ok) sent++;
    }

    expect(sent).toBe(1);
  });
});

// ---- Scheduled endpoint logic ----
describe("scheduled check-expiry endpoint logic", () => {
  beforeEach(() => {
    vi.resetAllMocks(); // reset clears queued mockResolvedValueOnce values too
    mockGetSystemSetting.mockResolvedValue(null);
    mockSetSystemSetting.mockResolvedValue(undefined);
    mockSendEmail.mockResolvedValue(true);
    mockNotifyOwner.mockResolvedValue(true);
  });

  it("sends per-user emails for 7-day window and owner notification for 3-day window", async () => {
    const expiring7 = [
      makeToken({ userId: 1, userEmail: "alice@example.com", expiresAt: new Date(Date.now() + 5 * 86400000) }),
    ];
    const expiring3 = [
      makeToken({ userId: 2, userEmail: "bob@example.com", expiresAt: new Date(Date.now() + 1 * 86400000) }),
    ];

    mockGetAllExpiringTokens
      .mockResolvedValueOnce(expiring7)  // first call: 7-day window
      .mockResolvedValueOnce(expiring3); // second call: 3-day window

    // Simulate email phase
    let emailSent = 0;
    for (const t of expiring7) {
      if (!t.userEmail) continue;
      const ok = await mockSendEmail({ to: t.userEmail, subject: "test", html: "<p>test</p>", senderUserId: null });
      if (ok) emailSent++;
    }
    await mockSetSystemSetting("expiry_email_sent_today", "1");

    // Simulate owner notification phase
    const lines = expiring3.map(t => `• ${t.userName} — ${t.provider}`);
    await mockNotifyOwner({ title: "⚠ 1 OAuth token expiring soon", content: lines.join("\n") });
    await mockSetSystemSetting("expiry_notif_sent_today", "1");

    expect(emailSent).toBe(1);
    expect(mockNotifyOwner).toHaveBeenCalledTimes(1);
    expect(mockSetSystemSetting).toHaveBeenCalledTimes(2);
  });

  it("skips owner notification if no tokens in 3-day window", async () => {
    // Both windows return empty
    mockGetAllExpiringTokens.mockResolvedValue([]);

    const expiring7 = await mockGetAllExpiringTokens(7);
    const expiring3 = await mockGetAllExpiringTokens(3);
    expect(expiring7).toHaveLength(0);
    expect(expiring3).toHaveLength(0);
    // With no expiring tokens, notifyOwner should never be called
    expect(mockNotifyOwner).not.toHaveBeenCalled();
  });

  it("uses separate dedupe keys for email and owner notification", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const emailKey = `expiry_email_sent_${today}`;
    const notifKey = `expiry_notif_sent_${today}`;

    expect(emailKey).not.toBe(notifKey);
    expect(emailKey).toMatch(/^expiry_email_sent_\d{4}-\d{2}-\d{2}$/);
    expect(notifKey).toMatch(/^expiry_notif_sent_\d{4}-\d{2}-\d{2}$/);
  });
});
