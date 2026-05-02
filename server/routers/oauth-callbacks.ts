/**
 * Provider OAuth callback routes (Express, not tRPC)
 * Registered in server/_core/index.ts
 *
 * GET /api/oauth/microsoft/callback
 * GET /api/oauth/google/callback
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
    const clientId = userCred?.clientId || (process.env.MS_CLIENT_ID ?? "");
    const clientSecret = userCred?.clientSecret || (process.env.MS_CLIENT_SECRET ?? "");
    // Use tenant-specific endpoint if tenantId was encoded in state (single-tenant apps)
    const tenantId = stateData.tenantId?.trim() || userCred?.tenantId?.trim() || "common";
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
        res.redirect("/?oauth_error=microsoft_token");
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
  app.get("/api/oauth/google/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    const error = getQueryParam(req, "error");

    if (error) {
      console.error("[Google OAuth] Error:", error);
      res.redirect("/?oauth_error=google_denied");
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
    const userCred = await db.getUserOauthCredential(stateData.userId, "google");
    const clientId = userCred?.clientId || (process.env.GOOGLE_CLIENT_ID ?? "");
    const clientSecret = userCred?.clientSecret || (process.env.GOOGLE_CLIENT_SECRET ?? "");
    const redirectUri = `${stateData.origin}/api/oauth/google/callback`;

    try {
      const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
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
        console.error("[Google OAuth] Token exchange failed:", body);
        res.redirect("/?oauth_error=google_token");
        return;
      }

      const tokenData = await tokenResp.json() as {
        access_token: string;
        refresh_token?: string;
        expires_in: number;
        scope: string;
      };

      // Get user profile
      const profileResp = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profile = profileResp.ok
        ? await profileResp.json() as { email?: string; name?: string }
        : {};

      await db.upsertOAuthToken({
        userId: stateData.userId,
        provider: "google",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? null,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scope: tokenData.scope,
        email: profile.email ?? null,
        displayName: profile.name ?? null,
      });

      res.redirect("/?oauth_success=google");
    } catch (err) {
      console.error("[Google OAuth] Callback error:", err);
      res.redirect("/?oauth_error=google_server");
    }
  });
}
