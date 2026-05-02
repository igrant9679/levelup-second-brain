/**
 * OAuth Sync Router — Microsoft Graph & Google Workspace
 *
 * Procedures:
 *  oauthSync.status        — get connection status for both providers
 *  oauthSync.getAuthUrl    — generate the provider OAuth consent URL
 *  oauthSync.disconnect    — revoke & delete stored tokens for a provider
 *  oauthSync.syncCalendar  — pull calendar events from connected provider
 *  oauthSync.syncMail      — pull recent mail from connected provider
 *  oauthSync.syncContacts  — pull contacts from connected provider
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { sendEmail } from "../_core/sendEmail";
import { refreshOAuthTokenSilently } from "../_core/refreshOAuthToken";

// ---- Helpers ----

/** Resolve the effective client ID for a provider, preferring per-user credentials */
async function resolveClientId(userId: number, provider: "microsoft" | "google"): Promise<string> {
  const userCred = await db.getUserOauthCredential(userId, provider);
  if (userCred?.clientId) return userCred.clientId;
  return provider === "microsoft"
    ? (process.env.MS_CLIENT_ID ?? "")
    : (process.env.GOOGLE_CLIENT_ID ?? "");
}

/** Resolve the effective client secret for a provider, preferring per-user credentials */
async function resolveClientSecret(userId: number, provider: "microsoft" | "google"): Promise<string> {
  const userCred = await db.getUserOauthCredential(userId, provider);
  if (userCred?.clientSecret) return userCred.clientSecret;
  return provider === "microsoft"
    ? (process.env.MS_CLIENT_SECRET ?? "")
    : (process.env.GOOGLE_CLIENT_SECRET ?? "");
}

function getMsAuthUrl(origin: string, state: string, clientId: string): string {
  const scopes = [
    "offline_access",
    "User.Read",
    "Calendars.ReadWrite",
    "Mail.ReadWrite",
    "Mail.Send",
    "Contacts.ReadWrite",
  ].join(" ");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${origin}/api/oauth/microsoft/callback`,
    scope: scopes,
    response_mode: "query",
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

function getGoogleAuthUrl(origin: string, state: string, clientId: string): string {
  const scopes = [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/contacts",
  ].join(" ");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${origin}/api/oauth/google/callback`,
    scope: scopes,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function refreshMsToken(token: { refreshToken: string | null; userId: number }): Promise<string | null> {
  if (!token.refreshToken) return null;
  const clientId = process.env.MS_CLIENT_ID ?? "";
  const clientSecret = process.env.MS_CLIENT_SECRET ?? "";
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refreshToken,
    grant_type: "refresh_token",
    scope: "offline_access User.Read Calendars.ReadWrite Mail.ReadWrite Mail.Send Contacts.ReadWrite",
  });
  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await db.upsertOAuthToken({
    userId: token.userId,
    provider: "microsoft",
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? token.refreshToken,
    expiresAt,
  });
  return data.access_token;
}

async function refreshGoogleToken(token: { refreshToken: string | null; userId: number }): Promise<string | null> {
  if (!token.refreshToken) return null;
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: token.refreshToken,
    grant_type: "refresh_token",
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!resp.ok) return null;
  const data = await resp.json() as { access_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);
  await db.upsertOAuthToken({
    userId: token.userId,
    provider: "google",
    accessToken: data.access_token,
    refreshToken: token.refreshToken,
    expiresAt,
  });
  return data.access_token;
}

async function getValidAccessToken(userId: number, provider: "microsoft" | "google"): Promise<string | null> {
  const token = await db.getOAuthToken(userId, provider);
  if (!token) return null;
  // If token expires within 5 minutes, refresh it
  if (token.expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (provider === "microsoft") return refreshMsToken(token);
    if (provider === "google") return refreshGoogleToken(token);
  }
  return token.accessToken;
}

// ---- Router ----

export const oauthSyncRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    // Attempt silent token refresh for expired/near-expiry tokens before returning status
    await Promise.allSettled([
      refreshOAuthTokenSilently(ctx.user.id, "microsoft"),
      refreshOAuthTokenSilently(ctx.user.id, "google"),
    ]);

    const [ms, google, msCred, googleCred] = await Promise.all([
      db.getOAuthToken(ctx.user.id, "microsoft"),
      db.getOAuthToken(ctx.user.id, "google"),
      db.getUserOauthCredential(ctx.user.id, "microsoft"),
      db.getUserOauthCredential(ctx.user.id, "google"),
    ]);
    const msCredOk = !!(msCred?.clientId || (process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET));
    const googleCredOk = !!(googleCred?.clientId || (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET));
    return {
      microsoft: ms
        ? { connected: true, email: ms.email, displayName: ms.displayName, expiresAt: ms.expiresAt, credentialsConfigured: true, hasUserCredentials: !!msCred?.clientId }
        : { connected: false, credentialsConfigured: msCredOk, hasUserCredentials: !!msCred?.clientId },
      google: google
        ? { connected: true, email: google.email, displayName: google.displayName, expiresAt: google.expiresAt, credentialsConfigured: true, hasUserCredentials: !!googleCred?.clientId }
        : { connected: false, credentialsConfigured: googleCredOk, hasUserCredentials: !!googleCred?.clientId },
    };
  }),

  getAuthUrl: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]), origin: z.string() }))
    .query(async ({ input, ctx }) => {
      // Prefer per-user credentials, fall back to global env vars
      const clientId = await resolveClientId(ctx.user.id, input.provider);
      const clientSecret = await resolveClientSecret(ctx.user.id, input.provider);
      // Guard: ensure credentials are available from either source
      if (!clientId || !clientSecret) {
        const providerName = input.provider === "microsoft" ? "Microsoft" : "Google";
        throw new Error(
          `${providerName} OAuth credentials are not configured. ` +
          `Enter your Client ID and Secret in the Accounts panel, or ask the app owner to add them as environment secrets.`
        );
      }
      // Encode userId in state so callback can associate the token
      const state = Buffer.from(JSON.stringify({ userId: ctx.user.id, origin: input.origin })).toString("base64url");
      if (input.provider === "microsoft") return { url: getMsAuthUrl(input.origin, state, clientId) };
      return { url: getGoogleAuthUrl(input.origin, state, clientId) };
    }),

  disconnect: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteOAuthToken(ctx.user.id, input.provider);
      return { success: true };
    }),

  syncCalendar: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]), daysAhead: z.number().default(30) }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidAccessToken(ctx.user.id, input.provider);
      if (!accessToken) throw new Error("Not connected to " + input.provider);

      const now = new Date();
      const end = new Date(now.getTime() + input.daysAhead * 24 * 60 * 60 * 1000);

      if (input.provider === "microsoft") {
        const resp = await fetch(
          `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$top=50&$select=subject,start,end,location,bodyPreview`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) throw new Error("Microsoft Graph calendar fetch failed: " + resp.status);
        const data = await resp.json() as { value: Array<{ subject: string; start: { dateTime: string }; end: { dateTime: string }; location?: { displayName?: string }; bodyPreview?: string }> };
        return {
          provider: "microsoft",
          events: (data.value || []).map(e => ({
            title: e.subject,
            start: e.start.dateTime,
            end: e.end.dateTime,
            location: e.location?.displayName ?? "",
            notes: e.bodyPreview ?? "",
          })),
        };
      }

      // Google
      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&maxResults=50&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!resp.ok) throw new Error("Google Calendar fetch failed: " + resp.status);
      const data = await resp.json() as { items: Array<{ summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; location?: string; description?: string }> };
      return {
        provider: "google",
        events: (data.items || []).map(e => ({
          title: e.summary ?? "(No title)",
          start: e.start.dateTime ?? e.start.date ?? "",
          end: e.end.dateTime ?? e.end.date ?? "",
          location: e.location ?? "",
          notes: e.description ?? "",
        })),
      };
    }),

  syncMail: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]), limit: z.number().default(20) }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidAccessToken(ctx.user.id, input.provider);
      if (!accessToken) throw new Error("Not connected to " + input.provider);

      if (input.provider === "microsoft") {
        const resp = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages?$top=${input.limit}&$select=subject,from,receivedDateTime,bodyPreview,isRead&$orderby=receivedDateTime desc`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) throw new Error("Microsoft Graph mail fetch failed: " + resp.status);
        const data = await resp.json() as { value: Array<{ subject: string; from: { emailAddress: { name: string; address: string } }; receivedDateTime: string; bodyPreview: string; isRead: boolean }> };
        return {
          provider: "microsoft",
          messages: (data.value || []).map(m => ({
            subject: m.subject,
            from: m.from.emailAddress.name || m.from.emailAddress.address,
            fromEmail: m.from.emailAddress.address,
            date: m.receivedDateTime,
            preview: m.bodyPreview,
            read: m.isRead,
          })),
        };
      }

      // Google
      const listResp = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${input.limit}&labelIds=INBOX`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!listResp.ok) throw new Error("Gmail list failed: " + listResp.status);
      const listData = await listResp.json() as { messages?: Array<{ id: string }> };
      const ids = (listData.messages || []).map(m => m.id);

      const messages = await Promise.all(ids.slice(0, input.limit).map(async id => {
        const msgResp = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!msgResp.ok) return null;
        const msg = await msgResp.json() as { id: string; snippet: string; labelIds: string[]; payload: { headers: Array<{ name: string; value: string }> } };
        const headers = msg.payload.headers;
        const get = (name: string) => headers.find(h => h.name === name)?.value ?? "";
        return {
          subject: get("Subject"),
          from: get("From"),
          fromEmail: get("From"),
          date: get("Date"),
          preview: msg.snippet,
          read: !msg.labelIds.includes("UNREAD"),
        };
      }));

      return { provider: "google", messages: messages.filter(Boolean) };
    }),

  syncContacts: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]), limit: z.number().default(50) }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidAccessToken(ctx.user.id, input.provider);
      if (!accessToken) throw new Error("Not connected to " + input.provider);

      if (input.provider === "microsoft") {
        const resp = await fetch(
          `https://graph.microsoft.com/v1.0/me/contacts?$top=${input.limit}&$select=displayName,emailAddresses,businessPhones,jobTitle,companyName`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) throw new Error("Microsoft Graph contacts fetch failed: " + resp.status);
        const data = await resp.json() as { value: Array<{ displayName: string; emailAddresses: Array<{ address: string }>; businessPhones: string[]; jobTitle?: string; companyName?: string }> };
        return {
          provider: "microsoft",
          contacts: (data.value || []).map(c => ({
            name: c.displayName,
            email: c.emailAddresses[0]?.address ?? "",
            phone: c.businessPhones[0] ?? "",
            title: c.jobTitle ?? "",
            company: c.companyName ?? "",
          })),
        };
      }

      // Google People API
      const resp = await fetch(
        `https://people.googleapis.com/v1/people/me/connections?personFields=names,emailAddresses,phoneNumbers,organizations&pageSize=${input.limit}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!resp.ok) throw new Error("Google People API failed: " + resp.status);
      const data = await resp.json() as { connections?: Array<{ names?: Array<{ displayName: string }>; emailAddresses?: Array<{ value: string }>; phoneNumbers?: Array<{ value: string }>; organizations?: Array<{ name?: string; title?: string }> }> };
      return {
        provider: "google",
        contacts: (data.connections || []).map(c => ({
          name: c.names?.[0]?.displayName ?? "",
          email: c.emailAddresses?.[0]?.value ?? "",
          phone: c.phoneNumbers?.[0]?.value ?? "",
          title: c.organizations?.[0]?.title ?? "",
          company: c.organizations?.[0]?.name ?? "",
        })),
      };
    }),

  // ---- Per-user OAuth App Credentials management ----

  /** Save (or update) the user's own OAuth app Client ID + Secret for a provider */
  saveCredentials: protectedProcedure
    .input(z.object({
      provider: z.enum(["microsoft", "google"]),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertUserOauthCredential({
        userId: ctx.user.id,
        provider: input.provider,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
      });
      await db.insertCredentialAuditLog({
        userId: ctx.user.id,
        provider: input.provider,
        action: 'saved',
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
      });
      return { success: true };
    }),

  /** Get the stored credential metadata (clientId only — secret is never returned) */
  getCredentials: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]) }))
    .query(async ({ input, ctx }) => {
      const cred = await db.getUserOauthCredential(ctx.user.id, input.provider);
      if (!cred) return null;
      return { clientId: cred.clientId, updatedAt: cred.updatedAt };
    }),

  /** Delete the user's stored credentials for a provider */
  deleteCredentials: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]) }))
    .mutation(async ({ input, ctx }) => {
      await db.deleteUserOauthCredential(ctx.user.id, input.provider);
      await db.insertCredentialAuditLog({
        userId: ctx.user.id,
        provider: input.provider,
        action: 'cleared',
        performedBy: ctx.user.id,
        performedByName: ctx.user.name || undefined,
      });
      return { success: true };
    }),

  /** Get the last 10 audit log entries for the current user's credentials */
  getCredentialAuditLog: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]) }))
    .query(async ({ input, ctx }) => {
      return db.getCredentialAuditLog(ctx.user.id, input.provider, 10);
    }),

  // ---- Test Email ----
  /**
   * Send a test email to the logged-in user's own address using the
   * configured SMTP sender. Returns { success, message }.
   */
  testEmail: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.email) {
      return { success: false, message: "Your account has no email address on record." };
    }
    const sent = await sendEmail({
      to: ctx.user.email,
      subject: "LevelUp \u2014 Test Email",
      html: [
        "<h2 style='font-family:sans-serif'>\u2705 Test Email Successful</h2>",
        "<p style='font-family:sans-serif'>This test email was sent from your LevelUp Second Brain workspace.</p>",
        "<p style='font-family:sans-serif;color:#888'>Sent to: <strong>",
        ctx.user.email,
        "</strong></p>",
      ].join(""),
      senderUserId: ctx.user.id,
    });
    if (sent) {
      return { success: true, message: `Test email sent to ${ctx.user.email}` };
    }
    return {
      success: false,
      message:
        "No SMTP sender is configured. Go to Settings \u2192 Accounts, connect a Google or Microsoft account, then select it as the System Notification Sender.",
    };
  }),

  // ---- Token Refresh (re-initiate OAuth flow) ----
  /**
   * Return a fresh OAuth consent URL so the user can re-authenticate
   * an expired or expiring token. Identical to getAuthUrl but exposed
   * as a mutation so the UI can call it from a button click.
   */
  refreshToken: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]), origin: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const clientId = await resolveClientId(ctx.user.id, input.provider);
      const clientSecret = await resolveClientSecret(ctx.user.id, input.provider);
      if (!clientId || !clientSecret) {
        const providerName = input.provider === "microsoft" ? "Microsoft" : "Google";
        throw new Error(
          `${providerName} OAuth credentials are not configured. ` +
          `Enter your Client ID and Secret in the Accounts panel, or ask the app owner to add them as environment secrets.`
        );
      }
      const state = Buffer.from(
        JSON.stringify({ userId: ctx.user.id, origin: input.origin })
      ).toString("base64url");
      const url =
        input.provider === "microsoft"
          ? getMsAuthUrl(input.origin, state, clientId)
          : getGoogleAuthUrl(input.origin, state, clientId);
      return { url };
    }),

  // ---- Email Delivery Log ----
  /**
   * Return the last 5 email delivery log entries for the current user.
   * Used by the Notification Sender section to show recent send history.
   */
  getEmailDeliveryLog: protectedProcedure.query(async ({ ctx }) => {
    return db.getEmailDeliveryLog(ctx.user.id, 5);
  }),

  // ---- Owner-only: Notification Sender ----

  /** List all connected OAuth accounts across all users (owner only) */
  getNotificationSenderOptions: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
    const accounts = await db.getAllConnectedOAuthAccounts();
    const current = await db.getSystemSetting("notificationSender");
    return { accounts, current: current ?? null };
  }),

  /** Set which connected account sends system notifications (owner only) */
  setNotificationSender: protectedProcedure
    .input(z.object({
      /** Format: "provider:userId" e.g. "google:3" */
      senderKey: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      await db.setSystemSetting("notificationSender", input.senderKey);
      return { success: true };
    }),

  // ---- Admin: Full Email Delivery Log ----
  /**
   * Paginated full delivery log across all users.
   * Admin-only. Supports optional status and date range filters.
   */
  getAdminEmailDeliveryLog: protectedProcedure
    .input(z.object({
      status: z.enum(["sent", "failed", "skipped"]).optional(),
      from: z.date().optional(),
      to: z.date().optional(),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      return db.getAdminEmailDeliveryLog(input);
    }),

  // ---- Admin: Check & Notify Expiring Tokens ----
  /**
   * Send a direct expiry warning email to each user whose token is expiring.
   * Admin-only. Idempotent per day.
   */
  notifyExpiringTokensPerUser: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
    const today = new Date().toISOString().slice(0, 10);
    const dedupeKey = `expiry_email_sent_${today}`;
    const alreadySent = await db.getSystemSetting(dedupeKey);
    if (alreadySent) return { notified: false, reason: "Already sent today", count: 0 };

    // Use 7-day window so users get advance warning
    const expiring = await db.getAllExpiringTokens(7);
    if (!expiring.length) return { notified: false, reason: "No expiring tokens", count: 0 };

    let sent = 0;
    for (const t of expiring) {
      const userEmail = t.userEmail;
      if (!userEmail) continue;

      // Skip users who have opted out of expiry emails
      const notifPrefs = await db.getEmailNotifPrefs(t.userId);
      if (notifPrefs?.optOutExpiryEmails) continue;

      const expiresAt = t.expiresAt instanceof Date ? t.expiresAt : new Date(t.expiresAt);
      const diffMs = expiresAt.getTime() - Date.now();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const providerLabel = t.provider === "microsoft" ? "Microsoft 365" : "Google Workspace";
      const timeStr = diffMs <= 0 ? "has expired" : `expires in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
      const connectedEmail = t.email ?? "your connected account";

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#7c3aed">⚠ Action required: Reconnect your ${providerLabel} account</h2>
          <p>Your <strong>${providerLabel}</strong> connection (<em>${connectedEmail}</em>) ${timeStr}.</p>
          <p>Once expired, LevelUp will no longer be able to sync your calendar, mail, or contacts from this account.</p>
          <p style="margin-top:24px">
            <a href="${process.env.VITE_OAUTH_PORTAL_URL ?? ""}" 
               style="background:#7c3aed;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none">
              Open LevelUp Settings
            </a>
          </p>
          <p style="color:#888;font-size:12px;margin-top:24px">Go to Settings → Accounts → ${providerLabel} → Refresh Token to reconnect.</p>
        </div>
      `;

      const ok = await sendEmail({
        to: userEmail,
        subject: `Action required: Your ${providerLabel} connection ${timeStr}`,
        html,
        senderUserId: ctx.user.id,
      });
      if (ok) sent++;
    }

    await db.setSystemSetting(dedupeKey, "1");
    return { notified: true, count: sent };
  }),

  checkAndNotifyExpiry: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const dedupeKey = `expiry_notif_sent_${today}`;
    const alreadySent = await db.getSystemSetting(dedupeKey);
    if (alreadySent) return { notified: false, reason: "Already notified today" };

    const expiring = await db.getAllExpiringTokens(3);
    if (!expiring.length) return { notified: false, reason: "No expiring tokens" };

    const lines = expiring.map(t => {
      const expiresAt = t.expiresAt instanceof Date ? t.expiresAt : new Date(t.expiresAt);
      const diffMs = expiresAt.getTime() - Date.now();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      const timeStr = diffMs <= 0 ? "EXPIRED" : `expires in ${diffDays} day${diffDays === 1 ? "" : "s"}`;
      const name = t.userName ?? t.userEmail ?? `User #${t.userId}`;
      return `• ${name} — ${t.provider} (${t.email ?? "no email"}) — ${timeStr}`;
    });

    const { notifyOwner } = await import("../_core/notification");
    await notifyOwner({
      title: `⚠ ${expiring.length} OAuth token${expiring.length === 1 ? "" : "s"} expiring soon`,
      content: `The following connected OAuth tokens are expiring or have expired:\n\n${lines.join("\n")}\n\nAsk affected users to reconnect their accounts in Settings → Accounts.`,
    });

    // Mark as sent for today to prevent duplicate alerts
    await db.setSystemSetting(dedupeKey, "1");
    return { notified: true, count: expiring.length };
  }),

  /**
   * Return the last 20 scheduled task log entries.
   * Admin-only.
   */
  getScheduledTaskLog: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }).optional())
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      return db.getScheduledTaskLog(input?.limit ?? 20);
    }),

  /**
   * Send a composed email on behalf of the logged-in user via their connected
   * Google or Microsoft OAuth account (whichever is connected).
   */
  sendComposedMail: protectedProcedure
    .input(z.object({
      to: z.string().email("Invalid recipient email"),
      subject: z.string().min(1).max(998),
      body: z.string(),
      provider: z.enum(["google", "microsoft"]).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Determine which provider to use: explicit > google > microsoft
      const providers: Array<"google" | "microsoft"> = input.provider
        ? [input.provider]
        : ["google", "microsoft"];

      let accessToken: string | null = null;
      let chosenProvider: "google" | "microsoft" | null = null;

      for (const p of providers) {
        const token = await getValidAccessToken(ctx.user.id, p);
        if (token) { accessToken = token; chosenProvider = p; break; }
      }

      if (!accessToken || !chosenProvider) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No connected email account found. Please connect Google or Microsoft in Settings → Accounts.",
        });
      }

      if (chosenProvider === "google") {
        // Build RFC 2822 message and base64url-encode it
        const raw = [
          `To: ${input.to}`,
          `Subject: ${input.subject}`,
          `Content-Type: text/html; charset=utf-8`,
          `MIME-Version: 1.0`,
          ``,
          input.body,
        ].join("\r\n");
        const encoded = Buffer.from(raw).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
        const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ raw: encoded }),
        });
        if (!resp.ok) {
          const err = await resp.text();
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Gmail send failed: ${resp.status} ${err}` });
        }
        return { success: true, provider: "google" };
      }

      // Microsoft — send via Graph API
      const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: input.subject,
            body: { contentType: "HTML", content: input.body },
            toRecipients: [{ emailAddress: { address: input.to } }],
          },
          saveToSentItems: true,
        }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Microsoft send failed: ${resp.status} ${err}` });
      }
      return { success: true, provider: "microsoft" };
    }),

  /**
   * Test an OAuth connection by making a lightweight API call
   */
  testOAuthConnection: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]) }))
    .mutation(async ({ ctx, input }) => {
      const { getOAuthToken } = await import("../db");
      const { refreshOAuthTokenSilently } = await import("../_core/refreshOAuthToken");
      let token = await getOAuthToken(ctx.user.id, input.provider);
      if (!token) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No ${input.provider} token found. Please connect first.` });
      }
      // Try silent refresh if expired
      const now = Date.now();
      if (token.expiresAt && token.expiresAt.getTime() < now) {
        const refreshed = await refreshOAuthTokenSilently(ctx.user.id, input.provider);
        if (!refreshed) throw new TRPCError({ code: "UNAUTHORIZED", message: `${input.provider} token is expired. Please refresh.` });
        // Re-fetch the token after refresh
        const updatedToken = await getOAuthToken(ctx.user.id, input.provider);
        if (!updatedToken) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Token refresh failed" });
        token = updatedToken;
      }
      const accessToken = token.accessToken;
      if (input.provider === "microsoft") {
        const resp = await fetch("https://graph.microsoft.com/v1.0/me?$select=displayName,mail", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Microsoft API returned ${resp.status}` });
        const data = await resp.json() as { displayName?: string; mail?: string };
        return { success: true, provider: "microsoft", displayName: data.displayName, email: data.mail };
      } else {
        const resp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo?fields=name,email", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Google API returned ${resp.status}` });
        const data = await resp.json() as { name?: string; email?: string };
        return { success: true, provider: "google", displayName: data.name, email: data.email };
      }
    }),

  /**
   * Test a third-party integration (ClickUp, Clodura, etc.)
   */
  testIntegration: protectedProcedure
    .input(z.object({ integration: z.enum(["clickup", "clodura"]), apiKey: z.string().min(1), workspaceId: z.string().optional() }))
    .mutation(async ({ input }) => {
      if (input.integration === "clickup") {
        const resp = await fetch("https://api.clickup.com/api/v2/user", {
          headers: { Authorization: input.apiKey },
        });
        if (!resp.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: `ClickUp API returned ${resp.status} — check your API token.` });
        const data = await resp.json() as { user?: { username?: string; email?: string } };
        return { success: true, integration: "clickup", username: data.user?.username, email: data.user?.email };
      } else if (input.integration === "clodura") {
        const resp = await fetch("https://api.clodura.ai/api/v1/user/profile", {
          headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
        });
        if (!resp.ok) throw new TRPCError({ code: "UNAUTHORIZED", message: `Clodura API returned ${resp.status} — check your API key.` });
        const data = await resp.json() as { name?: string; email?: string };
        return { success: true, integration: "clodura", name: data.name, email: data.email };
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown integration" });
    }),

  /**
   * Get the log retention period in days (default 90)
   */
  getLogRetentionDays: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
    }
    const { getSystemSetting } = await import("../db");
    const val = await getSystemSetting("logRetentionDays");
    return { days: val ? parseInt(val, 10) : 90 };
  }),

  /**
   * Set the log retention period in days
   */
  setLogRetentionDays: protectedProcedure
    .input(z.object({ days: z.number().int().min(7).max(3650) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      }
      const { setSystemSetting } = await import("../db");
      await setSystemSetting("logRetentionDays", String(input.days));
      return { success: true, days: input.days };
    }),

  /**
   * Validate OAuth app credentials (client ID + secret) without completing the full OAuth flow.
   * Makes a lightweight token-endpoint request to check if the credentials are accepted.
   */
  validateCredentials: protectedProcedure
    .input(z.object({
      provider: z.enum(["microsoft", "google"]),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      const { provider, clientId, clientSecret } = input;

      if (provider === "microsoft") {
        // Use the client_credentials grant with a dummy scope to validate credentials.
        // We expect either a token response or a specific error about the tenant/scope,
        // NOT an "invalid_client" error which would mean bad credentials.
        const body = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        });
        const resp = await fetch(
          "https://login.microsoftonline.com/common/oauth2/v2.0/token",
          { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        const data = await resp.json() as { error?: string; error_description?: string; access_token?: string };
        // invalid_client = bad credentials; other errors (e.g. unsupported_grant_type on /common) = credentials are valid
        if (data.error === "invalid_client") {
          return { valid: false, error: data.error_description ?? "Invalid client credentials" };
        }
        // Any other response (including errors about tenant/grant) means the credentials were accepted
        return { valid: true };
      } else {
        // Google: use the token info endpoint to check if the client_id is registered
        // We attempt a token exchange with a dummy code — Google will return
        // "invalid_client" for bad credentials vs other errors for bad code
        const body = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code: "VALIDATION_PROBE",
          redirect_uri: "https://localhost",
        });
        const resp = await fetch(
          "https://oauth2.googleapis.com/token",
          { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );
        const data = await resp.json() as { error?: string; error_description?: string };
        if (data.error === "invalid_client") {
          return { valid: false, error: data.error_description ?? "Invalid client credentials" };
        }
        // "invalid_grant" or other errors = credentials are valid, just the probe code is bad
        return { valid: true };
      }
    }),

  /**
   * Get the current user's email notification preferences
   */
  getEmailNotifPrefs: protectedProcedure.query(async ({ ctx }) => {
    const { getEmailNotifPrefs } = await import("../db");
    const prefs = await getEmailNotifPrefs(ctx.user.id);
    return {
      optOutExpiryEmails: prefs?.optOutExpiryEmails ?? false,
      optOutDigestEmails: prefs?.optOutDigestEmails ?? false,
    };
  }),

  /**
   * Update the current user's email notification preferences
   */
  setEmailNotifPrefs: protectedProcedure
    .input(z.object({
      optOutExpiryEmails: z.boolean().optional(),
      optOutDigestEmails: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { setEmailNotifPrefs } = await import("../db");
      await setEmailNotifPrefs(ctx.user.id, {
        optOutExpiryEmails: input.optOutExpiryEmails,
        optOutDigestEmails: input.optOutDigestEmails,
      });
      return { success: true };
    }),
});
