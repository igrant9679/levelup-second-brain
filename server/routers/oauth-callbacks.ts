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
    const tenantId = (stateData.tenantId?.trim() || userCred?.tenantId?.trim()) ?? "common";
    const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    const redirectUri = `${stateData.origin}/api/oauth/microsoft/callback`;

    try {
      // Exchange code for tokens
      const tokenResp = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }).toString(),
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
}
