/**
 * Audit 3 (build -288): the pieces that need no database. The real-MySQL parts
 * (one free trial per person, locked workspaces skipped by background jobs,
 * one Checkout page at a time, the portal settings, hashed invitation links)
 * are in billing.flow.test.ts and tenancy.isolation.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const spent: any[] = [];
let resolved: { provider: string; apiKey?: string; configured: boolean; source: "workspace" | "platform" | "none" } = { provider: "claude", apiKey: "k", configured: true, source: "platform" };
vi.mock("./_core/quota", () => ({
  spendQuota: vi.fn(async (u: any, b: string) => { spent.push([u?.id ?? null, b]); }),
  trySpendQuota: vi.fn(async (id: number, b: string) => { spent.push([id, b]); return true; }),
}));

import { isPublicIp, assertPublicUrl } from "./_core/netGuard";
import { emailTemplate } from "./_core/emailTemplate";
import { cleanName } from "./_core/platformMail";
import { cleanEmailHtml } from "./_core/emailHtml";
import { inviteTokenStored } from "./db";
import { entitlementOf, trialEmailKey } from "./_core/billing";

beforeEach(() => { spent.length = 0; });

describe("network guard: an IPv6 spelling of a private IPv4 address is private (O4)", () => {
  it("mapped, compatible, NAT64, 6to4 and Teredo forms", () => {
    const priv = ["::ffff:7f00:1", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "::ffff:169.254.169.254", "::7f00:1", "::127.0.0.1",
      "64:ff9b::a9fe:a9fe", "64:ff9b::127.0.0.1", "2002:7f00:1::", "2002:a9fe:a9fe::1", "2001::1", "::", "::1", "fe80::1", "fd12::1", "ff02::1", "2001:db8::1", "100::1"];
    for (const ip of priv) expect([ip, isPublicIp(ip)]).toEqual([ip, false]);
    for (const ip of ["2606:4700:4700::1111", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1", "8.8.8.8"]) expect([ip, isPublicIp(ip)]).toEqual([ip, true]);
  });
  it("a URL the parser rewrites is still refused", async () => {
    expect(new URL("https://[::ffff:169.254.169.254]/").hostname).toBe("[::ffff:a9fe:a9fe]");
    for (const u of ["https://[::ffff:169.254.169.254]/", "http://[::ffff:127.0.0.1]:8080/", "http://[64:ff9b::7f00:1]/"]) await expect(assertPublicUrl(u)).rejects.toThrow();
  });
});

describe("email: another customer's text can't become markup or a sender (O3)", () => {
  it("the subject is escaped in the template's title and preview line", () => {
    const html = emailTemplate({ subject: 'Acme</div><a href="https://evil.test">Verify</a><div style="display:none">', body: "<p>hi</p>" });
    expect(html).not.toContain('<a href="https://evil.test">');
    expect(html).toContain("Acme&lt;/div&gt;&lt;a href=&quot;https://evil.test&quot;&gt;");
  });
  it("display names lose addresses, links and @", () => {
    expect(cleanName("support@bank.com via LevelUp")).toBe("via LevelUp");
    expect(cleanName("PayPal https://evil.test/x Support")).toBe("PayPal Support");
    expect(cleanName('Bad"\r\nBcc: x')).toBe("BadBcc: x");
    expect(cleanName("")).toBe("LevelUp");
  });
  it("report emails: image maps and stray href / usemap are removed", () => {
    const out = cleanEmailHtml('<img src="https://cdn.test/a.png" usemap="#m"><map name="m"><area shape="rect" coords="0,0,9,9" href="https://evil.test"></map><p data-x="1" href="https://evil.test">t</p>');
    expect(out).not.toMatch(/<area|<map|usemap|href=/i);
    expect(out).toContain('src="https://cdn.test/a.png"');
  });
});

describe("invitation links are stored hashed (A11)", () => {
  it("h1: + SHA-256, and the stored value is not the token", () => {
    const t = "a".repeat(64);
    const stored = inviteTokenStored(t);
    expect(stored).toMatch(/^h1:[a-f0-9]{64}$/);
    expect(stored).not.toContain(t);
    expect(inviteTokenStored(t)).toBe(stored);
    expect(stored.length).toBeLessThanOrEqual(80);
  });
});

describe("trials (B2)", () => {
  it("one key per person: case, +tag and Gmail dots don't make a new one", () => {
    const k = trialEmailKey("Sam.Smith+trial2@GMAIL.com");
    expect(k).toBe(trialEmailKey("samsmith@gmail.com"));
    expect(k).toBe(trialEmailKey("sam.smith@googlemail.com"));
    expect(trialEmailKey("sam.smith@work.test")).not.toBe(trialEmailKey("samsmith@work.test")); // dots matter outside Gmail
    expect(trialEmailKey("not-an-address")).toBeNull();
  });
  it("a free trial gets the small allowances; a paid subscription the plan's", () => {
    const plan: any = { key: "team", name: "Team", members: 25, ai: 3000, email: 500, storageMb: 20480 };
    const row: any = { workspaceId: 9, plan: "team", status: "trialing", trialEndsAt: new Date(Date.now() + 5 * 86400e3), stripeCustomerId: null, stripeSubscriptionId: null, stripeItemId: null, interval: null, seats: 0, currentPeriodEnd: null, cancelAtPeriodEnd: false, pastDueSince: null, notified: {} };
    const free = entitlementOf(row, plan, 7, Date.now(), { ai: 200, email: 50 });
    expect(free.limits).toMatchObject({ ai: 200, email: 50, members: 25 });
    const paid = entitlementOf({ ...row, status: "active", stripeSubscriptionId: "sub_1" }, plan, 7, Date.now(), { ai: 200, email: 50 });
    expect(paid.limits).toMatchObject({ ai: 3000, email: 500 });
    // a Stripe trial (card on file) is a subscription: the plan's limits
    expect(entitlementOf({ ...row, stripeSubscriptionId: "sub_2" }, plan, 7, Date.now(), { ai: 200, email: 50 }).limits!.ai).toBe(3000);
  });
});

describe("the AI allowance is charged by the key actually used (O1, O2)", () => {
  beforeEach(() => { vi.resetModules(); });
  async function load() {
    vi.doMock("./_core/aiProviders", () => ({ callAIProvider: vi.fn(async () => ({ text: "ok" })) }));
    const mod = await import("./_core/workspaceAI");
    vi.spyOn(mod, "resolveWorkspaceAI");
    return mod;
  }
  it("a blank or space-only apiKey no longer skips the charge on the platform key", async () => {
    vi.doMock("./db", () => ({ getSystemSetting: vi.fn(async (k: string) => (k === "aiProvider" ? "claude" : k === "aiKey_claude" ? "platform-key" : undefined)) }));
    const { resolveRequestAI } = await load();
    await resolveRequestAI({ apiKey: " " } as any, { id: 7 });
    await resolveRequestAI({} as any, { id: 7 });
    // legacy test mode: the key comes from the global settings = "workspace" source → not charged;
    // a typed key is always charged (it can fall back to the built-in model)
    await resolveRequestAI({ apiKey: "sk-typed", provider: "openai" } as any, { id: 7 });
    expect(spent).toEqual([[7, "ai"]]);
  });
  it("no key anywhere (the built-in model) is charged", async () => {
    vi.doMock("./db", () => ({ getSystemSetting: vi.fn(async () => undefined) }));
    const { resolveRequestAI } = await load();
    await resolveRequestAI({ apiKey: "  " } as any, { id: 8 });
    expect(spent).toEqual([[8, "ai"]]);
  });
});
