/**
 * Clean HTML a member asks the server to email to OUTSIDE addresses (the PM
 * status-report email) — -255, audit 2. The system sender would otherwise
 * relay whatever markup and links a member sends, under a display name they
 * choose. This keeps formatting (headings, tables, lists, colours) and drops
 * everything active:
 *   - script, style, iframe, object, embed, form, input, button, link, meta,
 *     base, svg, math elements (with their content where they have any);
 *   - on* attributes, and javascript:/vbscript:/data: URLs anywhere;
 *   - links: <a> becomes its plain text (no clickable links leave LevelUp);
 *   - images other than https:.
 * A footer names the LevelUp account that sent it.
 */
const BLOCK_WITH_CONTENT = /<(script|style|iframe|object|embed|svg|math|template|noscript|textarea|select)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAGS = /<\/?(script|style|iframe|object|embed|form|input|button|link|meta|base|svg|math|template|noscript|textarea|select|option|frame|frameset|applet)\b[^>]*>/gi;

export function cleanEmailHtml(html: string): string {
  let s = String(html || "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(BLOCK_WITH_CONTENT, "");
  s = s.replace(BLOCK_TAGS, "");
  // event handlers (quoted or bare values)
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // dangerous URL schemes in any attribute
  s = s.replace(/\s+(href|src|action|formaction|xlink:href|background|poster)\s*=\s*("\s*(javascript|vbscript|data):[^"]*"|'\s*(javascript|vbscript|data):[^']*'|(javascript|vbscript|data):[^\s>]*)/gi, "");
  // links become their text
  s = s.replace(/<a\b[^>]*>/gi, "").replace(/<\/a\s*>/gi, "");
  // only https images
  s = s.replace(/<img\b[^>]*>/gi, (tag) => (/\ssrc\s*=\s*["']?https:\/\//i.test(tag) ? tag : ""));
  // CSS that can load things or run expressions
  s = s.replace(/(expression\s*\(|url\s*\(\s*['"]?\s*(javascript|vbscript|data):)/gi, "blocked(");
  return s;
}

export function senderFooter(name: string | null | undefined, email: string | null | undefined): string {
  const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
  const who = [name, email ? `<${email}>` : ""].filter(Boolean).join(" ");
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 8px"><p style="font:12px sans-serif;color:#64748b">Sent by ${esc(who || "a LevelUp member")} using LevelUp. Links are not included in reports sent from LevelUp.</p>`;
}
