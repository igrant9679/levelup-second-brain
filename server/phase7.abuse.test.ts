/**
 * Audit 2, Phase 0 (build -255) — abuse limits: public-address-only outbound
 * fetches, sign-in / reset throttling, the AI quota on the bookmark and
 * follow-up helpers, and cleaned HTML in report emails sent outside.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = { lookups: 0, spent: [] as any[] };
vi.mock("./db", () => ({
  getUserByEmail: vi.fn(async () => { state.lookups++; return null; }),
  getDb: vi.fn(async () => null),
}));
vi.mock("./_core/quota", () => ({ spendQuota: vi.fn(async (u: any, b: string) => { state.spent.push([u.id, b]); }), trySpendQuota: vi.fn(async () => true) }));
vi.mock("./_core/aiProviders", () => ({ callAIProvider: vi.fn(async () => ({ text: '{"tags":["a"]}' })) }));
vi.mock("./_core/workspaceAI", () => ({ resolveRequestAI: vi.fn(async () => ({ provider: "claude", apiKey: "k" })) }));

import { isPublicIp, assertPublicUrl, safeFetch } from "./_core/netGuard";
import { hit, blocked, _resetRateLimits } from "./_core/rateLimit";
import { cleanEmailHtml } from "./_core/emailHtml";
import { emailAuthRouter } from "./routers/emailAuth";
import { bookmarksRouter } from "./routers/bookmarks";

beforeEach(() => { _resetRateLimits(); state.lookups = 0; state.spent = []; });

describe("outbound addresses", () => {
  it("classifies addresses", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.20.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])
      expect([ip, isPublicIp(ip)]).toEqual([ip, false]);
    for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"]) expect([ip, isPublicIp(ip)]).toEqual([ip, true]);
  });
  it("refuses private, local and non-web addresses", async () => {
    for (const u of ["http://127.0.0.1/", "http://169.254.169.254/latest/meta-data/", "https://10.0.0.5/x", "http://[::1]:8080/", "http://localhost:3000/", "http://foo.internal/", "file:///etc/passwd", "ftp://8.8.8.8/"])
      await expect(assertPublicUrl(u)).rejects.toThrow();
    await expect(assertPublicUrl("https://8.8.8.8/")).resolves.toBeTruthy();
  });
  describe("redirects", () => {
    const realFetch = globalThis.fetch;
    afterEach(() => { globalThis.fetch = realFetch; });
    it("are followed only to public addresses", async () => {
      const calls: string[] = [];
      globalThis.fetch = vi.fn(async (url: any) => {
        calls.push(String(url));
        return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } });
      }) as any;
      await expect(safeFetch("https://8.8.8.8/start")).rejects.toThrow(/public internet/);
      expect(calls).toEqual(["https://8.8.8.8/start"]); // the private hop was never requested
    });
  });
});

describe("rate limiter", () => {
  it("allows the limit, then refuses inside the window", () => {
    for (let i = 0; i < 3; i++) expect(hit("k", 3, 1000, 1000 + i)).toBe(true);
    expect(hit("k", 3, 1000, 1500)).toBe(false);
    expect(blocked("k", 3, 1000, 1500)).toBe(true);
    expect(blocked("k", 3, 1000, 2600)).toBe(false); // window passed
  });
});

describe("sign-in and reset", () => {
  const caller = (ip: string) => emailAuthRouter.createCaller({ user: null, req: { ip, headers: {}, protocol: "https" }, res: { cookie: vi.fn() } } as any);
  it("stops password guessing after 8 failures for one address", async () => {
    const c = caller("203.0.113.9");
    for (let i = 0; i < 8; i++) await expect(c.login({ email: "max@x.com", password: "guess" + i })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(c.login({ email: "max@x.com", password: "again" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    // another address from another IP is unaffected
    await expect(caller("198.51.100.7").login({ email: "ada@x.com", password: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
  it("sends at most 3 reset emails an hour per address, with the same answer", async () => {
    const c = caller("203.0.113.10");
    const answers = [];
    for (let i = 0; i < 5; i++) answers.push(await c.forgotPassword({ email: "max@x.com" }));
    expect(state.lookups).toBe(3); // the 4th and 5th never reach the account lookup or the mailer
    expect(new Set(answers.map((a: any) => a.message)).size).toBe(1);
  });
});

describe("AI helpers count against the quota", () => {
  it("bookmark tag suggestions with the workspace key", async () => {
    const c = bookmarksRouter.createCaller({ user: { id: 7 }, req: { headers: {} } } as any);
    await c.suggestTags({ url: "https://8.8.8.8/", title: "T", description: "D" });
    expect(state.spent).toEqual([[7, "ai"]]);
  });
});

describe("report emails sent outside", () => {
  it("keep formatting and lose active content and links", () => {
    const out = cleanEmailHtml(
      '<h2 style="color:#16a34a">Status: green</h2><table><tr><td><strong>Done</strong></td></tr></table>' +
      '<script>steal()</script><img src="data:image/png;base64,AAA" onerror="x()"><img src="https://cdn.example.com/logo.png">' +
      '<a href="https://evil.example/login">Sign in to view</a><a href="javascript:alert(1)">x</a>' +
      '<div onclick="x()" style="background:url(javascript:alert(1))">hi</div><iframe src="https://evil"></iframe><form action="https://evil"><input name="p"></form>');
    expect(out).toContain('<h2 style="color:#16a34a">Status: green</h2>');
    expect(out).toContain("<strong>Done</strong>");
    expect(out).toContain('src="https://cdn.example.com/logo.png"');
    expect(out).toContain("Sign in to view");
    expect(out).not.toMatch(/<script|steal\(|onerror|onclick|javascript:|<iframe|<form|<input|<a\b|href=|data:image/i);
  });
});
