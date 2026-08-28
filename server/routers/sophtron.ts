/**
 * Sophtron bank-data aggregation for the Money page.
 *
 * Auth (Sophtron "direct" scheme, from sophtron/Sophtron-Integration):
 *   authPath = lowercased path segment from the last '/'
 *   sig      = base64(HMAC-SHA256(base64decode(AccessKey), METHOD + '\n' + authPath))
 *   header   = `FIApiAUTH:{SophtronUserId}:{sig}:{authPath}`
 *
 * Config storage: external_source_credentials with source='sophtron'
 * (accountExternalId = Sophtron UserId, apiToken = AccessKey). The AccessKey
 * NEVER leaves the server after being set. Bank credentials submitted during
 * linkInstitution are passed straight through to Sophtron and never stored
 * or logged here.
 */
import crypto from "crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { externalSourceCredentials } from "../../drizzle/schema";

const SOPHTRON_BASE = "https://api.sophtron.com/api/";

function buildAuth(method: string, path: string, userId: string, accessKey: string): string {
  const authPath = path.substring(path.lastIndexOf("/")).toLowerCase();
  const key = Buffer.from(accessKey, "base64");
  const plain = method.toUpperCase() + "\n" + authPath;
  const sig = crypto.createHmac("sha256", key).update(plain).digest("base64");
  return `FIApiAUTH:${userId}:${sig}:${authPath}`;
}

async function getCred(db: any, userId: number) {
  const [row] = await db.select().from(externalSourceCredentials)
    .where(and(eq(externalSourceCredentials.userId, userId), eq(externalSourceCredentials.source, "sophtron"))).limit(1);
  if (!row || !row.apiToken || !row.accountExternalId) return null;
  return { sophtronUserId: row.accountExternalId as string, accessKey: row.apiToken as string };
}

async function sophPost(cred: { sophtronUserId: string; accessKey: string }, path: string, body: unknown): Promise<any> {
  const resp = await fetch(SOPHTRON_BASE + path, {
    method: "POST",
    headers: {
      Authorization: buildAuth("post", "/" + path, cred.sophtronUserId, cred.accessKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(30000),
  });
  const text = await resp.text();
  if (!resp.ok) throw new Error(`Sophtron ${path} → HTTP ${resp.status}: ${text.slice(0, 200)}`);
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

const needsConfig = { ok: false as const, error: "Sophtron is not configured — add your UserId and AccessKey in Settings → Bank Connections." };

export const sophtronRouter = router({
  /** Config status — the AccessKey is never returned, only whether it is set. */
  getConfig: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, configured: false };
    const cred = await getCred(db, ctx.user.id);
    return { ok: true as const, configured: !!cred, sophtronUserId: cred ? cred.sophtronUserId : null };
  }),

  setConfig: protectedProcedure
    .input(z.object({ sophtronUserId: z.string().min(1).max(128), accessKey: z.string().min(1).max(2048) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: "db unavailable" };
      const existing = await db.select({ id: externalSourceCredentials.id }).from(externalSourceCredentials)
        .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, "sophtron"))).limit(1);
      if (existing.length) {
        await db.update(externalSourceCredentials)
          .set({ apiToken: input.accessKey, accountExternalId: input.sophtronUserId })
          .where(eq(externalSourceCredentials.id, existing[0].id));
      } else {
        await db.insert(externalSourceCredentials).values({
          userId: ctx.user.id, source: "sophtron",
          apiToken: input.accessKey, accountExternalId: input.sophtronUserId,
          accountDisplayName: "Sophtron",
        });
      }
      return { ok: true as const };
    }),

  clearConfig: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, error: "db unavailable" };
    await db.delete(externalSourceCredentials)
      .where(and(eq(externalSourceCredentials.userId, ctx.user.id), eq(externalSourceCredentials.source, "sophtron")));
    return { ok: true as const };
  }),

  /** Truthful connection test: lists the user's linked institutions. */
  test: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, error: "db unavailable" };
    const cred = await getCred(db, ctx.user.id);
    if (!cred) return needsConfig;
    try {
      const res = await sophPost(cred, "UserInstitution/GetUserInstitutionsByUser", { UserID: cred.sophtronUserId });
      const n = Array.isArray(res) ? res.length : 0;
      return { ok: true as const, linkedInstitutions: n };
    } catch (e: any) {
      return { ok: false as const, error: String(e?.message || e).slice(0, 300) };
    }
  }),

  searchInstitutions: protectedProcedure
    .input(z.object({ name: z.string().min(2).max(120) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: "db unavailable" };
      const cred = await getCred(db, ctx.user.id);
      if (!cred) return needsConfig;
      try {
        const res = await sophPost(cred, "Institution/GetInstitutionByName", { InstitutionName: input.name });
        const list = (Array.isArray(res) ? res : (res ? [res] : [])).slice(0, 25).map((i: any) => ({
          id: i.InstitutionID || i.InstitutionId || i.Id,
          name: i.InstitutionName || i.Name || "(unnamed)",
          url: i.URL || i.Url || null,
        })).filter((i: any) => i.id);
        return { ok: true as const, institutions: list };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e).slice(0, 300) };
      }
    }),

  /** Bank credentials pass straight to Sophtron; nothing is stored or logged. */
  linkInstitution: protectedProcedure
    .input(z.object({ institutionId: z.string().min(1), username: z.string().min(1).max(255), password: z.string().min(1).max(255), pin: z.string().max(64).optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: "db unavailable" };
      const cred = await getCred(db, ctx.user.id);
      if (!cred) return needsConfig;
      try {
        const res = await sophPost(cred, "UserInstitution/CreateUserInstitution", {
          UserID: cred.sophtronUserId, InstitutionID: input.institutionId,
          UserName: input.username, Password: input.password, PIN: input.pin || null,
        });
        return { ok: true as const, userInstitutionId: res?.UserInstitutionID || res?.UserInstitutionId || null, jobId: res?.JobID || res?.JobId || null };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e).slice(0, 300) };
      }
    }),

  listMembers: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { ok: false as const, members: [] as any[] };
    const cred = await getCred(db, ctx.user.id);
    if (!cred) return { ok: true as const, configured: false, members: [] as any[] };
    try {
      const res = await sophPost(cred, "UserInstitution/GetUserInstitutionsByUser", { UserID: cred.sophtronUserId });
      const members = (Array.isArray(res) ? res : []).map((m: any) => ({
        userInstitutionId: m.UserInstitutionID || m.UserInstitutionId,
        institutionName: m.InstitutionName || m.institutionName || "(bank)",
        lastSuccess: m.LastSuccess || m.LastRefresh || null,
        isAuthenticated: m.IsAuthenticated !== false,
      })).filter((m: any) => m.userInstitutionId);
      return { ok: true as const, configured: true, members };
    } catch (e: any) {
      return { ok: false as const, members: [] as any[], error: String(e?.message || e).slice(0, 300) };
    }
  }),

  getAccounts: protectedProcedure
    .input(z.object({ userInstitutionId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, accounts: [] as any[] };
      const cred = await getCred(db, ctx.user.id);
      if (!cred) return { ...needsConfig, accounts: [] as any[] };
      try {
        const res = await sophPost(cred, "UserInstitution/GetUserInstitutionAccounts", { UserInstitutionID: input.userInstitutionId });
        const accounts = (Array.isArray(res) ? res : []).map((a: any) => ({
          accountId: a.AccountID || a.AccountId || a.UserInstitutionAccountID,
          name: a.AccountName || a.Name || "(account)",
          number: a.AccountNumber ? String(a.AccountNumber).slice(-4) : null,
          type: a.AccountType || a.Type || null,
          balance: a.Balance != null ? Number(a.Balance) : (a.CurrentBalance != null ? Number(a.CurrentBalance) : null),
        })).filter((a: any) => a.accountId);
        return { ok: true as const, accounts };
      } catch (e: any) {
        return { ok: false as const, accounts: [] as any[], error: String(e?.message || e).slice(0, 300) };
      }
    }),

  jobStatus: protectedProcedure
    .input(z.object({ jobId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: "db unavailable" };
      const cred = await getCred(db, ctx.user.id);
      if (!cred) return needsConfig;
      try {
        const res = await sophPost(cred, "Job/GetJobInformationByID", { JobID: input.jobId });
        return { ok: true as const, job: res || null };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e).slice(0, 300) };
      }
    }),

  /** Answer an MFA challenge raised during linking. */
  jobAnswer: protectedProcedure
    .input(z.object({ jobId: z.string().min(1), kind: z.enum(["security", "token", "tokenChoice", "captcha", "phoneVerify"]), value: z.string().max(512) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: "db unavailable" };
      const cred = await getCred(db, ctx.user.id);
      if (!cred) return needsConfig;
      try {
        if (input.kind === "security") await sophPost(cred, "Job/UpdateJobSecurityAnswer", { JobID: input.jobId, SecurityAnswer: input.value });
        else if (input.kind === "captcha") await sophPost(cred, "Job/UpdateJobCaptcha", { JobID: input.jobId, CaptchaInput: input.value });
        else if (input.kind === "tokenChoice") await sophPost(cred, "Job/UpdateJobTokenInput", { JobID: input.jobId, TokenChoice: input.value, TokenInput: null, VerifyPhoneFlag: null });
        else if (input.kind === "phoneVerify") await sophPost(cred, "Job/UpdateJobTokenInput", { JobID: input.jobId, TokenChoice: null, TokenInput: null, VerifyPhoneFlag: input.value });
        else await sophPost(cred, "Job/UpdateJobTokenInput", { JobID: input.jobId, TokenChoice: null, TokenInput: input.value, VerifyPhoneFlag: null });
        return { ok: true as const };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e).slice(0, 300) };
      }
    }),

  refreshAccount: protectedProcedure
    .input(z.object({ accountId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, error: "db unavailable" };
      const cred = await getCred(db, ctx.user.id);
      if (!cred) return needsConfig;
      try {
        const res = await sophPost(cred, "UserInstitutionAccount/RefreshUserInstitutionAccount", { AccountID: input.accountId });
        return { ok: true as const, jobId: res?.JobID || res?.JobId || null };
      } catch (e: any) {
        return { ok: false as const, error: String(e?.message || e).slice(0, 300) };
      }
    }),

  pullTransactions: protectedProcedure
    .input(z.object({ accountId: z.string().min(1), startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false as const, transactions: [] as any[] };
      const cred = await getCred(db, ctx.user.id);
      if (!cred) return { ...needsConfig, transactions: [] as any[] };
      try {
        const res = await sophPost(cred, "Transaction/GetTransactionsByTransactionDate", {
          AccountID: input.accountId, StartDate: input.startDate, EndDate: input.endDate,
        });
        const txs = (Array.isArray(res) ? res : []).slice(0, 2000).map((t: any) => {
          const rawDate = t.TransactionDate || t.Date || t.PostedDate || "";
          const date = String(rawDate).slice(0, 10);
          return {
            id: String(t.TransactionID || t.TransactionId || t.Id || (date + "|" + (t.Amount ?? "") + "|" + String(t.Description || "").slice(0, 40))),
            date,
            description: String(t.Description || t.Memo || t.Payee || "").slice(0, 300),
            amount: t.Amount != null ? Number(t.Amount) : 0,
            category: t.Category || null,
          };
        }).filter((t: any) => t.date);
        return { ok: true as const, transactions: txs };
      } catch (e: any) {
        return { ok: false as const, transactions: [] as any[], error: String(e?.message || e).slice(0, 300) };
      }
    }),
});
