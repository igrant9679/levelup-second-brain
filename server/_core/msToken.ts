/**
 * The ONE Microsoft refresh-token exchange (audit F72).
 *
 * There used to be three, and they disagreed: refreshOAuthToken.ts used the
 * per-user tenant or /common (ignoring MS_TENANT_ID), oauth-sync.ts honoured
 * MS_TENANT_ID, and onenote.ts always used /common — on a single-tenant app
 * registration /common fails ("not enabled for consumers" /
 * unauthorized_client), so those refreshes failed silently. None had a
 * timeout, so a hung token endpoint hung the request (or a cron tick).
 *
 * Tenant: the caller's tenantId (the user's saved credential), else
 * MS_TENANT_ID, else "common" — the same rule the connect flows use.
 * No scope parameter: Microsoft then returns every originally-consented scope
 * (naming scopes strips extras such as Notes.Read, or errors).
 * The form body keeps "~" literal (Microsoft rejects %7E in some secrets).
 */
export const MS_TOKEN_TIMEOUT_MS = 20_000;

export function msTenant(tenantId?: string | null): string {
  return String(tenantId || "").trim() || String(process.env.MS_TENANT_ID || "").trim() || "common";
}
export function msTokenUrl(tenantId?: string | null): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(msTenant(tenantId))}/oauth2/v2.0/token`;
}
export function formBody(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v).replace(/%7E/gi, "~"))
    .join("&");
}

export interface MsTokenResult { access_token: string; expires_in: number; refresh_token?: string; scope?: string }

/** Exchange a Microsoft refresh token. Never throws; null on any failure (logged without secrets). */
export async function exchangeMsRefreshToken(opts: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  tenantId?: string | null;
  timeoutMs?: number;
}): Promise<MsTokenResult | null> {
  if (!opts.refreshToken || !opts.clientId || !opts.clientSecret) return null;
  try {
    const resp = await fetch(msTokenUrl(opts.tenantId), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formBody({
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        refresh_token: opts.refreshToken,
        grant_type: "refresh_token",
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? MS_TOKEN_TIMEOUT_MS),
    });
    if (!resp.ok) {
      // The error body names the problem (AADSTS code); it never echoes the secret.
      const text = await resp.text().catch(() => "");
      console.warn(`[msToken] refresh failed (${resp.status}) at tenant ${msTenant(opts.tenantId)}:`, text.slice(0, 300));
      return null;
    }
    const data = (await resp.json()) as MsTokenResult;
    if (!data || !data.access_token) return null;
    return data;
  } catch (err) {
    console.warn("[msToken] refresh network error:", String((err as any)?.message || err).slice(0, 200));
    return null;
  }
}
