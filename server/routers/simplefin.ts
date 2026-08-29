/**
 * SimpleFIN Bridge bank-data aggregation for the Money page.
 *
 * Protocol (https://www.simplefin.org/protocol.html):
 *   1. The user creates an account at bridge.simplefin.org, connects their
 *      banks THERE (the bridge handles credentials + MFA — none of that ever
 *      touches LevelUp), and generates a one-time SETUP TOKEN.
 *   2. The setup token is base64 of a claim URL. POSTing to the claim URL
 *      (once) returns the permanent ACCESS URL, which carries HTTP Basic
 *      credentials in its userinfo: https://user:pass@host/simplefin
 *   3. All data comes from GET {accessUrl}/accounts with optional
 *      start-date / end-date (unix seconds), account=<id>, balances-only=1.
 *
 * Config storage: external_source_credentials with source='simplefin'
 * (apiToken = the access URL). The access URL is a bearer secret — it is
 * NEVER returned to the client after setup; only the bridge host is shown.
 *
 * NB: Node's fetch (undici) REJECTS URLs with embedded credentials, so the
 * userinfo is stripped and sent as an Authorization: Basic header instead.
 */
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { externalSourceCredentials } from "../../drizzle/schema";

function parseAccessUrl(accessUrl: string): { base: string; auth: string; host: string } {
  const u = new URL(accessUrl);
  const user = decodeURIComponent(u.username || "");
  const pass = decodeURIComponent(u.password || "");
  const host = u.host;
  u.username = "";
  u.password = "";
  const base = u.toString().replace(/\/+$/, "");
  return { base, auth: "Basic " + Buffer.from(user + ":" + pass).toString("base64"), host };
}

async function getAccess(db: any, userId: number): Promise<string | null> {
  const [row] = await db.select().from(externalSourceCredentials)
    .where(and(eq(externalSourceCredentials.userId, userId), eq(externalSourceCredentials.source, "simplefin"))).limit(1);
  return row && row.apiToken ? (row.apiToken as string) : null;
}

/** GET {accessUrl}/accounts with the given query params. */
async function sfGet(accessUrl: string, params: Record<string, string>): Promise<any> {
  const { base, auth } = parseAccessUrl(accessUrl);
  const qs = new URLSearchParams(params).toString();
  const url = base + "/accounts" + (qs ? "?" + qs : "");
  const resp = await fetch(url, {
    method: "GET",
    headers: { Authorization: auth, Accept: "application/json" },
    signal: AbortSignal.timeout(45000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`SimpleFIN /accounts → HTTP ${resp.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text); } catch { throw new Error("SimpleFIN returned non-JSON: " + text.slice(0, 120)); }
}

/** Unix seconds (or ms — be tolerant) → 'YYYY-MM-DD', else null. */
function tsToDate(v: any): string | null {
  const n = Number(v);
  if (!n || !isFinite(n)) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** SimpleFIN amounts/balances are decimal STRINGS per spec; tolerate numbers. */
function toNum(v: any): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}

function normAccount(a: any) {
  return {
    id: String(a.id ?? ""),
    name: String(a.name || "(account)").slice(0, 200),
    org: String((a.org && (a.org.name || a.org.domain)) || "").slice(0, 200),
    currency: typeof a.currency === "string" ? a.currency.slice(0, 8) : "USD",
    balance: toNum(a.balance),
    availableBalance: toNum(a["available-balance"]),
    balanceDate: tsToDate(a["balance-date"]),
  };
}

const needsConfig = { ok: false as const, error: "SimpleFIN is not connected — paste a setup token in Settings → Bank Connections." };

export const simplefinRouter = router({
  /** Config status — the access URL is never returned, only the bridge host. */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, configured: false };
    const accessUrl = await getAccess(db, ctx.user.id);
    let host: string | null = null;
    if (accessUrl) { try { host = parseAccessUrl(accessUrl).host; } catch { host = null; } }
    return { ok: true as const, configured: !!accessUrl, host };
  }),

  /**
   * Claim a one-time setup token from SimpleFIN Bridge and store the
   * resulting access URL. The token is base64 of a claim URL.
   */
  setup: protectedProcedure
    .input(z.object({ setupToken: z.string().min(8).max(4096) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: "db unavailable" };
      let claimUrl = "";
      try {
        claimUrl = Buffer.from(input.setupToken.trim(), "base64").toString("utf8").trim();
      } catch { /* fall through to the validation below */ }
      if (!/^https:\/\//i.test(claimUrl)) {
        return { ok: false as const, error: "That doesn't look like a SimpleFIN setup token (it should be a long base64 string that decodes to an https claim URL)." };
      }
      let accessUrl = "";
      try {
        const resp = await fetch(claimUrl, {
          method: "POST",
          headers: { "Content-Length": "0" },
          body: "",
          signal: AbortSignal.timeout(30000),
        });
        const text = (await resp.text()).trim();
        if (!resp.ok) {
          return { ok: false as const, error: `Claim failed — HTTP ${resp.status}: ${text.slice(0, 200)}. Setup tokens are ONE-TIME; if this one was already used, generate a new one at the bridge.` };
        }
        accessUrl = text;
      } catch (e: any) {
        return { ok: false as const, error: "Claim request failed: " + String(e?.message || e).slice(0, 200) };
      }
      let host = "";
      try {
        const parsed = parseAccessUrl(accessUrl);
        host = parsed.host;
        if (!/^https:\/\//i.test(accessUrl) || !new URL(accessUrl).username) throw new Error("no credentials in URL");
      } catch {
        return { ok: false as const, error: "The bridge returned something that isn't a usable access URL: " + accessUrl.slice(0, 120) };
      }
      const existing = await db.select({ id: externalSourceCredentials.id }).from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, "simplefin"))).limit(1);
      if (existing.length) {
        await db.update(externalSourceCredentials)
          .set({ apiToken: accessUrl, accountDisplayName: "SimpleFIN Bridge", accountExternalId: host.slice(0, 128) })
          .where(eq(externalSourceCredentials.id, existing[0].id));
      } else {
        await db.insert(externalSourceCredentials).values({
          userId: ctx.user.id, source: "simplefin",
          apiToken: accessUrl, accountDisplayName: "SimpleFIN Bridge", accountExternalId: host.slice(0, 128),
        });
      }
      return { ok: true as const, host };
    }),

  clearConfig: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, error: "db unavailable" };
    await db.delete(externalSourceCredentials)
      .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, "simplefin")));
    return { ok: true as const };
  }),

  /** Truthful connection test: balances-only /accounts call. */
  test: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, error: "db unavailable" };
    const accessUrl = await getAccess(db, ctx.user.id);
    if (!accessUrl) return needsConfig;
    try {
      const res = await sfGet(accessUrl, { "balances-only": "1" });
      const accounts = Array.isArray(res?.accounts) ? res.accounts : [];
      const orgs = Array.from(new Set<string>(accounts.map((a: any) => String((a.org && (a.org.name || a.org.domain)) || "")).filter(Boolean)));
      return {
        ok: true as const,
        accountCount: accounts.length,
        orgs: orgs.slice(0, 20),
        errors: (Array.isArray(res?.errors) ? res.errors : []).map((e: any) => String(e).slice(0, 200)),
      };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message || e).slice(0, 300) };
    }
  }),

  /** All accounts with current balances (no transactions). */
  listAccounts: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, configured: false, accounts: [] as any[] };
    const accessUrl = await getAccess(db, ctx.user.id);
    if (!accessUrl) return { ok: true as const, configured: false, accounts: [] as any[] };
    try {
      const res = await sfGet(accessUrl, { "balances-only": "1" });
      const accounts = (Array.isArray(res?.accounts) ? res.accounts : []).map(normAccount).filter((a: any) => a.id);
      return {
        ok: true as const, configured: true, accounts,
        errors: (Array.isArray(res?.errors) ? res.errors : []).map((e: any) => String(e).slice(0, 200)),
      };
    } catch (e: any) {
      return { ok: false as const, configured: true, accounts: [] as any[], error: String(e?.message || e).slice(0, 300) };
    }
  }),

  /**
   * Transactions for one account in a date range. Pending transactions are
   * deliberately NOT requested — their ids can change when they post, which
   * would defeat the client's dedupe-by-id. Also returns the account's
   * current balance so the client can update it in the same pass.
   */
  pullTransactions: protectedProcedure
    .input(z.object({
      accountId: z.string().min(1).max(256),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, transactions: [] as any[] };
      const accessUrl = await getAccess(db, ctx.user.id);
      if (!accessUrl) return { ...needsConfig, transactions: [] as any[] };
      try {
        const start = Math.floor(Date.parse(input.startDate + "T00:00:00Z") / 1000);
        // end-date is exclusive in the spec — add a day so endDate is included.
        const end = Math.floor(Date.parse(input.endDate + "T00:00:00Z") / 1000) + 86400;
        const res = await sfGet(accessUrl, { account: input.accountId, "start-date": String(start), "end-date": String(end) });
        const acct = (Array.isArray(res?.accounts) ? res.accounts : []).find((a: any) => String(a.id) === input.accountId)
          || (Array.isArray(res?.accounts) ? res.accounts[0] : null);
        const txs = (Array.isArray(acct?.transactions) ? acct.transactions : []).slice(0, 4000).map((t: any) => {
          const date = tsToDate(t.posted) || tsToDate(t.transacted_at);
          return {
            id: String(t.id ?? ""),
            date,
            description: String(t.description || t.payee || t.memo || "").slice(0, 300),
            payee: t.payee ? String(t.payee).slice(0, 200) : null,
            memo: t.memo ? String(t.memo).slice(0, 300) : null,
            amount: toNum(t.amount) ?? 0,
          };
        }).filter((t: any) => t.id && t.date);
        return {
          ok: true as const,
          transactions: txs,
          balance: acct ? toNum(acct.balance) : null,
          balanceDate: acct ? tsToDate(acct["balance-date"]) : null,
          errors: (Array.isArray(res?.errors) ? res.errors : []).map((e: any) => String(e).slice(0, 200)),
        };
      } catch (e: any) {
        return { ok: false as const, transactions: [] as any[], error: String(e?.message || e).slice(0, 300) };
      }
    }),
});
