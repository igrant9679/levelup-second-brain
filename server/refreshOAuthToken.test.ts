/**
 * Tests for refreshOAuthTokenSilently helper.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db helpers used by the refresh helper
vi.mock("./db", () => ({
  getOAuthToken: vi.fn(),
  getUserOauthCredential: vi.fn(),
  upsertOAuthToken: vi.fn(),
}));

import * as db from "./db";
import { refreshOAuthTokenSilently } from "./_core/refreshOAuthToken";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("refreshOAuthTokenSilently", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_CLIENT_ID = "test-google-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
    process.env.MS_CLIENT_ID = "test-ms-id";
    process.env.MS_CLIENT_SECRET = "test-ms-secret";
  });

  it("returns false when no token is stored", async () => {
    vi.mocked(db.getOAuthToken).mockResolvedValue(null);
    const result = await refreshOAuthTokenSilently(1, "google");
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns false when token has no refreshToken", async () => {
    vi.mocked(db.getOAuthToken).mockResolvedValue({
      id: 1,
      userId: 1,
      provider: "google",
      accessToken: "access",
      refreshToken: null,
      expiresAt: new Date(Date.now() - 1000), // expired
      scope: null,
      email: null,
      displayName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await refreshOAuthTokenSilently(1, "google");
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns false when token is still valid (more than 1 hour remaining)", async () => {
    vi.mocked(db.getOAuthToken).mockResolvedValue({
      id: 1,
      userId: 1,
      provider: "google",
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
      scope: null,
      email: null,
      displayName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const result = await refreshOAuthTokenSilently(1, "google");
    expect(result).toBe(false);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("refreshes token when expired and returns true on success", async () => {
    vi.mocked(db.getOAuthToken).mockResolvedValue({
      id: 1,
      userId: 1,
      provider: "google",
      accessToken: "old-access",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() - 5000), // expired
      scope: "email profile",
      email: "user@gmail.com",
      displayName: "Test User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.getUserOauthCredential).mockResolvedValue(null); // use env creds

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: "new-access-token",
        expires_in: 3600,
        refresh_token: "new-refresh-token",
      }),
    });
    vi.mocked(db.upsertOAuthToken).mockResolvedValue({} as any);

    const result = await refreshOAuthTokenSilently(1, "google");
    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      "https://oauth2.googleapis.com/token",
      expect.objectContaining({ method: "POST" })
    );
    expect(db.upsertOAuthToken).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
      })
    );
  });

  it("returns false when the provider token endpoint returns an error", async () => {
    vi.mocked(db.getOAuthToken).mockResolvedValue({
      id: 1,
      userId: 1,
      provider: "microsoft",
      accessToken: "old-access",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() - 5000), // expired
      scope: null,
      email: null,
      displayName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(db.getUserOauthCredential).mockResolvedValue(null);

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"invalid_grant"}',
    });

    const result = await refreshOAuthTokenSilently(1, "microsoft");
    expect(result).toBe(false);
    expect(db.upsertOAuthToken).not.toHaveBeenCalled();
  });
});
