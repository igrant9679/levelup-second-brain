/**
 * Audit F25: secrets at rest are AES-256-GCM envelopes ("enc:v1:…").
 *  - key from SECRETS_KEY, else derived from JWT_SECRET; decrypt tries both;
 *  - plaintext (rows from before) still reads;
 *  - the schema's secret columns encrypt on write / decrypt on read
 *    transparently (mailbox passwords, OAuth tokens + client secrets, the
 *    SimpleFIN access URL / Nifty / Smartsheet tokens in external_source_credentials);
 *  - the one-time boot pass encrypts existing plaintext, sets its flag, logs
 *    counts only;
 *  - the backup keeps redacting them (and no longer redacts users.tokenVersion).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const settings = new Map<string, string>();
vi.mock("./db", () => ({
  getDb: vi.fn(async () => null),
  getSystemSetting: vi.fn(async (k: string) => settings.get(k)),
  setSystemSetting: vi.fn(async (k: string, v: string) => { settings.set(k, v); }),
}));

import { encryptSecret, decryptSecret, isEncryptedSecret, _resetSecretsForTests, SECRET_PREFIX } from "./_core/secrets";
import { smtpImapAccounts, oauthTokens, externalSourceCredentials, userOauthCredentials } from "../drizzle/schema";
import { encryptExistingSecretsOnce } from "./_core/secretsMigration";
import { redactRow } from "./_core/backup";

beforeEach(() => { vi.stubEnv("JWT_SECRET", "jwt-secret-for-tests"); vi.stubEnv("SECRETS_KEY", ""); _resetSecretsForTests(); settings.clear(); });
afterEach(() => { vi.unstubAllEnvs(); _resetSecretsForTests(); });

describe("envelope", () => {
  it("round-trips, uses a fresh IV, and passes plaintext / empty through", () => {
    const a = encryptSecret("p@ss w0rd ✓"), b = encryptSecret("p@ss w0rd ✓");
    expect(a.startsWith(SECRET_PREFIX)).toBe(true);
    expect(a).not.toBe(b);
    expect(a).not.toContain("w0rd");
    expect(decryptSecret(a)).toBe("p@ss w0rd ✓");
    expect(decryptSecret("legacy-plaintext")).toBe("legacy-plaintext");
    expect(encryptSecret("")).toBe("");
    expect(encryptSecret(a)).toBe(a); // never double-encrypted
  });
  it("SECRETS_KEY wins for new values; values sealed with the JWT_SECRET key stay readable", () => {
    const old = encryptSecret("from-before");
    vi.stubEnv("SECRETS_KEY", "a-dedicated-secrets-key"); _resetSecretsForTests();
    const fresh = encryptSecret("new-one");
    expect(decryptSecret(old)).toBe("from-before");
    expect(decryptSecret(fresh)).toBe("new-one");
    vi.stubEnv("SECRETS_KEY", ""); _resetSecretsForTests();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(decryptSecret(fresh)).toBe(""); // without SECRETS_KEY it can't be opened
    expect(String(spy.mock.calls[0]?.[0] || "")).not.toContain("new-one");
    spy.mockRestore();
  });
  it("the JWT-derived key is domain-separated (not sha256(JWT_SECRET) itself)", async () => {
    const crypto = await import("crypto");
    const v = encryptSecret("x");
    const buf = Buffer.from(v.slice(SECRET_PREFIX.length), "base64");
    const raw = crypto.createHash("sha256").update("jwt-secret-for-tests").digest();
    const d = crypto.createDecipheriv("aes-256-gcm", raw, buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    expect(() => Buffer.concat([d.update(buf.subarray(28)), d.final()])).toThrow();
  });
});

describe("schema columns", () => {
  it("every secret column encrypts on the way in and decrypts on the way out", () => {
    for (const col of [smtpImapAccounts.imapPassword, smtpImapAccounts.smtpPassword, oauthTokens.accessToken, oauthTokens.refreshToken,
      externalSourceCredentials.apiToken, externalSourceCredentials.refreshToken, externalSourceCredentials.clientSecret, userOauthCredentials.clientSecret] as any[]) {
      const stored = col.mapToDriverValue("https://user:pass@bridge.simplefin.org/simplefin");
      expect(isEncryptedSecret(stored)).toBe(true);
      expect(col.mapFromDriverValue(stored)).toBe("https://user:pass@bridge.simplefin.org/simplefin");
      expect(col.mapFromDriverValue("plain-from-before")).toBe("plain-from-before");
      expect(col.getSQLType()).toBe("text");
    }
  });
});

describe("one-time boot pass", () => {
  it("encrypts plaintext rows and AI keys, skips encrypted ones, sets the flag, logs no values", async () => {
    const state: Record<string, any[]> = {
      oauth_tokens: [{ id: 1, accessToken: "AT-plain", refreshToken: null }],
      user_oauth_credentials: [{ id: 1, clientSecret: encryptSecret("already") }],
      smtp_imap_accounts: [{ id: 3, imapPassword: "imap-pw", smtpPassword: "smtp-pw" }],
      external_source_credentials: [{ id: 4, apiToken: "https://u:p@bridge/simplefin", clientSecret: "", refreshToken: "rt" }],
    };
    const ai: Array<{ key: string; value: string }> = [{ key: "aiKey_claude", value: "sk-ant-xyz" }];
    const updates: string[] = [];
    const text = (q: any) => (q.queryChunks || []).map((c: any) => (Array.isArray(c?.value) ? c.value.join("") : c && typeof c === "object" && "value" in c ? "?" : (c?.queryChunks ? text(c) : "?"))).join("");
    const params = (q: any): any[] => (q.queryChunks || []).flatMap((c: any) => (Array.isArray(c?.value) ? [] : c?.queryChunks ? params(c) : c && typeof c === "object" && "value" in c ? [c.value] : [c]));
    const db = {
      async execute(q: any) {
        const t = text(q);
        const m = t.match(/FROM `(\w+)`/);
        if (/^SELECT/.test(t) && m) return [state[m[1]].map((r) => ({ ...r }))];
        if (/^SELECT `key`/.test(t)) return [ai.map((r) => ({ ...r }))];
        if (/^UPDATE/.test(t)) {
          const ps = params(q);
          updates.push(t.replace(/\s+/g, " "));
          const tm = t.match(/UPDATE `?(\w+)`? SET `(\w+)`/);
          if (tm && state[tm[1]]) { const row = state[tm[1]].find((r) => r.id === ps[ps.length - 1]); row[tm[2]] = ps[0]; }
          if (/system_settings/.test(t)) ai[0].value = ps[0];
          return [{}];
        }
        return [[]];
      },
    };
    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...a: any[]) => { logs.push(a.join(" ")); });
    const r = await encryptExistingSecretsOnce(db);
    spy.mockRestore();
    expect(r).toMatchObject({ ran: true, encrypted: 6, failed: 0 });
    expect(decryptSecret(state.oauth_tokens[0].accessToken)).toBe("AT-plain");
    expect(state.oauth_tokens[0].refreshToken).toBeNull();
    expect(decryptSecret(state.smtp_imap_accounts[0].smtpPassword)).toBe("smtp-pw");
    expect(decryptSecret(state.external_source_credentials[0].apiToken)).toBe("https://u:p@bridge/simplefin");
    expect(state.external_source_credentials[0].clientSecret).toBe("");
    expect(decryptSecret(ai[0].value)).toBe("sk-ant-xyz");
    expect(updates.length).toBe(6); // the already-encrypted client secret was left alone
    expect(settings.has("secretsEncryptedV1")).toBe(true);
    expect(logs.join("\n")).not.toMatch(/AT-plain|imap-pw|smtp-pw|sk-ant|u:p@/);
    expect(await encryptExistingSecretsOnce(db)).toMatchObject({ ran: false, reason: "already done" });
  });
});

describe("backups", () => {
  it("keep redacting secrets (encrypted or not) but not users.tokenVersion", () => {
    const row = redactRow("smtp_imap_accounts", { id: 1, imapPassword: encryptSecret("x"), smtpHost: "smtp.x.com" });
    expect(row.imapPassword).toBe("[redacted]");
    expect(row.smtpHost).toBe("smtp.x.com");
    expect(redactRow("users", { id: 1, tokenVersion: 3, passwordHash: "h" })).toEqual({ id: 1, tokenVersion: 3, passwordHash: "[redacted]" });
    expect(redactRow("system_settings", { key: "aiKey_openai", value: encryptSecret("sk") }).value).toBe("[redacted]");
  });
});
