import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerOAuthRoutes(app: Express) {
  // Audit 3: the old Manus sign-in callback is retired. Its `state` was only the redirect address
  // (sign-in CSRF), and it wrote the provider's email onto an existing login with no uniqueness
  // check. LevelUp signs in with email + password; set LEGACY_MANUS_OAUTH=true only to bring it back.
  if (String(process.env.LEGACY_MANUS_OAUTH || "").toLowerCase() !== "true") {
    app.get("/api/oauth/callback", (_req: Request, res: Response) => { res.status(410).type("text/plain").send("This sign-in method is no longer available. Sign in with your email and password."); });
    return;
  }
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });
      // Log login activity (best-effort, non-blocking)
      const loggedUser = await db.getUserByOpenId(userInfo.openId);
      if (loggedUser) { db.logActivity(loggedUser.id, 'login').catch(() => {}); }

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
