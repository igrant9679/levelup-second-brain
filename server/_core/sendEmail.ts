/**
 * sendEmail — Nodemailer-based email transport for ALL system mail
 * (Team invites, reports, notifications). Every message is sent from the single
 * configured "secondary email": the system notification sender if one is
 * explicitly selected, otherwise the configured SMTP/IMAP secondary account.
 * Supports a connected Google/Microsoft OAuth2 account too, if that's selected.
 *
 * Logs as "skipped" when no sender is configured. Every attempt (sent, failed,
 * or skipped) is recorded in email_delivery_log.
 */
import nodemailer from "nodemailer";
import { getDb } from "../db";
import { insertEmailDeliveryLog as insertEmailDeliveryLogRaw } from "../db";
import { systemSettings, oauthTokens } from "../../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";
import { emailTemplate } from "./emailTemplate";
import { mailTlsOptions, operatorWorkspaceId, ownerUserIds } from "./mailTrust";
import { platformMailConfigured, sendViaPlatform } from "./platformMail";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** userId of the sender (for delivery log). Pass null for system-initiated emails. */
  senderUserId?: number | null;
  /**
   * Whose workspace this mail is for (multi-workspace, -278). Decides which
   * sender carries it and whose name is on it. When omitted it is taken from
   * senderUserId, then recipientUserId; with none of them it is platform mail.
   */
  workspaceId?: number | null;
  /**
   * 'account' = about the login or the invitation itself (invite, password
   * reset, address confirmation): contains nothing from a workspace, so when
   * the workspace has no sender of its own it may go through the platform's.
   * 'content' (default) = carries workspace content (digests, check-ins,
   * reports, follow-ups): only ever through the platform mail service or the
   * workspace's OWN sender — never through another workspace's mailbox.
   */
  kind?: "account" | "content";
  /** The member this mail is for — only used to work out the workspace. */
  recipientUserId?: number | null;
  /** Threading (the AI coach, build -220): our own Message-ID so a reply can
   *  be matched to the message it answers, where replies should go, and the
   *  headers that keep a reply in the same thread in the user's mail app. */
  messageId?: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string;
  /** Display name for the From header (e.g. "Idris Grant via LevelUp"); the
   *  address stays the configured sender's. Used for emails sent to people
   *  outside LevelUp on a user's behalf (PM delegation follow-ups). */
  fromName?: string;
}

/**
 * Resolve the system notification sender from system_settings.
 * Returns { provider, userId } or null if not configured.
 *
 * Supports two storage formats:
 *   - JSON: {"provider":"google","userId":3}
 *   - Colon-separated: "google:3"  (used by oauthSync.setNotificationSender)
 */
async function resolveNotificationSender(wsId: number | null): Promise<{
  provider: "google" | "microsoft" | "smtp";
  userId: number;
} | null> {
  const db = await getDb();
  if (!db) return null;
  let raw: string | undefined;
  if (wsId != null) {
    const { getWorkspaceSetting } = await import("./workspace");
    raw = await getWorkspaceSetting(wsId, "notificationSender");
  } else {
    // no workspace model (older unit tests): the one global setting
    const rows = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, "notificationSender"));
    raw = rows[0]?.value;
  }
  if (raw) {
    // Try JSON format first: {"provider":"google","userId":3}
    try {
      const parsed = JSON.parse(raw) as {
        provider: "google" | "microsoft" | "smtp";
        userId: number;
      };
      if (parsed.provider && parsed.userId) return parsed;
    } catch {
      // Not JSON — fall through to colon-separated format
    }

    // Try colon-separated format: "provider:userId"
    const parts = raw.split(":");
    if (parts.length === 2) {
      const provider = parts[0] as "google" | "microsoft" | "smtp";
      const userId = parseInt(parts[1], 10);
      if (
        (provider === "google" || provider === "microsoft" || provider === "smtp") &&
        !isNaN(userId)
      ) {
        return { provider, userId };
      }
    }
  }

  // Fallback: no sender was explicitly selected, but a secondary (SMTP/IMAP)
  // email account IS configured. Use it. This makes "configure the secondary
  // email" sufficient to send ALL system mail (Team invites, reports,
  // notifications) — no separate "select notification sender" step required.
  // Only the OWNER's secondary account qualifies (audit F8) — never a member's.
  try {
    const { getAllSmtpAccounts } = await import("../db");
    const owners = await ownerUserIds(wsId);
    const accounts = (await getAllSmtpAccounts(Array.from(owners))).filter(a => owners.has(a.userId));
    if (accounts.length) {
      const acct = accounts.slice().sort((a, b) => a.userId - b.userId)[0];
      return { provider: "smtp", userId: acct.userId };
    }
  } catch (e) {
    console.warn("[sendEmail] secondary-account fallback lookup failed:", e);
  }

  return null;
}

/**
 * Build a Nodemailer transporter using the stored OAuth2 access token.
 * For Google: SMTP via smtp.gmail.com with OAuth2.
 * For Microsoft: SMTP via smtp.office365.com with OAuth2.
 */
async function buildTransporter(
  provider: "google" | "microsoft" | "smtp",
  userId: number
): Promise<{ transporter: nodemailer.Transporter; from: string } | null> {
  const db = await getDb();
  if (!db) return null;

  // SMTP/IMAP secondary account — use stored host/port/credentials.
  if (provider === "smtp") {
    const { getSmtpImapAccountFull } = await import("../db");
    const account = await getSmtpImapAccountFull(userId);
    if (!account) return null;
    // Port-aware TLS mode: 465 is ALWAYS implicit TLS and 587 is ALWAYS
    // STARTTLS, regardless of the stored encryption label. Providers describe
    // implicit-TLS-on-465 as "TLS: true", so users legitimately pick our
    // "TLS" (STARTTLS) option for a 465 endpoint — nodemailer then waits for
    // a plaintext greeting the server will never send ("Greeting never
    // received"). Trust the port; the label only decides for other ports.
    const port = Number(account.smtpPort) || 587;
    const secure = port === 465 ? true : port === 587 ? false : account.smtpEncryption === "ssl";
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port,
      secure,
      requireTLS: !secure && account.smtpEncryption !== "none",
      auth: { user: account.smtpUsername, pass: account.smtpPassword },
      tls: mailTlsOptions(),
      // Fail fast with a crisp error instead of hanging ~2min on a blocked
      // port / wrong host — the delivery log then shows ETIMEDOUT etc. clearly.
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
    const fromName = account.displayName || "LevelUp";
    return { transporter, from: `"${fromName}" <${account.email}>` };
  }

  // OAuth-based providers (Google / Microsoft)
  const tokenRows = await db
    .select()
    .from(oauthTokens)
    .where(
      and(
        eq(oauthTokens.userId, userId),
        eq(oauthTokens.provider, provider)
      )
    );
  if (!tokenRows.length) return null;
  const token = tokenRows[0];
  if (!token.email) return null;

  // Refresh the OAuth access token if it's expired / near-expiry. Google &
  // Microsoft access tokens last ~1 hour, so WITHOUT this, system mail silently
  // stops sending an hour after the last token refresh (the most common cause of
  // "emails worked, then stopped"). getValidAccessToken refreshes via the stored
  // refresh_token when needed. Falls back to the stored token if refresh fails.
  let accessToken = token.accessToken;
  try {
    const { getValidAccessToken } = await import("../routers/oauth-sync");
    const fresh = await getValidAccessToken(userId, provider);
    if (fresh) accessToken = fresh;
  } catch (e) {
    console.warn("[sendEmail] OAuth token refresh failed, using stored token:", e);
  }
  if (!accessToken) return null;

  if (provider === "google") {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: token.email,
        accessToken,
      },
    });
    return { transporter, from: `"LevelUp" <${token.email}>` };
  } else {
    // Microsoft / Office 365
    const transporter = nodemailer.createTransport({
      host: "smtp.office365.com",
      port: 587,
      secure: false,
      auth: {
        type: "OAuth2",
        user: token.email,
        accessToken,
      },
    });
    return { transporter, from: `"LevelUp" <${token.email}>` };
  }
}

/**
 * Build the ordered list of sender candidates to try — ALL of them accounts
 * of the workspace owner (audit F8: a member's mailbox must never carry
 * password resets or invites):
 *   1. the explicitly configured notification sender (or SMTP fallback),
 *   2. the owner's other SMTP/IMAP secondary accounts,
 *   3. the owner's connected Google/Microsoft accounts that have an email +
 *      refresh token.
 * One revoked credential (expired refresh token, revoked Gmail app-password)
 * used to take down ALL system mail — password resets, invites, digests —
 * because only the single resolved sender was ever tried. Now each candidate
 * is tried in order until one sends.
 */
async function resolveSenderCandidates(wsId: number | null): Promise<Array<{
  provider: "google" | "microsoft" | "smtp";
  userId: number;
}>> {
  const out: Array<{ provider: "google" | "microsoft" | "smtp"; userId: number }> = [];
  const seen = new Set<string>();
  const owners = await ownerUserIds(wsId);
  if (!owners.size) return out;
  const push = (provider: "google" | "microsoft" | "smtp", userId: number) => {
    if (!owners.has(userId)) return;
    const k = provider + ":" + userId;
    if (!seen.has(k)) { seen.add(k); out.push({ provider, userId }); }
  };
  const primary = await resolveNotificationSender(wsId);
  if (primary) push(primary.provider, primary.userId);
  try {
    const { getAllSmtpAccounts } = await import("../db");
    const accounts = await getAllSmtpAccounts(Array.from(owners));
    accounts.slice().sort((a, b) => a.userId - b.userId).forEach(a => push("smtp", a.userId));
  } catch { /* non-fatal */ }
  try {
    const db = await getDb();
    if (db) {
      const tokens = await db.select().from(oauthTokens).where(inArray(oauthTokens.userId, Array.from(owners)));
      for (const t of tokens) {
        if ((t.provider === "google" || t.provider === "microsoft") && t.email && t.refreshToken) {
          push(t.provider, t.userId);
        }
      }
    }
  } catch { /* non-fatal */ }
  return out;
}

/**
 * Send an email using the configured system notification sender, falling back
 * to every other configured sender (SMTP secondary accounts, connected OAuth
 * accounts) if the primary fails. Returns true on success, false if no sender
 * is configured or all candidates fail. Every attempt-chain is recorded in
 * email_delivery_log (the errorMessage carries the per-candidate trail).
 */
/** The workspace a mail belongs to: stated, else the sender's, else the recipient's. */
async function workspaceOfMail(payload: EmailPayload): Promise<number | null> {
  const stated = Number(payload.workspaceId);
  if (Number.isInteger(stated) && stated > 0) return stated;
  try {
    const { wsIdOf } = await import("./workspace");
    for (const uid of [payload.senderUserId, payload.recipientUserId]) {
      if (uid == null) continue;
      const w = await wsIdOf({ id: Number(uid) });
      if (w) return w;
    }
  } catch { /* platform mail */ }
  return null;
}

export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const logUserId = payload.senderUserId ?? null;
  let wsId: number | null = null;
  const insertEmailDeliveryLog = (row: any) => insertEmailDeliveryLogRaw({ ...row, workspaceId: wsId });

  try {
    wsId = await workspaceOfMail(payload);
    let wsName: string | null = null;
    if (wsId != null) {
      try { const { getWorkspace } = await import("./workspace"); wsName = (await getWorkspace(wsId))?.name || null; } catch { /* unnamed */ }
    }
    // The display name on the From line: "‹Workspace› via LevelUp" unless the caller chose one.
    const fromName = payload.fromName || (wsName ? `${wsName} via LevelUp` : undefined);

    // Wrap the body in the shared branded template unless it already contains <!DOCTYPE
    const rawHtml = payload.html;
    const wrappedHtml = rawHtml.trimStart().toLowerCase().startsWith("<!doctype")
      ? rawHtml
      : emailTemplate({ subject: payload.subject, body: rawHtml });

    // 1. The platform mail service (Postmark / Resend), when one is configured:
    //    every workspace's mail goes through it, under the workspace's name.
    if (platformMailConfigured()) {
      const r = await sendViaPlatform({
        to: payload.to, subject: payload.subject, html: wrappedHtml,
        text: payload.text ?? rawHtml.replace(/<[^>]+>/g, ""),
        fromName: fromName || "LevelUp",
        messageId: payload.messageId, replyTo: payload.replyTo, inReplyTo: payload.inReplyTo, references: payload.references,
      });
      if (r.ok) {
        await insertEmailDeliveryLog({ userId: logUserId, to: payload.to, subject: payload.subject, status: "sent", errorMessage: null });
        return true;
      }
      console.warn("[sendEmail] platform mail service failed, trying the workspace's own sender:", r.error);
    }

    // 2. The workspace's own sender — accounts of ITS owner only (a member's
    //    mailbox, or another workspace's, never carries its mail).
    // Mail that belongs to no workspace (a password reset) is the platform's:
    // it goes out through the operator workspace's sender.
    const senderWs = wsId != null || process.env.VITEST ? wsId : await operatorWorkspaceId();
    let candidates = await resolveSenderCandidates(senderWs);
    // 3. Account mail (invites, password resets) of a workspace with no sender
    //    of its own may use the platform operator's. Content mail may not.
    if (!candidates.length && wsId != null && (payload.kind || "content") === "account") {
      const opWs = await operatorWorkspaceId();
      if (opWs != null && opWs !== wsId) candidates = await resolveSenderCandidates(opWs);
    }
    if (!candidates.length) {
      console.warn(
        "[sendEmail] No system notification sender configured. Email not sent:",
        payload.subject
      );
      await insertEmailDeliveryLog({
        userId: logUserId,
        to: payload.to,
        subject: payload.subject,
        status: "skipped",
        errorMessage: "No sender configured: system mail goes only through the owner's own mail accounts",
      });
      return false;
    }

    const errors: string[] = [];
    for (const cand of candidates) {
      const label = `${cand.provider}:${cand.userId}`;
      try {
        const transport = await buildTransporter(cand.provider, cand.userId);
        if (!transport) {
          errors.push(`${label}: could not build transporter (missing token/account)`);
          continue;
        }
        const fromAddr = (transport.from.match(/<([^>]+)>/) || [])[1];
        await transport.transporter.sendMail({
          from: fromName && fromAddr ? `"${fromName.replace(/["\r\n]/g, "")}" <${fromAddr}>` : transport.from,
          to: payload.to,
          subject: payload.subject,
          html: wrappedHtml,
          text: payload.text ?? rawHtml.replace(/<[^>]+>/g, ""),
          ...(payload.messageId ? { messageId: payload.messageId } : {}),
          ...(payload.replyTo ? { replyTo: payload.replyTo } : {}),
          ...(payload.inReplyTo ? { inReplyTo: payload.inReplyTo } : {}),
          ...(payload.references ? { references: payload.references } : {}),
        });
        await insertEmailDeliveryLog({
          userId: logUserId,
          to: payload.to,
          subject: payload.subject,
          status: "sent",
          // Surface that a fallback was used so the admin can fix the primary.
          errorMessage: errors.length ? `sent via fallback ${label}; earlier: ${errors.join(" | ")}`.slice(0, 900) : null,
        });
        if (errors.length) console.warn(`[sendEmail] Sent via fallback ${label}; earlier failures:`, errors.join(" | "));
        return true;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${label}: ${msg}`);
        console.warn(`[sendEmail] Candidate ${label} failed:`, msg);
      }
    }

    const errorMessage = errors.join(" | ").slice(0, 900) || "All sender candidates failed";
    console.error("[sendEmail] Failed to send email — all candidates failed:", errorMessage);
    await insertEmailDeliveryLog({
      userId: logUserId,
      to: payload.to,
      subject: payload.subject,
      status: "failed",
      errorMessage,
    });
    return false;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[sendEmail] Failed to send email:", err);
    await insertEmailDeliveryLog({
      userId: logUserId,
      to: payload.to,
      subject: payload.subject,
      status: "failed",
      errorMessage,
    });
    return false;
  }
}
