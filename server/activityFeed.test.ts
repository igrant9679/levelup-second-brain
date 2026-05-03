/**
 * Tests for the activityFeed tRPC router.
 *
 * Covers:
 * - log: authenticated user can log their own activity
 * - getTeamFeed: admin can fetch team feed; non-admin is rejected
 * - getMemberFeed: admin can fetch a specific member's feed
 * - getMemberStats: admin can fetch action summary for a member
 * - getTeamMembers: admin can list all team members
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// ─── Mock db module ───────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
  getActivityFeed: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      action: "login",
      entityType: null,
      entityTitle: null,
      metadata: null,
      createdAt: new Date("2026-01-01T10:00:00Z"),
      userName: "Alice Admin",
      userEmail: "alice@example.com",
    },
  ]),
  getActivitySummary: vi.fn().mockResolvedValue([
    { action: "login", count: 5 },
    { action: "task_created", count: 3 },
  ]),
  getTeamMembers: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Alice Admin",
      email: "alice@example.com",
      role: "admin",
      lastSignedIn: new Date("2026-01-01T10:00:00Z"),
    },
    {
      id: 2,
      name: "Bob User",
      email: "bob@example.com",
      role: "user",
      lastSignedIn: new Date("2026-01-01T09:00:00Z"),
    },
  ]),
  // Stub other db functions used by other routers
  upsertUser: vi.fn(),
  getUserById: vi.fn(),
  createBookmark: vi.fn(),
}));

// ─── Context helpers ──────────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-open-id",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCtx(user: AuthenticatedUser | null = null): TrpcContext {
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("activityFeed router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("log", () => {
    it("allows an authenticated user to log an activity", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser()));
      const result = await caller.activityFeed.log({
        action: "task_created",
        entityType: "task",
        entityTitle: "Write unit tests",
      });
      expect(result.success).toBe(true);
    });

    it("rejects unauthenticated requests", async () => {
      const caller = appRouter.createCaller(makeCtx(null));
      await expect(
        caller.activityFeed.log({ action: "login" })
      ).rejects.toThrow();
    });
  });

  describe("getTeamFeed", () => {
    it("returns feed and members for an admin user", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser({ role: "admin" })));
      const result = await caller.activityFeed.getTeamFeed({ limit: 50 });
      expect(result.feed).toBeDefined();
      expect(result.members).toBeDefined();
      expect(Array.isArray(result.feed)).toBe(true);
      expect(Array.isArray(result.members)).toBe(true);
    });

    it("rejects non-admin users with FORBIDDEN", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser({ role: "user" })));
      await expect(
        caller.activityFeed.getTeamFeed({ limit: 50 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("rejects unauthenticated requests", async () => {
      const caller = appRouter.createCaller(makeCtx(null));
      await expect(
        caller.activityFeed.getTeamFeed({ limit: 50 })
      ).rejects.toThrow();
    });
  });

  describe("getMemberFeed", () => {
    it("returns feed for a specific member when called by admin", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser({ role: "admin" })));
      const result = await caller.activityFeed.getMemberFeed({ userId: 2, limit: 30 });
      expect(result.feed).toBeDefined();
      expect(Array.isArray(result.feed)).toBe(true);
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser({ role: "user" })));
      await expect(
        caller.activityFeed.getMemberFeed({ userId: 2, limit: 30 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("getMemberStats", () => {
    it("returns action summary for a member when called by admin", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser({ role: "admin" })));
      const result = await caller.activityFeed.getMemberStats({ userId: 1 });
      expect(result.summary).toBeDefined();
      expect(Array.isArray(result.summary)).toBe(true);
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser({ role: "user" })));
      await expect(
        caller.activityFeed.getMemberStats({ userId: 1 })
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("getTeamMembers", () => {
    it("returns all team members for an admin user", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser({ role: "admin" })));
      const result = await caller.activityFeed.getTeamMembers();
      expect(result.members).toBeDefined();
      expect(Array.isArray(result.members)).toBe(true);
      expect(result.members.length).toBeGreaterThan(0);
    });

    it("rejects non-admin users", async () => {
      const caller = appRouter.createCaller(makeCtx(makeUser({ role: "user" })));
      await expect(
        caller.activityFeed.getTeamMembers()
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });
});
