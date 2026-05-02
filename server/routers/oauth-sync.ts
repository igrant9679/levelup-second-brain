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
    if (ctx.user.role !== "admin") throw new Error("Admin only");
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
      if (ctx.user.role !== "admin") throw new Error("Admin only");
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
      if (ctx.user.role !== "admin") throw new Error("Admin only");
      return db.getAdminEmailDeliveryLog(input);
    }),

  // ---- Admin: Check & Notify Expiring Tokens ----
  /**
   * Check all users' OAuth tokens. For any that expired or expire within 3 days,
   * send a single consolidated notifyOwner alert.
   * Admin-only. Idempotent — uses a system_settings key to avoid duplicate alerts
   * within the same calendar day.
   */
  checkAndNotifyExpiry: protectedProcedure.mutation(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new Error("Admin only");

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
});
