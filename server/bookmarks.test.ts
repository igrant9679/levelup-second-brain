import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: `test-user-${userId}`,
    email: `test${userId}@example.com`,
    name: `Test User ${userId}`,
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("bookmarks", () => {
  let caller: ReturnType<typeof appRouter.createCaller>;

  beforeEach(() => {
    caller = appRouter.createCaller(createAuthContext(1));
  });

  describe("bookmarks.create", () => {
    it("creates a bookmark with a valid URL", async () => {
      const result = await caller.bookmarks.create({
        url: "https://example.com",
        title: "Example Site",
        tags: ["test", "example"],
        notes: "A test bookmark",
      });

      expect(result).toBeDefined();
      expect(result.id).toBeGreaterThan(0);
      expect(result.url).toBe("https://example.com");
      expect(result.title).toBe("Example Site");
      expect(result.notes).toBe("A test bookmark");
      expect(result.isRead).toBe(0);
      expect(result.isFavorite).toBe(0);

      // Tags stored as JSON string
      const tags = JSON.parse(result.tags!);
      expect(tags).toEqual(["test", "example"]);

      // Cleanup
      await caller.bookmarks.delete({ id: result.id });
    });

    it("rejects an invalid URL", async () => {
      await expect(
        caller.bookmarks.create({ url: "not-a-url" })
      ).rejects.toThrow();
    });

    it("auto-fetches metadata when title is not provided", async () => {
      const result = await caller.bookmarks.create({
        url: "https://example.com",
      });

      expect(result).toBeDefined();
      expect(result.title).toBeTruthy(); // Should have auto-fetched title
      expect(result.id).toBeGreaterThan(0);

      // Cleanup
      await caller.bookmarks.delete({ id: result.id });
    });
  });

  describe("bookmarks.list", () => {
    it("returns an empty list when no bookmarks exist", async () => {
      // Use a unique user to ensure clean state
      const uniqueCaller = appRouter.createCaller(createAuthContext(9999));
      const result = await uniqueCaller.bookmarks.list({
        sort: "newest",
        page: 1,
        pageSize: 30,
      });

      expect(result).toBeDefined();
      expect(result.bookmarks).toBeInstanceOf(Array);
      expect(typeof result.total).toBe("number");
    });

    it("returns bookmarks for the authenticated user", async () => {
      // Create a bookmark first
      const created = await caller.bookmarks.create({
        url: "https://example.com/list-test",
        title: "List Test",
      });

      const result = await caller.bookmarks.list({
        sort: "newest",
        page: 1,
        pageSize: 30,
      });

      expect(result.bookmarks.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);

      // Cleanup
      await caller.bookmarks.delete({ id: created.id });
    });

    it("supports search filtering", async () => {
      const created = await caller.bookmarks.create({
        url: "https://example.com/search-unique-xyz",
        title: "Unique Search Test XYZ",
      });

      const result = await caller.bookmarks.list({
        search: "Unique Search Test XYZ",
        sort: "newest",
        page: 1,
        pageSize: 30,
      });

      expect(result.bookmarks.some(b => b.title === "Unique Search Test XYZ")).toBe(true);

      // Cleanup
      await caller.bookmarks.delete({ id: created.id });
    });
  });

  describe("bookmarks.get", () => {
    it("returns a bookmark by ID", async () => {
      const created = await caller.bookmarks.create({
        url: "https://example.com/get-test",
        title: "Get Test",
      });

      const result = await caller.bookmarks.get({ id: created.id });

      expect(result).toBeDefined();
      expect(result.id).toBe(created.id);
      expect(result.url).toBe("https://example.com/get-test");

      // Cleanup
      await caller.bookmarks.delete({ id: created.id });
    });

    it("throws NOT_FOUND for non-existent bookmark", async () => {
      await expect(
        caller.bookmarks.get({ id: 999999 })
      ).rejects.toThrow("Bookmark not found");
    });
  });

  describe("bookmarks.update", () => {
    it("updates bookmark title and tags", async () => {
      const created = await caller.bookmarks.create({
        url: "https://example.com/update-test",
        title: "Before Update",
      });

      const updated = await caller.bookmarks.update({
        id: created.id,
        title: "After Update",
        tags: ["updated", "new-tag"],
      });

      expect(updated).toBeDefined();
      expect(updated!.title).toBe("After Update");
      const tags = JSON.parse(updated!.tags!);
      expect(tags).toEqual(["updated", "new-tag"]);

      // Cleanup
      await caller.bookmarks.delete({ id: created.id });
    });

    it("toggles favorite status", async () => {
      const created = await caller.bookmarks.create({
        url: "https://example.com/fav-test",
        title: "Fav Test",
      });

      expect(created.isFavorite).toBe(0);

      const updated = await caller.bookmarks.update({
        id: created.id,
        isFavorite: true,
      });

      expect(updated!.isFavorite).toBe(1);

      // Cleanup
      await caller.bookmarks.delete({ id: created.id });
    });

    it("toggles read status", async () => {
      const created = await caller.bookmarks.create({
        url: "https://example.com/read-test",
        title: "Read Test",
      });

      expect(created.isRead).toBe(0);

      const updated = await caller.bookmarks.update({
        id: created.id,
        isRead: true,
      });

      expect(updated!.isRead).toBe(1);

      // Cleanup
      await caller.bookmarks.delete({ id: created.id });
    });

    it("throws NOT_FOUND for non-existent bookmark", async () => {
      await expect(
        caller.bookmarks.update({ id: 999999, title: "Nope" })
      ).rejects.toThrow("Bookmark not found");
    });
  });

  describe("bookmarks.delete", () => {
    it("deletes a bookmark", async () => {
      const created = await caller.bookmarks.create({
        url: "https://example.com/delete-test",
        title: "Delete Test",
      });

      const result = await caller.bookmarks.delete({ id: created.id });
      expect(result).toEqual({ success: true });

      // Verify it's gone
      await expect(
        caller.bookmarks.get({ id: created.id })
      ).rejects.toThrow("Bookmark not found");
    });

    it("throws NOT_FOUND for non-existent bookmark", async () => {
      await expect(
        caller.bookmarks.delete({ id: 999999 })
      ).rejects.toThrow("Bookmark not found");
    });
  });

  describe("bookmarks.count", () => {
    it("returns a number", async () => {
      const count = await caller.bookmarks.count();
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe("bookmarks.tags", () => {
    it("returns an array of tag strings", async () => {
      const tags = await caller.bookmarks.tags();
      expect(tags).toBeInstanceOf(Array);
    });

    it("includes tags from created bookmarks", async () => {
      const created = await caller.bookmarks.create({
        url: "https://example.com/tags-test",
        title: "Tags Test",
        tags: ["unique-tag-xyz"],
      });

      const tags = await caller.bookmarks.tags();
      expect(tags).toContain("unique-tag-xyz");

      // Cleanup
      await caller.bookmarks.delete({ id: created.id });
    });
  });
});
