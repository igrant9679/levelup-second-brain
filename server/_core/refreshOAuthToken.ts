/**
 * refreshOAuthTokenSilently — silently exchanges a stored refreshToken for a
 * new accessToken using the provider's token endpoint.
 *
 * Returns true if the token was refreshed and upserted, false otherwise.
 * Never throws — all errors are logged and swallowed so callers stay clean.
 */
import { getOAuthToken, getUserOauthCredential, upsertOAuthToken } from "../db";

interface TokenRefreshResult {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

/** Resolve the OAuth client credentials for a given user + provider. */
async function resolveClientCredentials(
  userId: number,
  provider: "google" | "microsoft"
): Promise<{ clientId: string; clientSecret: string } | null> {
  // 1. Per-user credentials stored in DB
  const userCred = await getUserOauthCredential(userId, provider);
  if (userCred?.clientId && userCred?.clientSecret) {
    return { clientId: userCred.clientId, clientSecret: userCred.clientSecret };
  }
  // 2. Environment-level credentials
  if (provider === "microsoft") {
    const clientId = process.env.MS_CLIENT_ID;
    const clientSecret = process.env.MS_CLIENT_SECRET;
    if (clientId && clientSecret) return { clientId, clientSecret };
  } else {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (clientId && clientSecret) return { clientId, clientSecret };
  }
  return null;
}

/** Exchange a refreshToken for a new accessToken at the provider's token endpoint. */
async function exchangeRefreshToken(
  provider: "google" | "microsoft",
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  tenantId?: string | null
): Promise<TokenRefreshResult | null> {
  const url =
    provider === "microsoft"
      ? `https://login.microsoftonline.com/${tenantId?.trim() || "common"}/oauth2/v2.0/token`
      : "https://oauth2.googleapis.com/token";

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    if (!resp.ok) {
      const text = await resp.text();
      console.warn(`[refreshOAuthToken] ${provider} token refresh failed (${resp.status}):`, text);
      return null;
    }
    return (await resp.json()) as TokenRefreshResult;
  } catch (err) {
    console.warn(`[refreshOAuthToken] ${provider} token refresh network error:`, err);
    return null;
  }
}

/**
 * Attempt a silent token refresh for the given user + provider.
 *
 * Only refreshes if:
 *  - a refreshToken is stored
 *  - the accessToken is expired or expires within 1 hour
 *
 * Returns true if refreshed successfully, false otherwise.
 */
export async function refreshOAuthTokenSilently(
  userId: number,
  provider: "google" | "microsoft"
): Promise<boolean> {
  try {
    const token = await getOAuthToken(userId, provider);
    if (!token || !token.refreshToken) return false;

    // Only refresh if expired or within 1 hour of expiry
    const oneHourMs = 60 * 60 * 1000;
    const expiresAt = token.expiresAt instanceof Date ? token.expiresAt : new Date(token.expiresAt);
    if (expiresAt.getTime() - Date.now() > oneHourMs) return false;

    const creds = await resolveClientCredentials(userId, provider);
    if (!creds) {
      console.warn(`[refreshOAuthToken] No client credentials for ${provider} user ${userId}`);
      return false;
    }

    // Use tenant-specific endpoint for Microsoft single-tenant apps
    const userCred = await getUserOauthCredential(userId, provider);
    const tenantId = provider === "microsoft" ? (userCred?.tenantId ?? null) : null;

    const result = await exchangeRefreshToken(
      provider,
      token.refreshToken,
      creds.clientId,
      creds.clientSecret,
      tenantId
    );
    if (!result) return false;

    const newExpiresAt = new Date(Date.now() + result.expires_in * 1000);
    await upsertOAuthToken({
      userId,
      provider,
      accessToken: result.access_token,
      refreshToken: result.refresh_token ?? token.refreshToken,
      expiresAt: newExpiresAt,
      scope: result.scope ?? token.scope ?? undefined,
      email: token.email ?? undefined,
      displayName: token.displayName ?? undefined,
    });

    console.info(`[refreshOAuthToken] Silently refreshed ${provider} token for user ${userId}`);
    return true;
  } catch (err) {
    console.error(`[refreshOAuthToken] Unexpected error for ${provider} user ${userId}:`, err);
    return false;
  }
}

/**
 * Force-refresh an OAuth token regardless of expiry time.
 * Used by the explicit "Refresh Token" button in the UI.
 *
 * Returns { success, message, expiresAt } — never throws.
 */
export async function forceRefreshOAuthToken(
  userId: number,
  provider: "google" | "microsoft"
): Promise<{ success: boolean; message: string; expiresAt?: Date }> {
  try {
    const token = await getOAuthToken(userId, provider);
    if (!token || !token.refreshToken) {
      return {
        success: false,
        message: "No refresh token stored — please Disconnect and Connect again to get a new token.",
      };
    }

    const creds = await resolveClientCredentials(userId, provider);
    if (!creds) {
      return {
        success: false,
        message: "No OAuth credentials configured. Please save your Client ID and Secret first.",
      };
    }

    const userCred = await getUserOauthCredential(userId, provider);
    const tenantId = provider === "microsoft" ? (userCred?.tenantId ?? null) : null;

    const result = await exchangeRefreshToken(
      provider,
      token.refreshToken,
      creds.clientId,
      creds.clientSecret,
      tenantId
    );
    if (!result) {
      return {
        success: false,
        message: "Token refresh failed — the refresh token may have been revoked. Please Disconnect and Connect again.",
      };
    }

    const newExpiresAt = new Date(Date.now() + result.expires_in * 1000);
    await upsertOAuthToken({
      userId,
      provider,
      accessToken: result.access_token,
      refreshToken: result.refresh_token ?? token.refreshToken,
      expiresAt: newExpiresAt,
      scope: result.scope ?? token.scope ?? undefined,
      email: token.email ?? undefined,
      displayName: token.displayName ?? undefined,
    });

    console.info(`[refreshOAuthToken] Force-refreshed ${provider} token for user ${userId}`);
    return {
      success: true,
      message: "Token refreshed successfully.",
      expiresAt: newExpiresAt,
    };
  } catch (err) {
    console.error(`[refreshOAuthToken] Force-refresh error for ${provider} user ${userId}:`, err);
    return {
      success: false,
      message: "Unexpected error during token refresh. Please try again.",
    };
  }
}
