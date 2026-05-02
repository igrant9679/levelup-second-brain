/**
 * Shared branded HTML email template for LevelUp.
 *
 * Usage:
 *   import { emailTemplate } from "./_core/emailTemplate";
 *   const html = emailTemplate({ subject: "Your subject", body: "<p>...</p>" });
 *
 * The template wraps any HTML body in a consistent branded layout:
 *   - Logo / app name header in brand purple
 *   - Content area with white card on light grey background
 *   - Footer with app name, tagline, and "manage notifications" note
 */

export interface EmailTemplateOptions {
  /** Email subject — shown as the pre-header text below the subject line */
  subject: string;
  /** Inner HTML body content (paragraphs, headings, buttons, etc.) */
  body: string;
  /** Optional call-to-action button */
  cta?: {
    label: string;
    url: string;
  };
}

export function emailTemplate({ subject, body, cta }: EmailTemplateOptions): string {
  const appName = process.env.VITE_APP_TITLE ?? "LevelUp";
  const appUrl = process.env.VITE_OAUTH_PORTAL_URL ?? "#";
  const logoUrl = process.env.VITE_APP_LOGO ?? "";

  const ctaBlock = cta
    ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0">
        <tr>
          <td>
            <a href="${cta.url}"
               style="display:inline-block;background:#7c3aed;color:#ffffff;font-weight:600;
                      font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;
                      font-family:sans-serif">
              ${cta.label}
            </a>
          </td>
        </tr>
      </table>`
    : "";

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="${appName}" style="height:36px;width:auto;margin-bottom:8px" /><br>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
  <!-- Pre-header (hidden preview text) -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all">
    ${subject} — ${appName}
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:40px 16px">
    <tr>
      <td align="center">

        <!-- Header -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
          <tr>
            <td align="center" style="padding-bottom:24px">
              ${logoBlock}
              <a href="${appUrl}" style="text-decoration:none">
                <span style="font-size:22px;font-weight:700;color:#7c3aed;letter-spacing:-0.5px">${appName}</span>
              </a>
              <p style="margin:4px 0 0;font-size:12px;color:#9ca3af">The Second Brain Hub</p>
            </td>
          </tr>
        </table>

        <!-- Card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
               style="max-width:600px;background:#ffffff;border-radius:12px;
                      box-shadow:0 1px 3px rgba(0,0,0,0.08);overflow:hidden">
          <tr>
            <!-- Top accent bar -->
            <td style="height:4px;background:linear-gradient(90deg,#7c3aed,#a855f7)"></td>
          </tr>
          <tr>
            <td style="padding:32px 40px;color:#1f2937;font-size:15px;line-height:1.6">
              ${body}
              ${ctaBlock}
            </td>
          </tr>
        </table>

        <!-- Footer -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px">
          <tr>
            <td align="center" style="padding:24px 0 8px;font-size:12px;color:#9ca3af;line-height:1.6">
              <p style="margin:0">
                You received this email because you have an account on
                <a href="${appUrl}" style="color:#7c3aed;text-decoration:none">${appName}</a>.
              </p>
              <p style="margin:4px 0 0">
                To manage your notification preferences, visit
                <a href="${appUrl}/settings" style="color:#7c3aed;text-decoration:none">Settings → Notifications</a>.
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>`;
}
