/**
 * sendEmail — Nodemailer-based email transport that uses the connected
 * Google or Microsoft OAuth2 account selected as the system notification sender.
 *
 * Falls back to a plain-text log when no sender is configured (dev mode).
 */
import nodemailer from "nodemailer";
import { getDb } from "../db";
import { systemSettings, oauthTokens } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
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
  provider: "google" | "microsoft";
  userId: number;
} | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "notificationSender"));
  if (!rows.length || !rows[0].value) return null;

  const raw = rows[0].value;

  // Try JSON format first: {"provider":"google","userId":3}
  try {
    const parsed = JSON.parse(raw) as {
      provider: "google" | "microsoft";
      userId: number;
    };
    if (parsed.provider && parsed.userId) return parsed;
  } catch {
    // Not JSON — fall through to colon-separated format
  }

  // Try colon-separated format: "provider:userId"
  const parts = raw.split(":");
  if (parts.length === 2) {
    const provider = parts[0] as "google" | "microsoft";
    const userId = parseInt(parts[1], 10);
    if ((provider === "google" || provider === "microsoft") && !isNaN(userId)) {
      return { provider, userId };
    }
  }

  return null;
}

/**
 * Build a Nodemailer transporter using the stored OAuth2 access token.
 * For Google: SMTP via smtp.gmail.com with OAuth2.
 * For Microsoft: SMTP via smtp.office365.com with OAuth2.
 */
async function buildTransporter(
  provider: "google" | "microsoft",
  userId: number
): Promise<{ transporter: nodemailer.Transporter; from: string } | null> {
  const db = await getDb();
  if (!db) return null;
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
 */
export async function sendEmail(payload: EmailPayload): Promise<boolean> {
  try {
    const sender = await resolveNotificationSender();
    if (!sender) {
      // No sender configured — log in dev, silently skip in prod
      console.warn(
        "[sendEmail] No system notification sender configured. Email not sent:",
        payload.subject
      );
      return false;
    }

    const transport = await buildTransporter(sender.provider, sender.userId);
    if (!transport) {
      console.warn(
        "[sendEmail] Could not build transporter — no OAuth token found for sender."
      );
      return false;
    }

    await transport.transporter.sendMail({
      from: transport.from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]+>/g, ""),
    });

    return true;
  } catch (err) {
    console.error("[sendEmail] Failed to send email:", err);
    return false;
  }
}
