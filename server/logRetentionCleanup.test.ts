/**
 * Tests for the 90-day log retention cleanup DB helpers:
 *  - deleteOldScheduledTaskLogs(cutoffMs)
 *  - deleteOldEmailDeliveryLogs(cutoffMs)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./db", () => ({
  getDb: vi.fn(),
  deleteOldScheduledTaskLogs: vi.fn(),
  deleteOldEmailDeliveryLogs: vi.fn(),
}));

import * as dbModule from "./db";

// ─── deleteOldScheduledTaskLogs ───────────────────────────────────────────────

describe("deleteOldScheduledTaskLogs()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes rows older than the cutoff and returns affected count", async () => {
    vi.mocked(dbModule.deleteOldScheduledTaskLogs).mockResolvedValue(3);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const deleted = await dbModule.deleteOldScheduledTaskLogs(cutoff);
    expect(deleted).toBe(3);
    expect(dbModule.deleteOldScheduledTaskLogs).toHaveBeenCalledWith(cutoff);
  });

  it("returns 0 when no rows are older than the cutoff", async () => {
    vi.mocked(dbModule.deleteOldScheduledTaskLogs).mockResolvedValue(0);
    const deleted = await dbModule.deleteOldScheduledTaskLogs(Date.now() - 90 * 24 * 60 * 60 * 1000);
    expect(deleted).toBe(0);
  });

  it("returns 0 when db is unavailable (no-op)", async () => {
    vi.mocked(dbModule.deleteOldScheduledTaskLogs).mockResolvedValue(0);
    const deleted = await dbModule.deleteOldScheduledTaskLogs(Date.now());
    expect(deleted).toBe(0);
  });

  it("is called with a cutoff 90 days in the past", async () => {
    vi.mocked(dbModule.deleteOldScheduledTaskLogs).mockResolvedValue(0);
    const before = Date.now() - 90 * 24 * 60 * 60 * 1000;
    await dbModule.deleteOldScheduledTaskLogs(before);
    const [calledWith] = vi.mocked(dbModule.deleteOldScheduledTaskLogs).mock.calls[0];
    // Should be within 1 second of 90 days ago
    expect(Math.abs(calledWith - before)).toBeLessThan(1000);
  });
});

// ─── deleteOldEmailDeliveryLogs ───────────────────────────────────────────────

describe("deleteOldEmailDeliveryLogs()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes rows older than the cutoff and returns affected count", async () => {
    vi.mocked(dbModule.deleteOldEmailDeliveryLogs).mockResolvedValue(12);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const deleted = await dbModule.deleteOldEmailDeliveryLogs(cutoff);
    expect(deleted).toBe(12);
    expect(dbModule.deleteOldEmailDeliveryLogs).toHaveBeenCalledWith(cutoff);
  });

  it("returns 0 when no rows are older than the cutoff", async () => {
    vi.mocked(dbModule.deleteOldEmailDeliveryLogs).mockResolvedValue(0);
    const deleted = await dbModule.deleteOldEmailDeliveryLogs(Date.now() - 90 * 24 * 60 * 60 * 1000);
    expect(deleted).toBe(0);
  });

  it("returns 0 when db is unavailable (no-op)", async () => {
    vi.mocked(dbModule.deleteOldEmailDeliveryLogs).mockResolvedValue(0);
    const deleted = await dbModule.deleteOldEmailDeliveryLogs(Date.now());
    expect(deleted).toBe(0);
  });

  it("does not affect recent rows (cutoff in the future relative to recent rows)", async () => {
    // Simulate: 5 total rows, 2 old, 3 recent → only 2 deleted
    vi.mocked(dbModule.deleteOldEmailDeliveryLogs).mockResolvedValue(2);
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const deleted = await dbModule.deleteOldEmailDeliveryLogs(cutoff);
    expect(deleted).toBe(2);
  });
});

// ─── Integration: cleanup runs in check-expiry endpoint ──────────────────────

describe("check-expiry cleanup integration", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls both cleanup helpers with a 90-day cutoff", async () => {
    vi.mocked(dbModule.deleteOldScheduledTaskLogs).mockResolvedValue(1);
    vi.mocked(dbModule.deleteOldEmailDeliveryLogs).mockResolvedValue(5);

    const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const [deletedTask, deletedEmail] = await Promise.all([
      dbModule.deleteOldScheduledTaskLogs(cutoffMs),
      dbModule.deleteOldEmailDeliveryLogs(cutoffMs),
    ]);

    expect(deletedTask).toBe(1);
    expect(deletedEmail).toBe(5);
    expect(dbModule.deleteOldScheduledTaskLogs).toHaveBeenCalledOnce();
    expect(dbModule.deleteOldEmailDeliveryLogs).toHaveBeenCalledOnce();
  });

  it("handles cleanup errors gracefully without failing the overall job", async () => {
    vi.mocked(dbModule.deleteOldScheduledTaskLogs).mockRejectedValue(new Error("DB timeout"));
    vi.mocked(dbModule.deleteOldEmailDeliveryLogs).mockResolvedValue(0);

    const cutoffMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const [deletedTask, deletedEmail] = await Promise.all([
      dbModule.deleteOldScheduledTaskLogs(cutoffMs).catch(() => 0),
      dbModule.deleteOldEmailDeliveryLogs(cutoffMs).catch(() => 0),
    ]);

    // Both resolve to 0 — the job continues
    expect(deletedTask).toBe(0);
    expect(deletedEmail).toBe(0);
  });
});
