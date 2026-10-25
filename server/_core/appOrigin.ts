/**
 * The app's public origin for links the server puts in emails (password
 * reset, invites). Never take this from the request or the client: a
 * caller-supplied origin lets a reset/invite email point somewhere else.
 * Override with APP_ORIGIN for a staging deploy.
 */
export function appOrigin(): string {
  const v = (process.env.APP_ORIGIN || "https://levelupnow.tools").trim().replace(/\/+$/, "");
  return /^https?:\/\/[^/\s]+$/i.test(v) ? v : "https://levelupnow.tools";
}
