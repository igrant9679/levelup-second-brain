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
import { refreshOAuthTokenSilently, forceRefreshOAuthToken } from "../_core/refreshOAuthToken";
import nodemailer from "nodemailer";
import Imap from "imap";
// @ts-ignore - mailparser has no @types package
import { simpleParser } from "mailparser";

// ---- Helpers ----

/**
 * Test SMTP connection using nodemailer
 * Returns { success: true } if connection works, throws error otherwise
 */
async function testSmtpConnection(input: {
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: 'ssl' | 'tls' | 'none';
  smtpUsername: string;
  smtpPassword: string;
}): Promise<{ success: true }> {
  const transporter = nodemailer.createTransport({
    host: input.smtpHost,
    port: input.smtpPort,
    // ssl = implicit TLS (port 465); tls = STARTTLS (port 587); none = plain
    secure: input.smtpEncryption === 'ssl',
    requireTLS: input.smtpEncryption === 'tls', // force STARTTLS upgrade on port 587
    auth: {
      user: input.smtpUsername,
      pass: input.smtpPassword,
    },
    tls: { rejectUnauthorized: false }, // accept self-signed certs
    connectionTimeout: 10000, // 10 s
    greetingTimeout: 10000,   // 10 s — prevents "Greeting never received" hang
    socketTimeout: 15000,
  });

  try {
    await transporter.verify();
  } finally {
    transporter.close();
  }

  return { success: true };
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

/**
 * Build the Microsoft OAuth consent URL.
 * When tenantId is provided (single-tenant app), use the tenant-specific endpoint.
 * When omitted, use /common (multi-tenant apps).
 */
const DEFAULT_MS_SCOPES = [
  "offline_access",
  "User.Read",
  "Calendars.ReadWrite",
  "Mail.ReadWrite",
  "Mail.Send",
  "Contacts.ReadWrite",
];

function getMsAuthUrl(origin: string, state: string, clientId: string, tenantId?: string | null, customScopes?: string | null): string {
  // Use custom scopes if provided, otherwise use defaults
  // Always include offline_access and User.Read as required base scopes
  let scopeList = DEFAULT_MS_SCOPES;
  if (customScopes) {
    const custom = customScopes.split(',').map(s => s.trim()).filter(Boolean);
    // Ensure base scopes are always present
    const base = ['offline_access', 'User.Read'];
    scopeList = Array.from(new Set([...base, ...custom]));
  }
  const scopes = scopeList.join(" ");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: `${origin}/api/oauth/microsoft/callback`,
    scope: scopes,
    response_mode: "query",
    state,
  });
  const tenant = tenantId?.trim() || "common";
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params}`;
}

/** Build the Microsoft token endpoint URL (tenant-specific or /common) */
function getMsTokenUrl(tenantId?: string | null): string {
  const tenant = tenantId?.trim() || "common";
  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

// Google OAuth removed — replaced with SMTP/IMAP secondary account

async function refreshMsToken(token: { refreshToken: string | null; userId: number }): Promise<string | null> {
  if (!token.refreshToken) return null;
  const clientId = await resolveClientId(token.userId, "microsoft");
  const clientSecret = await resolveClientSecret(token.userId, "microsoft");
  if (!clientId || !clientSecret) return null;
  // Use tenant-specific endpoint for single-tenant apps
  const userCred = await db.getUserOauthCredential(token.userId, "microsoft");
  const tenantId = userCred?.tenantId?.trim() || process.env.MS_TENANT_ID || "common";
  const resp = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildFormBody({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access User.Read Calendars.ReadWrite Mail.ReadWrite Mail.Send Contacts.ReadWrite",
    }),
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
  const clientId = await resolveClientId(token.userId, "google");
  const clientSecret = await resolveClientSecret(token.userId, "google");
  if (!clientId || !clientSecret) return null;
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: buildFormBody({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token",
    }),
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

export async function getValidAccessToken(userId: number, provider: "microsoft" | "google"): Promise<string | null> {
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
    .input(z.object({ provider: z.enum(["microsoft"]), origin: z.string(), tenantId: z.string().optional() }))
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
      // Resolve tenantId and msScopes for Microsoft (needed for single-tenant app registrations and custom scopes)
      // UI-provided tenantId takes precedence over DB value (in case user entered it but didn't re-save)
      const userCred = input.provider === "microsoft"
        ? await db.getUserOauthCredential(ctx.user.id, "microsoft")
        : null;
      // Tenant precedence: UI input → user-saved cred → MS_TENANT_ID env var → null (multi-tenant 'common')
      const tenantId = input.tenantId || userCred?.tenantId || process.env.MS_TENANT_ID || null;
      const msScopes = userCred?.msScopes ?? null;
      // Encode userId, origin, and tenantId in state so callback can use the right token endpoint
      const state = Buffer.from(JSON.stringify({ userId: ctx.user.id, origin: input.origin, tenantId })).toString("base64url");
      if (input.provider === "microsoft") return { url: getMsAuthUrl(input.origin, state, clientId, tenantId, msScopes) };
      throw new Error("Google OAuth has been removed. Use SMTP/IMAP for secondary email accounts.");
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
          `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$top=50&$select=id,subject,start,end,location,bodyPreview,organizer,isAllDay,showAs`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) throw new Error("Microsoft Graph calendar fetch failed: " + resp.status);
        const data = await resp.json() as { value: Array<{ id: string; subject: string; start: { dateTime: string }; end: { dateTime: string }; location?: { displayName?: string }; bodyPreview?: string; organizer?: { emailAddress?: { name?: string } }; isAllDay?: boolean; showAs?: string }> };
        
        // Update lastSyncedAt timestamp
        await db.updateOAuthTokenLastSynced(ctx.user.id, "microsoft");

        const events = (data.value || []).map(e => ({
          id: e.id,
          title: e.subject,
          start: e.start.dateTime,
          end: e.end.dateTime,
          location: e.location?.displayName ?? "",
          notes: e.bodyPreview ?? "",
          organizer: e.organizer?.emailAddress?.name ?? "",
          isAllDay: e.isAllDay ? 1 : 0,
          status: e.showAs ?? "busy",
        }));

        // Persist events to DB (upsert — safe to call on every sync)
        for (const e of events) {
          await db.upsertCalendarEvent({
            userId: ctx.user.id,
            provider: 'microsoft',
            eventId: e.id,
            title: e.title,
            start: new Date(e.start),
            end: new Date(e.end),
            location: e.location || null,
            description: e.notes || null,
            organizer: e.organizer || null,
            isAllDay: e.isAllDay,
            status: e.status,
          });
        }

        return { provider: "microsoft", events, eventsUpserted: events.length };
      }

      // Google
      const resp = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${end.toISOString()}&maxResults=50&singleEvents=true&orderBy=startTime`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!resp.ok) throw new Error("Google Calendar fetch failed: " + resp.status);
      const data = await resp.json() as { items: Array<{ id?: string; summary?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; location?: string; description?: string; organizer?: { displayName?: string }; status?: string }> };

      const googleEvents = (data.items || []).map(e => ({
        id: e.id ?? '',
        title: e.summary ?? "(No title)",
        start: e.start.dateTime ?? e.start.date ?? "",
        end: e.end.dateTime ?? e.end.date ?? "",
        location: e.location ?? "",
        notes: e.description ?? "",
        organizer: e.organizer?.displayName ?? "",
        isAllDay: !e.start.dateTime ? 1 : 0,
        status: e.status ?? "confirmed",
      }));

      // Persist Google events to DB
      for (const e of googleEvents) {
        if (!e.id) continue;
        await db.upsertCalendarEvent({
          userId: ctx.user.id,
          provider: 'google',
          eventId: e.id,
          title: e.title,
          start: new Date(e.start),
          end: new Date(e.end),
          location: e.location || null,
          description: e.notes || null,
          organizer: e.organizer || null,
          isAllDay: e.isAllDay,
          status: e.status,
        });
      }

      return { provider: "google", events: googleEvents, eventsUpserted: googleEvents.length };
    }),

  /**
   * Create one or more calendar events on the user's connected provider —
   * powers the "📤 Push to Outlook" button on the AI Smart Scheduler. Each
   * block becomes a calendar event with start/end timestamps. Returns
   * created event ids so the client can mark them as pushed (avoids
   * double-pushing the same plan).
   *
   * Time zone handling: caller passes startISO + endISO as full ISO strings.
   * For Microsoft we forward to /me/events with the user's local time zone
   * (defaults to UTC if not provided). For Google we pass dateTime + an
   * explicit timeZone field.
   */
  createCalendarEvents: protectedProcedure
    .input(z.object({
      provider: z.enum(["microsoft", "google"]),
      timeZone: z.string().default("UTC"),
      blocks: z.array(z.object({
        title: z.string().min(1).max(200),
        startISO: z.string(),
        endISO: z.string(),
        body: z.string().max(2000).optional(),
        linkedTaskId: z.string().optional(),
      })).min(1).max(20),
    }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidAccessToken(ctx.user.id, input.provider);
      if (!accessToken) throw new Error("Not connected to " + input.provider);

      const created: Array<{ blockTitle: string; eventId: string | null; error?: string }> = [];

      for (const b of input.blocks) {
        try {
          if (input.provider === "microsoft") {
            const body = {
              subject: b.title,
              body: { contentType: "Text", content: b.body || (b.linkedTaskId ? `Linked to LevelUp task ${b.linkedTaskId}` : "Scheduled by LevelUp AI Smart Plan") },
              start: { dateTime: b.startISO, timeZone: input.timeZone },
              end: { dateTime: b.endISO, timeZone: input.timeZone },
              showAs: "busy",
              categories: ["LevelUp"],
            };
            const resp = await fetch("https://graph.microsoft.com/v1.0/me/events", {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!resp.ok) {
              const txt = await resp.text();
              created.push({ blockTitle: b.title, eventId: null, error: `${resp.status} ${txt.slice(0, 200)}` });
              continue;
            }
            const data = await resp.json() as { id: string };
            created.push({ blockTitle: b.title, eventId: data.id });
          } else {
            // Google Calendar
            const body = {
              summary: b.title,
              description: b.body || (b.linkedTaskId ? `Linked to LevelUp task ${b.linkedTaskId}` : "Scheduled by LevelUp AI Smart Plan"),
              start: { dateTime: b.startISO, timeZone: input.timeZone },
              end: { dateTime: b.endISO, timeZone: input.timeZone },
            };
            const resp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (!resp.ok) {
              const txt = await resp.text();
              created.push({ blockTitle: b.title, eventId: null, error: `${resp.status} ${txt.slice(0, 200)}` });
              continue;
            }
            const data = await resp.json() as { id: string };
            created.push({ blockTitle: b.title, eventId: data.id });
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          created.push({ blockTitle: b.title, eventId: null, error: msg });
        }
      }

      const okCount = created.filter(c => c.eventId).length;
      return { provider: input.provider, created, okCount, totalCount: created.length };
    }),

  syncMail: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft"]).default("microsoft"), limit: z.number().default(20) }))
    .mutation(async ({ input, ctx }) => {
      // Only Microsoft (Office 365) is supported for mail sync
      const accessToken = await getValidAccessToken(ctx.user.id, "microsoft");
      if (!accessToken) throw new Error("Not connected to Microsoft 365. Please connect your Office 365 account in Settings \u2192 Accounts.");

      const resp = await fetch(
        `https://graph.microsoft.com/v1.0/me/messages?$top=${input.limit}&$select=subject,from,receivedDateTime,bodyPreview,isRead,id&$orderby=receivedDateTime desc`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!resp.ok) throw new Error("Microsoft Graph mail fetch failed: " + resp.status);
      const data = await resp.json() as { value: Array<{ id: string; subject: string; from: { emailAddress: { name: string; address: string } }; receivedDateTime: string; bodyPreview: string; isRead: boolean }> };
      const messages = (data.value || []).map(m => ({
        subject: m.subject,
        from: m.from.emailAddress.name || m.from.emailAddress.address,
        fromEmail: m.from.emailAddress.address,
        date: m.receivedDateTime,
        preview: m.bodyPreview,
        read: m.isRead,
        id: m.id,
      }));
      // Auto-create email notifications for unread messages
      const unreadMessages = messages.filter(m => !m.read);
      for (const msg of unreadMessages) {
        await db.createEmailNotification({
          userId: ctx.user.id,
          provider: 'microsoft',
          emailSubject: msg.subject || '(No subject)',
          emailFrom: msg.from,
          emailId: msg.id,
        });
      }
      return {
        provider: "microsoft",
        messages,
        notificationsCreated: unreadMessages.length,
      };
    }),

  syncContacts: protectedProcedure
    // `limit` is the MAX TOTAL number of contacts to return across all pages.
    // We page through the provider's API (MS Graph $top + @odata.nextLink, or
    // Google People pageToken) until we hit either the end or this cap. The
    // default cap is 5000 — large enough for most personal/SMB address books
    // but bounded so a runaway directory can't hang the request.
    .input(z.object({ provider: z.enum(["microsoft", "google"]), limit: z.number().int().min(1).max(20000).default(5000) }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidAccessToken(ctx.user.id, input.provider);
      if (!accessToken) throw new Error("Not connected to " + input.provider);
      const MAX_TOTAL = input.limit;
      const SAFETY_PAGES = 200; // absolute ceiling: 200 pages × 100/page = 20k

      if (input.provider === "microsoft") {
        type MsContact = { displayName: string; emailAddresses: Array<{ address: string }>; businessPhones: string[]; jobTitle?: string; companyName?: string };
        const PER_PAGE = 100; // Graph max is 999, 100 is a sensible chunk
        const collected: MsContact[] = [];
        let nextUrl: string | null =
          `https://graph.microsoft.com/v1.0/me/contacts?$top=${PER_PAGE}&$select=displayName,emailAddresses,businessPhones,jobTitle,companyName`;
        let pageCount = 0;
        while (nextUrl && collected.length < MAX_TOTAL && pageCount < SAFETY_PAGES) {
          const resp = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!resp.ok) throw new Error("Microsoft Graph contacts fetch failed: " + resp.status);
          const data = await resp.json() as { value?: MsContact[]; "@odata.nextLink"?: string };
          if (Array.isArray(data.value)) collected.push(...data.value);
          nextUrl = data["@odata.nextLink"] ?? null;
          pageCount++;
        }
        const trimmed = collected.slice(0, MAX_TOTAL);
        return {
          provider: "microsoft",
          contacts: trimmed.map(c => ({
            name: c.displayName,
            email: c.emailAddresses?.[0]?.address ?? "",
            phone: c.businessPhones?.[0] ?? "",
            title: c.jobTitle ?? "",
            company: c.companyName ?? "",
          })),
          totalFetched: trimmed.length,
          truncated: collected.length >= MAX_TOTAL && nextUrl !== null,
        };
      }

      // Google People API — paginate via pageToken
      type GContact = { names?: Array<{ displayName: string }>; emailAddresses?: Array<{ value: string }>; phoneNumbers?: Array<{ value: string }>; organizations?: Array<{ name?: string; title?: string }> };
      const PER_PAGE = 100; // max is 1000 but 100 keeps each call snappy
      const collected: GContact[] = [];
      let pageToken: string | undefined;
      let pageCount = 0;
      do {
        const url = new URL("https://people.googleapis.com/v1/people/me/connections");
        url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,organizations");
        url.searchParams.set("pageSize", String(PER_PAGE));
        if (pageToken) url.searchParams.set("pageToken", pageToken);
        const resp = await fetch(url.toString(), { headers: { Authorization: `Bearer ${accessToken}` } });
        if (!resp.ok) throw new Error("Google People API failed: " + resp.status);
        const data = await resp.json() as { connections?: GContact[]; nextPageToken?: string };
        if (Array.isArray(data.connections)) collected.push(...data.connections);
        pageToken = data.nextPageToken;
        pageCount++;
      } while (pageToken && collected.length < MAX_TOTAL && pageCount < SAFETY_PAGES);
      const trimmed = collected.slice(0, MAX_TOTAL);
      return {
        provider: "google",
        contacts: trimmed.map(c => ({
          name: c.names?.[0]?.displayName ?? "",
          email: c.emailAddresses?.[0]?.value ?? "",
          phone: c.phoneNumbers?.[0]?.value ?? "",
          title: c.organizations?.[0]?.title ?? "",
          company: c.organizations?.[0]?.name ?? "",
        })),
        totalFetched: trimmed.length,
        truncated: collected.length >= MAX_TOTAL && !!pageToken,
      };
    }),

  // ---- Per-user OAuth App Credentials management ----

  /** Save (or update) the user's own OAuth app Client ID + Secret for a provider */
  saveCredentials: protectedProcedure
    .input(z.object({
      provider: z.enum(["microsoft", "google"]),
      clientId: z.string().min(1),
      clientSecret: z.string().min(1),
      // Optional Azure AD Tenant ID (Directory ID) for single-tenant app registrations
      tenantId: z.string().optional(),
      // Optional comma-separated Microsoft Graph scopes (Microsoft only)
      msScopes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      await db.upsertUserOauthCredential({
        userId: ctx.user.id,
        provider: input.provider,
        clientId: input.clientId,
        clientSecret: input.clientSecret,
        tenantId: input.tenantId ?? null,
        msScopes: input.msScopes ?? null,
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
      if (cred) {
        return {
          clientId: cred.clientId,
          updatedAt: cred.updatedAt,
          sharedWithTeam: cred.sharedWithTeam === 1,
          lastVerifiedAt: cred.lastVerifiedAt ?? null,
          isSharedFromAdmin: false,
          tenantId: cred.tenantId ?? null,
          msScopes: cred.msScopes ?? null,
        };
      }
      // Fallback: check if an admin has shared credentials for this provider
      const shared = await db.getSharedAdminCredential(input.provider);
      if (shared) {
        return {
          clientId: shared.clientId,
          updatedAt: shared.updatedAt,
          sharedWithTeam: true,
          lastVerifiedAt: shared.lastVerifiedAt ?? null,
          isSharedFromAdmin: true,
          tenantId: shared.tenantId ?? null,
          msScopes: (shared as any).msScopes ?? null,
        };
      }
      return null;
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
      recipientUserId: ctx.user.id,
    });
    if (sent) {
      return { success: true, message: `Test email sent to ${ctx.user.email}` };
    }
    // Surface the REAL failure from the delivery log. The old canned "No SMTP
    // sender is configured" text showed for ANY failure \u2014 including auth or
    // connection errors on a perfectly-configured sender \u2014 sending users off
    // to reconfigure accounts that were never the problem.
    try {
      const rows = await db.getEmailDeliveryLog(ctx.user.id, 1);
      const last = rows && rows[0];
      if (last && last.errorMessage) {
        return { success: false, message: `Send failed: ${String(last.errorMessage).slice(0, 300)}` };
      }
      if (last && last.status === "skipped") {
        return { success: false, message: "No sender is configured \u2014 add a Secondary Email (SMTP) account or connect Google/Microsoft, then pick it as the System Notification Sender." };
      }
    } catch { /* fall through to generic */ }
    return { success: false, message: "Send failed \u2014 check the Recent Delivery Log below for the error detail." };
  }),

  /**
   * Send a custom email on behalf of the current user. Used by the Reports
   * page "Email Now" button to deliver a rendered HTML report to the user's
   * inbox via the configured system notification sender. Locked down: the
   * recipient must be the caller's own address — this is NOT a generic mail
   * sender.
   */
  sendCustom: protectedProcedure
    .input(z.object({
      to: z.string().email(),
      subject: z.string().min(1).max(300),
      html: z.string().min(1).max(500_000),
    }))
    .mutation(async ({ ctx, input }) => {
      // Refuse to deliver to anyone other than the caller.
      if (!ctx.user.email) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Your account has no email on record." });
      }
      if (input.to.toLowerCase() !== ctx.user.email.toLowerCase()) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Self-delivery only — recipient must match your account email." });
      }
      const ok = await sendEmail({
        to: input.to,
        subject: input.subject,
        html: input.html,
        senderUserId: ctx.user.id,
        recipientUserId: ctx.user.id,
      });
      return { success: !!ok };
    }),

  // ---- Token Refresh (silent server-side refresh) ----
  /**
   * Silently refresh an OAuth token using the stored refresh token.
   * Does NOT redirect to the consent page — exchanges the refresh token
   * for a new access token server-side.
   */
  refreshToken: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]) }))
    .mutation(async ({ input, ctx }) => {
      const result = await forceRefreshOAuthToken(ctx.user.id, input.provider);
      return {
        success: result.success,
        message: result.message,
        expiresAt: result.expiresAt ?? null,
      };
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

  /** List all connected OAuth accounts AND SMTP/IMAP accounts across all users (owner only) */
  getNotificationSenderOptions: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
    const oauthAccounts = await db.getAllConnectedOAuthAccounts();
    const smtpAccounts = await db.getAllSmtpAccounts();
    // Tag each account with its provider type for the UI dropdown.
    const accounts = [
      ...oauthAccounts.map(a => ({ ...a, kind: "oauth" as const })),
      ...smtpAccounts.map(a => ({ ...a, kind: "smtp" as const, provider: "smtp" as const })),
    ];
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

  // ─── Admin: Per-User Notification Sender (SMTP) ────────────────────────────
  /**
   * List all users (admin-only). Used by the admin UI to manage each team
   * member's notification-sender SMTP account.
   */
  adminListUsers: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
    return await db.adminListAllUsers();
  }),

  /** Get a specific user's SMTP/IMAP account (admin-only) */
  adminGetSmtpImapAccount: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      return await db.getSmtpImapAccountFull(input.userId);
    }),

  /**
   * Save (upsert) SMTP/IMAP credentials for an arbitrary user (admin-only).
   * Mirrors saveSmtpImapAccount but takes an explicit userId so admins can
   * configure each team member's notification-sender account.
   */
  adminSaveSmtpImapAccount: protectedProcedure
    .input(z.object({
      userId: z.number().int(),
      email: z.string().email(),
      displayName: z.string().optional(),
      imapHost: z.string().min(1),
      imapPort: z.number().int().min(1).max(65535),
      imapEncryption: z.enum(['ssl', 'tls', 'none']),
      imapUsername: z.string().min(1),
      imapPassword: z.string().min(1),
      smtpHost: z.string().min(1),
      smtpPort: z.number().int().min(1).max(65535),
      smtpEncryption: z.enum(['ssl', 'tls', 'none']),
      smtpUsername: z.string().min(1),
      smtpPassword: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      await db.upsertSmtpImapAccount({
        userId: input.userId,
        email: input.email,
        displayName: input.displayName || null,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapEncryption: input.imapEncryption,
        imapUsername: input.imapUsername,
        imapPassword: input.imapPassword,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpEncryption: input.smtpEncryption,
        smtpUsername: input.smtpUsername,
        smtpPassword: input.smtpPassword,
      });
      return { success: true };
    }),

  /** Remove a user's SMTP/IMAP account (admin-only) */
  adminDeleteSmtpImapAccount: protectedProcedure
    .input(z.object({ userId: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Admin only" });
      await db.deleteSmtpImapAccount(input.userId);
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
      // Accept ISO date strings (JSON.stringify converts Date → string in _trpc helper)
      from: z.union([z.date(), z.string()]).optional().transform(v => v ? new Date(v) : undefined),
      to: z.union([z.date(), z.string()]).optional().transform(v => v ? new Date(v) : undefined),
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

      // Build a direct deep-link to Settings → Accounts for this provider
      const siteBase = (process.env.VITE_OAUTH_PORTAL_URL ?? "").replace(/\/+$/, "");
      const reconnectUrl = siteBase
        ? `${siteBase}/?goto=accounts&provider=${t.provider}`
        : "";

      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#0b0f1a;color:#e2e8f0;border-radius:12px">
          <h2 style="color:#a78bfa;margin-top:0">⚠ Action required: Reconnect your ${providerLabel} account</h2>
          <p>Your <strong>${providerLabel}</strong> connection (<em>${connectedEmail}</em>) ${timeStr}.</p>
          <p>Once expired, LevelUp will no longer be able to sync your calendar, mail, or contacts from this account.</p>
          <p style="margin-top:24px">
            ${reconnectUrl
              ? `<a href="${reconnectUrl}"
                   style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">
                   🔗 Reconnect ${providerLabel} now
                 </a>`
              : `<span style="color:#888">Log in to LevelUp and go to Settings → Accounts → ${providerLabel} → Refresh Token.</span>`
            }
          </p>
          <p style="color:#888;font-size:12px;margin-top:24px">Or go to Settings → Accounts → ${providerLabel} → Refresh Token to reconnect manually.</p>
        </div>
      `;

      const ok = await sendEmail({
        to: userEmail,
        subject: `Action required: Your ${providerLabel} connection ${timeStr}`,
        html,
        senderUserId: ctx.user.id,
        recipientUserId: t.userId,
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
   * Microsoft 365 (Office 365) account. Gmail/Google Workspace is not supported.
   */
  sendComposedMail: protectedProcedure
    .input(z.object({
      to: z.string().email("Invalid recipient email"),
      subject: z.string().min(1).max(998),
      body: z.string(),
      cc: z.string().optional(),
      bcc: z.string().optional(),
      via: z.enum(["microsoft", "smtp"]).default("microsoft"),
      smtpAccountId: z.number().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (input.via === "smtp") {
        // Send via SMTP/IMAP account — use specific account if smtpAccountId provided
        const account = input.smtpAccountId
          ? await db.getSmtpImapAccountById(ctx.user.id, input.smtpAccountId)
          : await db.getSmtpImapAccount(ctx.user.id);
        if (!account) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "No SMTP/IMAP account configured. Please add one in Settings \u2192 Accounts.",
          });
        }
        const transporter = nodemailer.createTransport({
          host: account.smtpHost,
          port: account.smtpPort,
          secure: account.smtpEncryption === 'ssl',
          requireTLS: account.smtpEncryption === 'tls',
          auth: { user: account.smtpUsername, pass: account.smtpPassword },
          tls: { rejectUnauthorized: false },
          connectionTimeout: 15000,
          greetingTimeout: 15000,
          socketTimeout: 20000,
        });
        try {
          await transporter.sendMail({
            from: account.displayName ? `"${account.displayName}" <${account.email}>` : account.email,
            to: input.to,
            cc: input.cc || undefined,
            bcc: input.bcc || undefined,
            subject: input.subject,
            html: input.body,
          });
        } finally {
          transporter.close();
        }
        return { success: true, provider: "smtp", fromEmail: account.email };
      }

      // Send via Microsoft (Office 365)
      const accessToken = await getValidAccessToken(ctx.user.id, "microsoft");
      if (!accessToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "No connected Microsoft 365 account found. Please connect your Office 365 account in Settings \u2192 Accounts.",
        });
      }

      const msMsg: Record<string, unknown> = {
        subject: input.subject,
        body: { contentType: "HTML", content: input.body },
        toRecipients: [{ emailAddress: { address: input.to } }],
      };
      if (input.cc) msMsg.ccRecipients = input.cc.split(',').map((a: string) => ({ emailAddress: { address: a.trim() } }));
      if (input.bcc) msMsg.bccRecipients = input.bcc.split(',').map((a: string) => ({ emailAddress: { address: a.trim() } }));
      const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: msMsg, saveToSentItems: true }),
      });
      if (!resp.ok) {
        const err = await resp.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Microsoft send failed: ${resp.status} ${err}` });
      }
      return { success: true, provider: "microsoft" };
    }),

  /**
   * Sync sent items from Microsoft 365
   */
  syncSentMail: protectedProcedure
    .input(z.object({ limit: z.number().default(20) }))
    .mutation(async ({ input, ctx }) => {
      const accessToken = await getValidAccessToken(ctx.user.id, "microsoft");
      if (!accessToken) throw new Error("Not connected to Microsoft 365.");

      const resp = await fetch(
        `https://graph.microsoft.com/v1.0/me/mailFolders/sentitems/messages?$top=${input.limit}&$select=subject,toRecipients,sentDateTime,bodyPreview,id&$orderby=sentDateTime desc`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!resp.ok) throw new Error("Microsoft Graph sent mail fetch failed: " + resp.status);
      const data = await resp.json() as { value: Array<{ id: string; subject: string; toRecipients: Array<{ emailAddress: { name: string; address: string } }>; sentDateTime: string; bodyPreview: string }> };
      const messages = (data.value || []).map(m => ({
        id: m.id,
        subject: m.subject,
        to: m.toRecipients?.map(r => r.emailAddress.name || r.emailAddress.address).join(', ') || '',
        toEmail: m.toRecipients?.[0]?.emailAddress?.address || '',
        date: m.sentDateTime,
        preview: m.bodyPreview,
      }));
      return { provider: "microsoft", messages };
    }),

  /**
   * Test an OAuth connection by making a lightweight API call
   */
  testOAuthConnection: protectedProcedure
    .input(z.object({ provider: z.enum(["microsoft", "google"]) }))
    .mutation(async ({ ctx, input }) => {
      const { getOAuthToken } = await import("../db");
      const { forceRefreshOAuthToken } = await import("../_core/refreshOAuthToken");
      let token = await getOAuthToken(ctx.user.id, input.provider);
      if (!token) {
        throw new TRPCError({ code: "NOT_FOUND", message: `No ${input.provider} token found. Please connect first.` });
      }
      // Try to refresh if expired (use force refresh which always tries regardless of expiry guard)
      const now = Date.now();
      if (token.expiresAt && token.expiresAt.getTime() < now) {
        const refreshResult = await forceRefreshOAuthToken(ctx.user.id, input.provider);
        if (!refreshResult.success) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: `Token expired and refresh failed — please Disconnect and Connect again to re-authorise. (${refreshResult.message})`,
          });
        }
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
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const { provider, clientId, clientSecret } = input;

      if (provider === "microsoft") {
        // Use the client_credentials grant with a dummy scope to validate credentials.
        // We expect either a token response or a specific error about the tenant/scope,
        // NOT an "invalid_client" error which would mean bad credentials.
        // Use tenant-specific endpoint if tenantId is provided (required for single-tenant apps)
        const tenantSlug = input.tenantId || "common";
        const resp = await fetch(
          `https://login.microsoftonline.com/${tenantSlug}/oauth2/v2.0/token`,
          {
            method: "POST",
            body: buildFormBody({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "client_credentials",
              scope: "https://graph.microsoft.com/.default",
            }),
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
          }
        );
        const data = await resp.json() as { error?: string; error_description?: string; access_token?: string };
        // invalid_client = bad credentials; other errors (e.g. unsupported_grant_type on /common) = credentials are valid
        if (data.error === "invalid_client") {
          return { valid: false, error: data.error_description ?? "Invalid client credentials" };
        }
        // Any other response (including errors about tenant/grant) means the credentials were accepted
        // Persist lastVerifiedAt so the UI can show "Last verified: X ago"
        await db.setCredentialLastVerified(ctx.user.id, provider).catch(() => {});
        return { valid: true, note: "Credentials verified. Make sure to register the redirect URI in Azure Portal: Authentication → Redirect URIs → Add https://leveluphub-ez4tinmn.manus.space/api/oauth/microsoft/callback" };
      } else {
        // Google: use the token info endpoint to check if the client_id is registered
        // We attempt a token exchange with a dummy code — Google will return
        // "invalid_client" for bad credentials vs other errors for bad code
        const resp = await fetch(
          "https://oauth2.googleapis.com/token",
          {
            method: "POST",
            body: buildFormBody({
              client_id: clientId,
              client_secret: clientSecret,
              grant_type: "authorization_code",
              code: "VALIDATION_PROBE",
              redirect_uri: "https://localhost",
            }),
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
          }
        );
        const data = await resp.json() as { error?: string; error_description?: string };
        if (data.error === "invalid_client") {
          return { valid: false, error: data.error_description ?? "Invalid client credentials" };
        }
        // "invalid_grant" or other errors = credentials are valid, just the probe code is bad
        await db.setCredentialLastVerified(ctx.user.id, provider).catch(() => {});
        return { valid: true };
      }
    }),

  /**
   * Toggle the sharedWithTeam flag on the current user's credentials.
   * Admin-only: only admins can share credentials with the team.
   */
  setCredentialSharing: protectedProcedure
    .input(z.object({
      provider: z.enum(["microsoft", "google"]),
      shared: z.boolean(),
    }))
    .mutation(async ({ input, ctx }) => {
      if (ctx.user.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can share credentials with the team" });
      }
      await db.setCredentialSharing(ctx.user.id, input.provider, input.shared);
      return { success: true };
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

  /**
   * Save SMTP/IMAP credentials for a secondary email account
   */
  saveSmtpImapAccount: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      displayName: z.string().optional(),
      imapHost: z.string().min(1),
      imapPort: z.number().int().min(1).max(65535),
      imapEncryption: z.enum(['ssl', 'tls', 'none']),
      imapUsername: z.string().min(1),
      imapPassword: z.string().min(1),
      smtpHost: z.string().min(1),
      smtpPort: z.number().int().min(1).max(65535),
      smtpEncryption: z.enum(['ssl', 'tls', 'none']),
      smtpUsername: z.string().min(1),
      smtpPassword: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      // Save account directly — use testSmtpImapConnection to verify separately
      await db.upsertSmtpImapAccount({
        userId: ctx.user.id,
        email: input.email,
        displayName: input.displayName || null,
        imapHost: input.imapHost,
        imapPort: input.imapPort,
        imapEncryption: input.imapEncryption,
        imapUsername: input.imapUsername,
        imapPassword: input.imapPassword,
        smtpHost: input.smtpHost,
        smtpPort: input.smtpPort,
        smtpEncryption: input.smtpEncryption,
        smtpUsername: input.smtpUsername,
        smtpPassword: input.smtpPassword,
      });
      return { success: true };
    }),

  /**
   * testSmtpImapConnection — verify SMTP credentials without saving.
  /**
   * testSmtpImapConnection — verify SMTP and IMAP credentials simultaneously.
   * Called by the "Test" button in Settings → Mail.
   * Runs both checks in parallel and returns individual pass/fail + latency for each.
   */
  testSmtpImapConnection: protectedProcedure
    .input(z.object({
      imapHost: z.string().min(1),
      imapPort: z.number().int().min(1).max(65535),
      imapEncryption: z.enum(['ssl', 'tls', 'none']),
      imapUsername: z.string().min(1),
      imapPassword: z.string().min(1),
      smtpHost: z.string().min(1),
      smtpPort: z.number().int().min(1).max(65535),
      smtpEncryption: z.enum(['ssl', 'tls', 'none']),
      smtpUsername: z.string().min(1),
      smtpPassword: z.string().min(1),
    }))
    .mutation(async ({ input }) => {
      // Run SMTP and IMAP checks in parallel
      const [smtpResult, imapResult] = await Promise.allSettled([
        // --- SMTP check ---
        (async () => {
          const t0 = Date.now();
          await testSmtpConnection({
            smtpHost: input.smtpHost,
            smtpPort: input.smtpPort,
            smtpEncryption: input.smtpEncryption,
            smtpUsername: input.smtpUsername,
            smtpPassword: input.smtpPassword,
          });
          return { latencyMs: Date.now() - t0 };
        })(),
        // --- IMAP check ---
        (async () => {
          const t0 = Date.now();
          await new Promise<void>((resolve, reject) => {
            const imap = new Imap({
              user: input.imapUsername,
              password: input.imapPassword,
              host: input.imapHost,
              port: input.imapPort,
              tls: input.imapEncryption !== 'none',
              tlsOptions: { rejectUnauthorized: false },
              authTimeout: 8000,
              connTimeout: 8000,
            });
            imap.once('ready', () => { imap.end(); resolve(); });
            imap.once('error', (err: Error) => reject(err));
            imap.connect();
          });
          return { latencyMs: Date.now() - t0 };
        })(),
      ]);

      const smtp = smtpResult.status === 'fulfilled'
        ? { ok: true, latencyMs: smtpResult.value.latencyMs, message: 'Connected successfully' }
        : { ok: false, latencyMs: null, message: smtpResult.reason instanceof Error ? smtpResult.reason.message : String(smtpResult.reason) };

      const imap = imapResult.status === 'fulfilled'
        ? { ok: true, latencyMs: imapResult.value.latencyMs, message: 'Connected successfully' }
        : { ok: false, latencyMs: null, message: imapResult.reason instanceof Error ? imapResult.reason.message : String(imapResult.reason) };

      return {
        success: smtp.ok && imap.ok,
        smtp,
        imap,
      };
    }),

  /**
   * Get SMTP/IMAP account for current user
   */
  getSmtpImapAccount: protectedProcedure
    .query(async ({ ctx }) => {
      const account = await db.getSmtpImapAccount(ctx.user.id);
      if (!account) return null;
      return {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        imapHost: account.imapHost,
        imapPort: account.imapPort,
        imapEncryption: account.imapEncryption,
        smtpHost: account.smtpHost,
        smtpPort: account.smtpPort,
        smtpEncryption: account.smtpEncryption,
        lastTestedAt: account.lastTestedAt,
      };
    }),

  /**
   * Get all SMTP/IMAP accounts for the current user (for compose From selector)
   */
  getAllSmtpAccounts: protectedProcedure
    .query(async ({ ctx }) => {
      const accounts = await db.getAllSmtpImapAccounts(ctx.user.id);
      return accounts.map(a => ({
        id: a.id,
        email: a.email,
        displayName: a.displayName,
        smtpHost: a.smtpHost,
      }));
    }),

  /**
   * Delete SMTP/IMAP account
   */
  deleteSmtpImapAccount: protectedProcedure
    .mutation(async ({ ctx }) => {
      await db.deleteSmtpImapAccount(ctx.user.id);
      return { success: true };
    }),

  /**
   * Sync mail from SMTP/IMAP secondary account
   * Fetches recent emails using IMAP
   */
  syncSmtpMail: protectedProcedure
    .input(z.object({
      accountId: z.number(),
      limit: z.number().default(20),
    }))
    .mutation(async ({ ctx, input }) => {
      const account = await db.getSmtpImapAccount(input.accountId);
      if (!account) {
        throw new TRPCError({ code: "NOT_FOUND", message: "SMTP/IMAP account not found" });
      }

      try {
        const messages: any[] = [];

        // Create IMAP connection
        const imap = new Imap({
          user: account.email,
          password: account.smtpPassword,
          host: account.imapHost,
          port: account.imapPort,
          tls: account.smtpEncryption !== 'none',
          tlsOptions: { rejectUnauthorized: false },
        });

        // Fetch emails from INBOX
        await new Promise<void>((resolve, reject) => {
          imap.openBox('INBOX', false, (err: any, box: any) => {
            if (err) reject(err);
            else {
              // Search for recent emails (limit to last 20)
              imap.search(['ALL'], (err: any, results: any) => {
                if (err) reject(err);
                else if (results.length > 0) {
                  const f = imap.fetch(results.slice(-input.limit), { bodies: '' });
                  f.on('message', (msg: any, seqno: number) => {
                    // @ts-ignore - simpleParser callback types
                    simpleParser(msg, async (err: any, parsed: any) => {
                      if (err) console.error('Parse error:', err);
                      else {
                        messages.push({
                          subject: parsed.subject || '(No subject)',
                          from: parsed.from?.text || '(Unknown)',
                          date: parsed.date,
                          preview: parsed.text?.substring(0, 200) || '',
                        });
                      }
                    });
                  });
                  f.on('error', reject);
                  f.on('end', resolve);
                } else {
                  resolve();
                }
              });
            }
          });
        });

        imap.end();

        // TODO: Update lastSyncedAt for SMTP/IMAP account
        return { messages, provider: "smtp_imap", accountEmail: account.email };
      } catch (err) {
        console.error("[syncSmtpMail] Error:", err);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to sync SMTP/IMAP mail: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }),

  // ─── Calendar Events (DB) ────────────────────────────────────────────────

  /**
   * Get persisted calendar events from the database for the current user.
   * Supports optional date range filtering. Falls back to next 30 days if not specified.
   */
  getCalendarEventsFromDB: protectedProcedure
    .input(z.object({
      from: z.date().optional(),
      to: z.date().optional(),
      provider: z.enum(["microsoft", "google"]).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      const from = input?.from ?? new Date();
      const to = input?.to ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const events = await db.getCalendarEvents(ctx.user.id, {
        from,
        to,
        provider: input?.provider,
      });
      return events;
    }),

  /**
   * Fetch the next N upcoming events for the dashboard widget.
   * Tries Microsoft Graph live first; falls back to the local DB cache.
   * Returns a lightweight shape suitable for the dashboard card.
   */
  getUpcomingEvents: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(20).default(5),
      daysAhead: z.number().int().min(1).max(90).default(14),
    }).optional())
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 5;
      const daysAhead = input?.daysAhead ?? 14;
      const now = new Date();
      const end = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

      // Try live Microsoft Graph first
      try {
        const accessToken = await getValidAccessToken(ctx.user.id, 'microsoft');
        if (accessToken) {
          const resp = await fetch(
            `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}&$top=${limit}&$orderby=start/dateTime&$select=id,subject,start,end,location,bodyPreview,organizer,isAllDay,onlineMeeting,webLink`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (resp.ok) {
            const data = await resp.json() as { value: Array<{
              id: string;
              subject: string;
              start: { dateTime: string; timeZone: string };
              end: { dateTime: string; timeZone: string };
              location?: { displayName?: string };
              bodyPreview?: string;
              organizer?: { emailAddress?: { name?: string; address?: string } };
              isAllDay?: boolean;
              onlineMeeting?: { joinUrl?: string } | null;
              webLink?: string;
            }> };
            return {
              source: 'live' as const,
              events: data.value.map((e) => ({
                id: e.id,
                title: e.subject || '(No title)',
                startAt: new Date(e.start.dateTime),
                endAt: new Date(e.end.dateTime),
                location: e.location?.displayName ?? null,
                organizer: e.organizer?.emailAddress?.name ?? null,
                isAllDay: e.isAllDay ?? false,
                joinUrl: e.onlineMeeting?.joinUrl ?? null,
                webLink: e.webLink ?? null,
                bodyPreview: e.bodyPreview ?? null,
              })),
            };
          }
        }
      } catch (err) {
        console.warn('[getUpcomingEvents] Live fetch failed, falling back to DB:', err);
      }

      // Fallback: return from local DB cache
      const dbEvents = await db.getCalendarEvents(ctx.user.id, { from: now, to: end });
      return {
        source: 'cache' as const,
        events: dbEvents.slice(0, limit).map((e) => ({
          id: String(e.id),
          title: e.title || '(No title)',
          startAt: new Date(e.start),
          endAt: new Date(e.end),
          location: e.location ?? null,
          organizer: e.organizer ?? null,
          isAllDay: Boolean(e.isAllDay),
          joinUrl: null,
          webLink: null,
          bodyPreview: e.description ?? null,
        })),
      };
    }),

  /**
   * Delete a single calendar event from the local DB.
   * Only the owning user can delete their own events.
   */
  deleteCalendarEvent: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await db.deleteCalendarEvent(ctx.user.id, input.id);
    }),

  /**
   * updateCalendarEvent — edit a locally-stored calendar event.
   * Only the owning user can update their own events.
   */
  updateCalendarEvent: protectedProcedure
    .input(z.object({
      id: z.number().int(),
      title: z.string().min(1).max(512).optional(),
      start: z.date().optional(),
      end: z.date().optional(),
      location: z.string().max(512).nullable().optional(),
      description: z.string().max(4096).nullable().optional(),
      isAllDay: z.number().int().min(0).max(1).optional(),
      recurrence: z.enum(['none', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly']).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input;
      const result = await db.updateCalendarEvent(ctx.user.id, id, updates);
      if (!result) throw new TRPCError({ code: 'NOT_FOUND', message: 'Calendar event not found' });
      return result;
    }),

  // ─── Secret Expiry Reminders ──────────────────────────────────────────────

  /** List all secret expiry reminders for the current user */
  getSecretExpiries: protectedProcedure
    .query(async ({ ctx }) => {
      return await db.getSecretExpiries(ctx.user.id);
    }),

  /** Create or update a secret expiry reminder */
  upsertSecretExpiry: protectedProcedure
    .input(z.object({
      id: z.number().optional(),
      provider: z.enum(['microsoft', 'google']),
      label: z.string().min(1).max(128),
      expiresAt: z.date(),
      notifyDaysBefore: z.number().int().min(1).max(365).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      return await db.upsertSecretExpiry({
        id: input.id,
        userId: ctx.user.id,
        provider: input.provider,
        label: input.label,
        expiresAt: input.expiresAt,
        notifyDaysBefore: input.notifyDaysBefore,
      });
    }),

  /** Delete a secret expiry reminder */
  deleteSecretExpiry: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      return await db.deleteSecretExpiry(ctx.user.id, input.id);
    }),

  // ─── Email Notifications ──────────────────────────────────────────────────

  /**
   * Get unread email notifications for the current user
   */
  getEmailNotifications: protectedProcedure
    .query(async ({ ctx }) => {
      const notifications = await db.getUnreadEmailNotifications(ctx.user.id);
      return notifications;
    }),

  /**
   * Mark a single email notification as read
   */
  markEmailNotificationRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await (await import('../db')).getDb();
      if (!dbInstance) return { success: false };
      const { emailNotifications } = await import('../../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      await dbInstance
        .update(emailNotifications)
        .set({ read: 1 })
        .where(and(eq(emailNotifications.id, input.id), eq(emailNotifications.userId, ctx.user.id)));
      return { success: true };
    }),

  /**
   * Mark all email notifications as read for the current user
   */
  markAllEmailNotificationsRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      const dbInstance = await (await import('../db')).getDb();
      if (!dbInstance) return { success: false };
      const { emailNotifications } = await import('../../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      await dbInstance
        .update(emailNotifications)
        .set({ read: 1 })
        .where(eq(emailNotifications.userId, ctx.user.id));
      return { success: true };
    }),

  // ─── Calendar Event Reminders ─────────────────────────────────────────────

  /**
   * Get pending (unsent) event reminders for the current user
   */
  getEventReminders: protectedProcedure
    .query(async ({ ctx }) => {
      const dbInstance = await (await import('../db')).getDb();
      if (!dbInstance) return [];
      const { eventReminders } = await import('../../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      const result = await dbInstance
        .select()
        .from(eventReminders)
        .where(and(eq(eventReminders.userId, ctx.user.id), eq(eventReminders.sent, 0)))
        .orderBy(eventReminders.eventStart);
      return result;
    }),

  /**
   * Create event reminders for upcoming events (called after calendar sync)
   * Creates 5min, 15min, and 1hour reminders for each event
   */
  createEventReminders: protectedProcedure
    .input(z.object({
      events: z.array(z.object({
        eventId: z.string(),
        eventTitle: z.string(),
        eventStart: z.string(), // ISO date string
        provider: z.string(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      let created = 0;
      for (const event of input.events) {
        const startDate = new Date(event.eventStart);
        // Only create reminders for future events
        if (startDate.getTime() <= Date.now()) continue;
        const reminderTypes: Array<'5min' | '15min' | '1hour'> = ['5min', '15min', '1hour'];
        for (const reminderType of reminderTypes) {
          await db.createEventReminder({
            userId: ctx.user.id,
            provider: event.provider,
            eventId: event.eventId,
            eventTitle: event.eventTitle,
            eventStart: startDate,
            reminderType,
          });
          created++;
        }
      }
      return { created };
    }),

  /**
   * Dismiss (mark sent) an event reminder
   */
  dismissEventReminder: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const dbInstance = await (await import('../db')).getDb();
      if (!dbInstance) return { success: false };
      const { eventReminders } = await import('../../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      await dbInstance
        .update(eventReminders)
        .set({ sent: 1 })
        .where(and(eq(eventReminders.id, input.id), eq(eventReminders.userId, ctx.user.id)));
      return { success: true };
    }),

  // ─── Sync Status Dashboard ────────────────────────────────────────────────

  /**
   * Test the connection to a provider by making a lightweight /me API call.
   * Returns { ok, provider, displayName?, email?, latencyMs } or { ok: false, error }.
   */
  testConnection: protectedProcedure
    .input(z.object({ provider: z.enum(['microsoft', 'google']) }))
    .mutation(async ({ ctx, input }) => {
      const start = Date.now();
      try {
        const accessToken = await getValidAccessToken(ctx.user.id, input.provider);
        if (!accessToken) {
          return { ok: false as const, provider: input.provider, error: 'No access token — connect this provider first.' };
        }

        if (input.provider === 'microsoft') {
          const resp = await fetch(
            'https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName',
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!resp.ok) {
            const text = await resp.text();
            return { ok: false as const, provider: input.provider, error: `Microsoft Graph returned ${resp.status}: ${text.slice(0, 200)}` };
          }
          const data = await resp.json() as { displayName?: string; mail?: string; userPrincipalName?: string };
          return {
            ok: true as const,
            provider: input.provider,
            displayName: data.displayName ?? null,
            email: data.mail ?? data.userPrincipalName ?? null,
            latencyMs: Date.now() - start,
          };
        } else {
          // Google
          const resp = await fetch(
            'https://www.googleapis.com/oauth2/v2/userinfo',
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (!resp.ok) {
            const text = await resp.text();
            return { ok: false as const, provider: input.provider, error: `Google API returned ${resp.status}: ${text.slice(0, 200)}` };
          }
          const data = await resp.json() as { name?: string; email?: string };
          return {
            ok: true as const,
            provider: input.provider,
            displayName: data.name ?? null,
            email: data.email ?? null,
            latencyMs: Date.now() - start,
          };
        }
      } catch (err) {
        return { ok: false as const, provider: input.provider, error: err instanceof Error ? err.message : 'Unknown error' };
      }
    }),

  /**
   * Get sync status for all providers for the current user
   */
  getSyncStatusAll: protectedProcedure
    .query(async ({ ctx }) => {
      const allStatus = await db.getAllSyncStatus(ctx.user.id);
      const oauthStatus = await db.getOAuthToken(ctx.user.id, 'microsoft');
      return {
        providers: allStatus,
        microsoftLastSyncedAt: oauthStatus?.lastSyncedAt ?? null,
      };
    }),

  /**
   * Trigger a full sync for all connected providers and return results
   */
  syncAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      const results: Record<string, { success: boolean; message: string; eventsCount?: number; emailsCount?: number }> = {};
      // Check Microsoft connection
      const msToken = await db.getOAuthToken(ctx.user.id, 'microsoft');
      if (msToken?.accessToken) {
        try {
          const accessToken = await getValidAccessToken(ctx.user.id, 'microsoft');
          if (accessToken) {
            // Sync calendar
            const calResp = await fetch(
              `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${new Date().toISOString()}&endDateTime=${new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()}&$top=50&$select=subject,start,end,location,bodyPreview`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const calData = calResp.ok ? await calResp.json() as { value: any[] } : { value: [] };
            const eventsCount = calData.value?.length ?? 0;
            // Sync mail
            const mailResp = await fetch(
              `https://graph.microsoft.com/v1.0/me/messages?$top=20&$select=subject,from,receivedDateTime,bodyPreview,isRead&$orderby=receivedDateTime desc`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            const mailData = mailResp.ok ? await mailResp.json() as { value: any[] } : { value: [] };
            const emailsCount = mailData.value?.length ?? 0;
            await db.updateOAuthTokenLastSynced(ctx.user.id, 'microsoft');
            await db.updateSyncStatus({
              userId: ctx.user.id,
              provider: 'microsoft',
              lastSyncStatus: 'success',
              totalEventsImported: eventsCount,
              totalEmailsImported: emailsCount,
            });
            results['microsoft'] = { success: true, message: `Synced ${eventsCount} events, ${emailsCount} emails`, eventsCount, emailsCount };
          } else {
            results['microsoft'] = { success: false, message: 'Access token unavailable' };
          }
        } catch (err) {
          await db.updateSyncStatus({
            userId: ctx.user.id,
            provider: 'microsoft',
            lastSyncStatus: 'failed',
            syncErrorMessage: err instanceof Error ? err.message : String(err),
          });
          results['microsoft'] = { success: false, message: err instanceof Error ? err.message : String(err) };
        }
      }
      // Check SMTP/IMAP
      const smtpAccount = await db.getSmtpImapAccount(ctx.user.id);
      if (smtpAccount) {
        results['smtp_imap'] = { success: true, message: 'SMTP/IMAP account configured' };
      }
      return results;
    }),

  // ─── Bulk Import ──────────────────────────────────────────────────────────

  /**
   * Bulk import calendar events from a date range
   */
  bulkImportCalendar: protectedProcedure
    .input(z.object({
      provider: z.enum(['microsoft', 'google']),
      startDate: z.string(), // ISO date string
      endDate: z.string(),   // ISO date string
    }))
    .mutation(async ({ ctx, input }) => {
      const accessToken = await getValidAccessToken(ctx.user.id, input.provider);
      if (!accessToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Not connected to ${input.provider}` });
      const startISO = new Date(input.startDate).toISOString();
      const endISO = new Date(input.endDate).toISOString();
      if (input.provider === 'microsoft') {
        const resp = await fetch(
          `https://graph.microsoft.com/v1.0/me/calendarView?startDateTime=${startISO}&endDateTime=${endISO}&$top=100&$select=subject,start,end,location,bodyPreview`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Microsoft Graph calendar fetch failed: ${resp.status}` });
        const data = await resp.json() as { value: Array<{ subject: string; start: { dateTime: string }; end: { dateTime: string }; location?: { displayName?: string }; bodyPreview?: string }> };
        const events = (data.value || []).map(e => ({
          title: e.subject,
          start: e.start.dateTime,
          end: e.end.dateTime,
          location: e.location?.displayName ?? '',
          notes: e.bodyPreview ?? '',
        }));
        await db.updateOAuthTokenLastSynced(ctx.user.id, 'microsoft');
        await db.updateSyncStatus({
          userId: ctx.user.id,
          provider: 'microsoft',
          lastSyncStatus: 'success',
          totalEventsImported: events.length,
        });
        return { provider: 'microsoft', events, count: events.length };
      }
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Provider ${input.provider} not supported for bulk import` });
    }),

  /**
   * Bulk import emails from a date range
   */
  bulkImportMail: protectedProcedure
    .input(z.object({
      provider: z.enum(['microsoft', 'google']),
      startDate: z.string(), // ISO date string
      endDate: z.string(),   // ISO date string
      limit: z.number().default(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const accessToken = await getValidAccessToken(ctx.user.id, input.provider);
      if (!accessToken) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Not connected to ${input.provider}` });
      const startISO = new Date(input.startDate).toISOString();
      const endISO = new Date(input.endDate).toISOString();
      if (input.provider === 'microsoft') {
        const filter = `receivedDateTime ge ${startISO} and receivedDateTime le ${endISO}`;
        const resp = await fetch(
          `https://graph.microsoft.com/v1.0/me/messages?$top=${input.limit}&$select=subject,from,receivedDateTime,bodyPreview,isRead&$filter=${encodeURIComponent(filter)}&$orderby=receivedDateTime desc`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!resp.ok) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `Microsoft Graph mail fetch failed: ${resp.status}` });
        const data = await resp.json() as { value: Array<{ subject: string; from: { emailAddress: { name: string; address: string } }; receivedDateTime: string; bodyPreview: string; isRead: boolean }> };
        const messages = (data.value || []).map(m => ({
          subject: m.subject,
          from: m.from.emailAddress.name || m.from.emailAddress.address,
          fromEmail: m.from.emailAddress.address,
          date: m.receivedDateTime,
          preview: m.bodyPreview,
          read: m.isRead,
        }));
        await db.updateSyncStatus({
          userId: ctx.user.id,
          provider: 'microsoft',
          lastSyncStatus: 'success',
          totalEmailsImported: messages.length,
        });
        return { provider: 'microsoft', messages, count: messages.length };
      }
      throw new TRPCError({ code: 'BAD_REQUEST', message: `Provider ${input.provider} not supported for bulk import` });
    }),

  suggestFollowUps: protectedProcedure
    .input(z.object({
      subject: z.string(),
      body: z.string(),
      provider: z.enum(['manus', 'openai', 'claude', 'gemini']).optional().default('manus'),
      apiKey: z.string().max(512).optional(),
    }))
    .mutation(async ({ input }) => {
      const { callAIProvider } = await import('../_core/aiProviders');
      const userContent = `Email draft to follow up on.\n\nSubject: ${input.subject || '(no subject)'}\n\nBody:\n${input.body || '(empty)'}`;
      const { text } = await callAIProvider({
        provider: input.provider,
        apiKey: input.apiKey,
        systemPrompt: 'You are a helpful email writing assistant. Suggest exactly 3 concise follow-up messages (1-3 sentences each) the sender could use if they don\'t receive a reply within a few days. Return ONLY a JSON object of the form {"suggestions": ["...", "...", "..."]} — no commentary.',
        userContent,
        jsonMode: true,
        maxTokens: 512,
      });
      let suggestions: string[] = [];
      try {
        const parsed = JSON.parse(text || '{}');
        suggestions = Array.isArray(parsed) ? parsed : (parsed.suggestions || []);
      } catch {
        suggestions = [];
      }
      return { suggestions: suggestions.slice(0, 3) };
    }),
});
