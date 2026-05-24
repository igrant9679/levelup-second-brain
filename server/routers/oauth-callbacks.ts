/**
 * Provider OAuth callback routes (Express, not tRPC)
 * Registered in server/_core/index.ts
 *
 * GET /api/oauth/microsoft/callback
 * (Google OAuth removed — replaced with SMTP/IMAP secondary account)
 */

import type { Express, Request, Response } from "express";
import * as db from "../db";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Build a URL-encoded form body that preserves ~ as a literal character.
 * URLSearchParams encodes ~ as %7E, but Microsoft's token endpoint rejects this.
 * RFC 3986 marks ~ as an unreserved character that SHOULD NOT be percent-encoded.
 */
function buildFormBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v).replace(/%7E/gi, '~'))
    .join('&');
}

function parseState(state: string): { userId: number; origin: string; tenantId?: string | null } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf-8");
    const parsed = JSON.parse(decoded) as { userId: number; origin: string; tenantId?: string | null };
    if (!parsed.userId || !parsed.origin) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function registerProviderOAuthCallbacks(app: Express) {
  // ---- Microsoft ----
  app.get("/api/oauth/microsoft/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const error = getQueryParam(req, "error");

    if (error) {
      console.error("[MS OAuth] Error:", error, getQueryParam(req, "error_description"));
      res.redirect("/?oauth_error=microsoft_denied");
      return;
    }

    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }

    const stateData = parseState(state);
    if (!stateData) {
      res.status(400).send("Invalid state");
      return;
    }

    // Use per-user credentials if available, otherwise fall back to env vars
    const userCred = await db.getUserOauthCredential(stateData.userId, "microsoft");
    const clientId = (userCred?.clientId || process.env.MS_CLIENT_ID) ?? "";
    const clientSecret = (userCred?.clientSecret || process.env.MS_CLIENT_SECRET) ?? "";
    // Use tenant-specific endpoint if tenantId was encoded in state (single-tenant apps)
    const tenantId = (stateData.tenantId?.trim() || userCred?.tenantId?.trim() || process.env.MS_TENANT_ID) ?? "common";
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const redirectUri = `${stateData.origin}/api/oauth/microsoft/callback`;

    try {
      // Exchange code for tokens
      // NOTE: buildFormBody is used instead of URLSearchParams because URLSearchParams
      // encodes ~ as %7E, but Microsoft's token endpoint rejects this encoding.
      const tokenResp = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: buildFormBody({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResp.ok) {
        const body = await tokenResp.text();
        console.error("[MS OAuth] Token exchange failed:", body);
        // Parse the error description from Microsoft's response for better UX
        let msErrorDesc = "token_exchange_failed";
        try {
          const errJson = JSON.parse(body) as { error?: string; error_description?: string };
          if (errJson.error_description) {
            // Truncate and sanitise for URL safety
            msErrorDesc = errJson.error_description.split('\n')[0].slice(0, 120).replace(/[^a-zA-Z0-9 _:.-]/g, ' ');
          } else if (errJson.error) {
            msErrorDesc = errJson.error;
          }
        } catch { /* not JSON */ }
        console.error("[MS OAuth] Parsed error:", msErrorDesc);
        res.redirect(`/?oauth_error=microsoft_token&ms_err=${encodeURIComponent(msErrorDesc)}`);
        return;
      }

      const tokenData = await tokenResp.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
      };

      // Get user profile
      const profileResp = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = profileResp.ok
        ? await profileResp.json() as { displayName?: string; mail?: string; userPrincipalName?: string }
        : {};

      await db.upsertOAuthToken({
        userId: stateData.userId,
        provider: "microsoft",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scope: tokenData.scope,
        email: profile.mail ?? profile.userPrincipalName ?? null,
        displayName: profile.displayName ?? null,
      });

      res.redirect("/?oauth_success=microsoft");
    } catch (err) {
      console.error("[MS OAuth] Callback error:", err);
      res.redirect("/?oauth_error=microsoft_server");
    }
  });

  // ---- Google ----
  // Google OAuth removed — replaced with SMTP/IMAP secondary account

  // ---- Nifty ----
  // Nifty uses authorization-code OAuth 2.0. Consent at https://nifty.pm/authorize,
  // token exchange at https://openapi.niftypm.com/oauth/token with HTTP Basic
  // auth (base64 client_id:client_secret). Stores tokens in
  // external_source_credentials (source='nifty'). State carries userId +
  // origin so we know which row to update after the redirect.
  app.get("/api/oauth/nifty/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const error = getQueryParam(req, "error");
    if (error) {
      console.error("[Nifty OAuth] Error:", error, getQueryParam(req, "error_description"));
      res.redirect("/?oauth_error=nifty_denied");
      return;
    }
    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }
    const stateData = parseState(state);
    if (!stateData) {
      res.status(400).send("Invalid state");
      return;
    }
    // Load the user's stored clientId / clientSecret for nifty.
    const cred = await db.getExternalSourceCredential(stateData.userId, "nifty");
    if (!cred?.clientId || !cred?.clientSecret) {
      res.redirect("/?oauth_error=nifty_no_app");
      return;
    }
    const redirectUri = `${stateData.origin}/api/oauth/nifty/callback`;
    const basic = Buffer.from(`${cred.clientId}:${cred.clientSecret}`).toString("base64");
    try {
      console.log("[Nifty OAuth] Exchanging code for token. redirect_uri=", redirectUri, "clientId starts=", cred.clientId.slice(0, 6));
      const tokenResp = await fetch("https://openapi.niftypm.com/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${basic}`,
        },
        body: JSON.stringify({
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      console.log("[Nifty OAuth] Token response status:", tokenResp.status);
      if (!tokenResp.ok) {
        const body = await tokenResp.text();
        console.error("[Nifty OAuth] Token exchange failed:", tokenResp.status, body.slice(0, 1000));
        res.redirect(`/?oauth_error=nifty_token&detail=${encodeURIComponent(body.slice(0, 200))}`);
        return;
      }
      const raw = await tokenResp.json() as Record<string, unknown>;
      // Nifty may wrap the response (some endpoints return {data: {...}}). Tolerate both.
      const tokenData = (raw.access_token ? raw : (raw.data as Record<string, unknown> | undefined) ?? {}) as {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
      };
      if (!tokenData.access_token) {
        console.error("[Nifty OAuth] Token response had no access_token. Raw keys:", Object.keys(raw));
        res.redirect(`/?oauth_error=nifty_token&detail=${encodeURIComponent('no_access_token_in_response')}`);
        return;
      }

      // Fetch /users/me to capture account identity for the rail UI.
      const meResp = await fetch("https://openapi.niftypm.com/api/v1.0/users/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
      });
      let me: { id?: string; email?: string; name?: string } = {};
      if (meResp.ok) {
        try { me = await meResp.json() as typeof me; } catch { /* tolerate */ }
      }

      await db.upsertExternalSourceCredential({
        userId: stateData.userId,
        source: "nifty",
        apiToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        scope: tokenData.scope ?? null,
        accountEmail: me.email ?? null,
        accountDisplayName: me.name ?? null,
        accountExternalId: me.id ? String(me.id) : null,
        // Keep clientId/clientSecret as-is — they're already stored.
        clientId: cred.clientId,
        clientSecret: cred.clientSecret,
      });
      res.redirect("/?oauth_success=nifty");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack?.slice(0, 500) : '';
      console.error("[Nifty OAuth] Callback error:", msg, stack);
      res.redirect(`/?oauth_error=nifty_server&detail=${encodeURIComponent(msg.slice(0, 200))}`);
    }
  });
}
