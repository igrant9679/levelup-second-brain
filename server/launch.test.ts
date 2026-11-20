/**
 * Build -289: the launch checklist (no database — every lookup falls back to "not set").
 * The real-database run, with Stripe prices and ticks, is in billing.flow.test.ts.
 */
import { describe, it, expect, afterEach } from "vitest";

const KEYS = ["MAIL_PROVIDER", "MAIL_SMTP_HOST", "MAIL_SMTP_USER", "MAIL_SMTP_PASS", "MAIL_FROM", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "SECRETS_KEY", "BACKUP_KEY", "JWT_SECRET", "ALLOW_SIGNUP", "MS_TENANT_ID", "DATABASE_URL"];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });
const clear = () => { for (const k of KEYS) delete process.env[k]; };

describe("launch checklist", () => {
  it("nothing set: not ready, each missing step says how to fix it", async () => {
    clear();
    const { launchChecklist } = await import("./_core/launchReadiness");
    const r = await launchChecklist();
    expect(r.ready).toBe(false);
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
    for (const id of ["mail", "stripeKey", "webhookSecret", "prices"]) {
      expect(byId[id]).toMatchObject({ required: true, status: "todo" });
      expect(byId[id].fix).toBeTruthy();
    }
    expect(byId.secretsKey.status).toBe("todo");
    expect(byId.backupKey.status).toBe("todo");
    expect(byId.jwt.status).toBe("warn");
    for (const id of ["healthcheck", "googleConsent", "azureMultiTenant", "testRun"]) expect(byId[id]).toMatchObject({ status: "manual", doneAt: null });
    expect(byId.allowSignupEnv).toBeUndefined();
    expect(r.required).toEqual({ done: 0, total: 4 });
  });

  it("set up: the server-checkable steps pass, and no value of any secret appears in the answer", async () => {
    clear();
    Object.assign(process.env, {
      MAIL_PROVIDER: "smtp", MAIL_SMTP_HOST: "smtp.example.com", MAIL_SMTP_USER: "mail@example.com", MAIL_SMTP_PASS: "smtp-pass-SECRET-123",
      STRIPE_SECRET_KEY: "sk_test_SECRETSTRIPE123456", STRIPE_WEBHOOK_SECRET: "whsec_SECRETHOOK",
      SECRETS_KEY: "s".repeat(40) + "SECRETSKEY", BACKUP_KEY: "b".repeat(40) + "BACKUPKEY", JWT_SECRET: "j".repeat(40) + "JWTSECRET",
      ALLOW_SIGNUP: "true", MS_TENANT_ID: "12345678-1234-1234-1234-1234567890ab",
    });
    const { launchChecklist } = await import("./_core/launchReadiness");
    const r = await launchChecklist();
    const byId = Object.fromEntries(r.items.map((i) => [i.id, i]));
    expect(byId.mail).toMatchObject({ status: "ok" });
    expect(byId.mail.detail).toContain("mail@example.com");      // the sending address is not a secret
    expect(byId.stripeKey).toMatchObject({ status: "ok" });
    expect(byId.stripeKey.detail).toContain("TEST");
    expect(byId.webhookSecret.status).toBe("ok");
    expect(byId.stripeMode.status).toBe("warn");
    expect(byId.prices.status).toBe("todo");                      // no plan has a price id
    expect(byId.secretsKey.status).toBe("ok");
    expect(byId.backupKey.status).toBe("ok");
    expect(byId.jwt.status).toBe("ok");
    expect(byId.allowSignupEnv.status).toBe("info");
    expect(byId.msTenant.status).toBe("warn");
    expect(r.ready).toBe(false);
    expect(r.required).toEqual({ done: 3, total: 4 });
    const flat = JSON.stringify(r);
    for (const s of ["smtp-pass-SECRET-123", "SECRETSTRIPE", "SECRETHOOK", "SECRETSKEY", "BACKUPKEY", "JWTSECRET"]) expect(flat).not.toContain(s);
  });

  it("only the steps LevelUp can't check can be ticked", async () => {
    const { setManualTick } = await import("./_core/launchReadiness");
    await expect(setManualTick("prices", true)).rejects.toThrow(/Unknown/);
    await expect(setManualTick("__proto__", true)).rejects.toThrow(/Unknown/);
  });
});
