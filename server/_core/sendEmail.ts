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
import { insertEmailDeliveryLog } from "../db";
import { systemSettings, oauthTokens } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { emailTemplate } from "./emailTemplate";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** userId of the sender (for delivery log). Pass null for system-initiated emails. */
  senderUserId?: number | null;
  /**
   * @deprecated Ignored as of the admin-shared sender model. All system mail
   * is sent from the single configured secondary email (the system notification
   * sender). Kept in the type so existing callers compile unchanged.
   */
  recipientUserId?: number | null;
}

/**
 * Resolve the system notification sender from system_settings.
 * Returns { provider, userId } or null if not configured.
 *
 * Supports two storage formats:
 *   - JSON: {"provider":"google","userId":3}
 *   - Colon-separated: "google:3"  (used by oauthSync.setNotificationSender)
 */
async function resolveNotificationSender(): Promise<{
  provider: "google" | "microsoft" | "smtp";
  userId: number;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "notificationSender"));

  const raw = rows[0]?.value;
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
  try {
    const { getAllSmtpAccounts } = await import("../db");
    const accounts = await getAllSmtpAccounts();
    if (accounts.length) {
      // Deterministic when more than one exists: prefer the lowest userId,
      // i.e. the owner / first-configured secondary account.
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
    const transporter = nodemailer.createTransport({
      host: account.smtpHost,
      port: account.smtpPort,
      secure: account.smtpEncryption === "ssl",
      requireTLS: account.smtpEncryption === "tls",
      auth: { user: account.smtpUsername, pass: account.smtpPassword },
      tls: { rejectUnauthorized: false },
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
  if (!token.accessToken || !token.email) return null;

  if (provider === "google") {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: token.email,
        accessToken: token.accessToken,
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
        accessToken: token.accessToken,
      },
    });
    return { transporter, from: `"LevelUp" <${token.email}>` };
  }
}

/**
 * Send an email using the configured system notification sender.
 * Returns true on success, false if no sender is configured or send fails.
 * Every attempt is recorded in email_delivery_log.
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const logUserId = payload.senderUserId ?? null;

  try {
    // Admin-shared model: ALL system mail (Team invites, reports, notifications)
    // goes out from the one configured secondary email — the system notification
    // sender. The per-user `recipientUserId` override was removed so a recipient's
    // own SMTP account can never redirect system mail away from the secondary
    // email. (recipientUserId is still accepted for backward compat but ignored.)
    const sender = await resolveNotificationSender();
    if (!sender) {
      // No sender configured — log as skipped
      console.warn(
        "[sendEmail] No system notification sender configured. Email not sent:",
        payload.subject
      );
      await insertEmailDeliveryLog({
        userId: logUserId,
        to: payload.to,
        subject: payload.subject,
        status: "skipped",
        errorMessage: "No SMTP sender configured",
      });
      return false;
    }

    const transport = await buildTransporter(sender.provider, sender.userId);
    if (!transport) {
      const msg = "Could not build transporter — no OAuth token found for sender.";
      console.warn("[sendEmail]", msg);
      await insertEmailDeliveryLog({
        userId: logUserId,
        to: payload.to,
        subject: payload.subject,
        status: "failed",
        errorMessage: msg,
      });
      return false;
    }

    // Wrap the body in the shared branded template unless it already contains <!DOCTYPE
    const rawHtml = payload.html;
    const wrappedHtml = rawHtml.trimStart().toLowerCase().startsWith("<!doctype")
      ? rawHtml
      : emailTemplate({ subject: payload.subject, body: rawHtml });

    await transport.transporter.sendMail({
      from: transport.from,
      to: payload.to,
      subject: payload.subject,
      html: wrappedHtml,
      text: payload.text ?? rawHtml.replace(/<[^>]+>/g, ""),
    });

    await insertEmailDeliveryLog({
      userId: logUserId,
      to: payload.to,
      subject: payload.subject,
      status: "sent",
    });

    return true;
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
