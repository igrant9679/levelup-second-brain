/**
 * Audit 2026-11-06 medium/low (server): sign-in, sessions and throttling.
 *  - F20 session revocation: JWTs carry tokenVersion (missing = 0); a token
 *    whose version is behind the account's is refused; password reset / set
 *    and auth.signOutEverywhere bump it, the asking device keeps a fresh cookie;
 *  - F36 a password-less account gets the generic "Invalid email or password";
 *  - F19 throttling is persistent (survives a restart / another instance) and
 *    covers resetPassword and the invite endpoints;
 *  - F70 account creation is serialised (lu_user_create lock, check inside it).
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

const H = vi.hoisted(() => {
  process.env.JWT_SECRET = "phase14-test-secret-0123456789abcdef";
  process.env.ALLOW_SIGNUP = "true";
  return {
    users: new Map<string, any>(),
    tv: new Map<number, number>(),
    emailTaken: false,
    inserted: [] as any[],
  };
});
vi.mock("./db", () => ({
  getDb: vi.fn(async () => null),
  getUserByOpenId: vi.fn(async (openId: string) => {
    const u = H.users.get(openId);
    return u ? { ...u, tokenVersion: H.tv.get(u.id) ?? 0 } : undefined;
  }),
  getUserByEmail: vi.fn(async (email: string) => Array.from(H.users.values()).find((u) => u.email === email)),
  upsertUser: vi.fn(async (u: any) => { H.inserted.push(u); if (!H.users.has(u.openId) && u.email) H.users.set(u.openId, { id: 100 + H.users.size, openId: u.openId, email: u.email, name: u.name }); }),
  bumpTokenVersion: vi.fn(async (id: number) => { const n = (H.tv.get(id) ?? 0) + 1; H.tv.set(id, n); return n; }),
  emailHasAccount: vi.fn(async () => H.emailTaken),
  updateUserPasswordHash: vi.fn(async () => {}),
  logActivity: vi.fn(async () => {}),
  getTeamInviteByToken: vi.fn(async () => null),
  getAllTeamInvites: vi.fn(async () => []),
  adminListAllUsers: vi.fn(async () => []),
}));

import { sdk } from "./_core/sdk";
import { emailAuthRouter } from "./routers/emailAuth";
import { teamInvitesRouter } from "./routers/teamInvites";
import { _resetRateLimits, _setRateLimitDbForTests, rlHit } from "./_core/rateLimit";
import { _setLockProviderForTests } from "./_core/dbLock";
import { COOKIE_NAME } from "@shared/const";

const ANN = { id: 7, openId: "email:ann@x.com", email: "ann@x.com", name: "Ann", role: "user", passwordHash: null as string | null };
function ctxFor(cookie?: string, ip = "203.0.113.9") {
  const set: Record<string, string> = {};
  return {
    set,
    ctx: {
      req: { ip, headers: { cookie: cookie ? `${COOKIE_NAME}=${cookie}` : "" }, protocol: "https", get: () => "levelupnow.tools" },
      res: { cookie: (n: string, v: string) => { set[n] = v; }, clearCookie() {} },
    } as any,
  };
}
const reqWith = (token: string) => ({ headers: { cookie: `${COOKIE_NAME}=${token}` } }) as any;

// ── a tiny stand-in for the rate_limits table (persistent limiter) ──────────
const rlStore = new Map<string, number>();
function chunks(q: any): { text: string; params: any[] } {
  let text = ""; const params: any[] = [];
  for (const c of q.queryChunks || []) {
    if (c && Array.isArray(c.value)) text += c.value.join("");
    else if (c && typeof c === "object" && "value" in c) { text += "?"; params.push(c.value); }
    else { text += "?"; params.push(c); }
  }
  return { text, params };
}
const rlDb = {
  async execute(q: any) {
    const { text, params } = chunks(q);
    if (/^SELECT/i.test(text.trim())) {
      const [bucket, cur, prev] = params;
      const rows = [cur, prev].filter((w) => rlStore.has(`${bucket}|${w}`)).map((w) => ({ windowStart: w, hits: rlStore.get(`${bucket}|${w}`) }));
      return [rows];
    }
    if (/^INSERT/i.test(text.trim())) { const k = `${params[0]}|${params[1]}`; rlStore.set(k, (rlStore.get(k) || 0) + 1); return [{}]; }
    if (/DELETE FROM rate_limits WHERE bucket/i.test(text)) { for (const k of Array.from(rlStore.keys())) if (k.startsWith(params[0] + "|")) rlStore.delete(k); return [{}]; }
    return [{}];
  },
};

beforeEach(() => {
  H.users.clear(); H.tv.clear(); H.emailTaken = false; H.inserted = [];
  H.users.set(ANN.openId, { ...ANN });
  _resetRateLimits(); rlStore.clear(); _setRateLimitDbForTests(null); _setLockProviderForTests(null);
});

describe("session revocation (F20)", () => {
  beforeAll(async () => { await import("./routers"); }, 180_000); // the whole app router is slow to load
  it("a token issued before the account's version moved on is refused", async () => {
    const token = await sdk.createSessionToken(ANN.openId, { name: "Ann" });
    expect((await sdk.authenticateRequest(reqWith(token))).id).toBe(7);
    H.tv.set(7, 1); // sign out everywhere / password change
    await expect(sdk.authenticateRequest(reqWith(token))).rejects.toThrow(/revoked/i);
    const fresh = await sdk.createSessionToken(ANN.openId, { name: "Ann" });
    expect((await sdk.verifySession(fresh))!.tv).toBe(1);
    expect((await sdk.authenticateRequest(reqWith(fresh))).id).toBe(7);
  });
  it("a token with no version claim counts as version 0", async () => {
    const legacy = await sdk.signSession({ openId: ANN.openId, appId: "levelup", name: "Ann" });
    expect((await sdk.verifySession(legacy))!.tv).toBe(0);
    expect((await sdk.authenticateRequest(reqWith(legacy))).id).toBe(7);
    H.tv.set(7, 2);
    await expect(sdk.authenticateRequest(reqWith(legacy))).rejects.toThrow(/revoked/i);
  });
  it("signOutEverywhere revokes other sessions and keeps this device signed in", async () => {
    const { appRouter } = await import("./routers");
    const other = await sdk.createSessionToken(ANN.openId, { name: "Ann", expiresInMs: 30 * 86400e3 });
    const mine = await sdk.createSessionToken(ANN.openId, { name: "Ann", expiresInMs: 30 * 86400e3 });
    const { ctx, set } = ctxFor(mine);
    const r = await appRouter.createCaller({ ...ctx, user: { ...ANN, tokenVersion: 0 } }).auth.signOutEverywhere();
    expect(r).toEqual({ success: true });
    await expect(sdk.authenticateRequest(reqWith(other))).rejects.toThrow(/revoked/i);
    expect(set[COOKIE_NAME]).toBeTruthy();
    expect((await sdk.authenticateRequest(reqWith(set[COOKIE_NAME]))).id).toBe(7);
    // the new cookie keeps (about) the old one's 30-day lifetime
    const v = await sdk.verifySession(set[COOKIE_NAME]);
    expect(v!.exp! * 1000 - Date.now()).toBeGreaterThan(29 * 86400e3);
  });
  it("setting a password bumps the version and re-issues this device's cookie", async () => {
    const mine = await sdk.createSessionToken(ANN.openId, { name: "Ann" });
    const { ctx, set } = ctxFor(mine);
    await emailAuthRouter.createCaller({ ...ctx, user: { ...ANN } }).setPassword({ newPassword: "a-new-password" });
    expect(H.tv.get(7)).toBe(1);
    await expect(sdk.authenticateRequest(reqWith(mine))).rejects.toThrow(/revoked/i);
    expect((await sdk.authenticateRequest(reqWith(set[COOKIE_NAME]))).id).toBe(7);
  });
});

describe("sign-in messages (F36)", () => {
  it("an account with no password answers exactly like a wrong password", async () => {
    const c = emailAuthRouter.createCaller({ ...ctxFor().ctx, user: null });
    const noPw = await c.login({ email: "ann@x.com", password: "whatever" }).catch((e) => e);
    const noAcct = await c.login({ email: "nobody@x.com", password: "whatever" }).catch((e) => e);
    expect(noPw.code).toBe("UNAUTHORIZED");
    expect(noPw.message).toBe("Invalid email or password");
    expect(noPw.message).toBe(noAcct.message);
  });
});

describe("persistent throttling (F19)", () => {
  it("the sign-in limit survives a restart (memory cleared) and is shared through the database", async () => {
    _setRateLimitDbForTests(async () => rlDb);
    const c = emailAuthRouter.createCaller({ ...ctxFor().ctx, user: null });
    for (let i = 0; i < 8; i++) await expect(c.login({ email: "max@x.com", password: "guess" + i })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    _resetRateLimits(); // a deploy / another instance: no memory of the failures
    await expect(c.login({ email: "max@x.com", password: "again" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(rlStore.size).toBeGreaterThan(0);
    expect(Array.from(rlStore.keys()).some((k) => k.includes("max@x.com"))).toBe(false); // keys are hashed
  });
  it("the database limiter weighs the previous window in (sliding estimate)", async () => {
    _setRateLimitDbForTests(async () => rlDb);
    const W = 1000;
    for (let i = 0; i < 4; i++) expect(await rlHit("k", 4, W, 10_100 + i)).toBe(true);
    expect(await rlHit("k", 4, W, 10_900)).toBe(false);
    expect(await rlHit("k", 4, W, 11_050)).toBe(true);  // 4 × 95% = 3.8 < 4
    expect(await rlHit("k", 4, W, 11_060)).toBe(false); // 1 + 4 × 94% — a fixed window would allow 3 more
    expect(await rlHit("k", 4, W, 11_900)).toBe(true);  // 1 + 4 × 10%
  });
  it("resetPassword is throttled per link", async () => {
    const c = emailAuthRouter.createCaller({ ...ctxFor().ctx, user: null });
    const tryOnce = () => c.resetPassword({ token: "same-token", newPassword: "longenough1", confirmPassword: "longenough1" }).catch((e) => e.code);
    for (let i = 0; i < 5; i++) expect(await tryOnce()).not.toBe("TOO_MANY_REQUESTS");
    expect(await tryOnce()).toBe("TOO_MANY_REQUESTS");
  });
  it("invite validate and accept are throttled", async () => {
    const c = teamInvitesRouter.createCaller({ ...ctxFor().ctx, user: null });
    for (let i = 0; i < 30; i++) await expect(c.validate({ token: "tok" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(c.validate({ token: "tok" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    for (let i = 0; i < 5; i++) await expect(c.accept({ token: "acc", name: "N", password: "password1" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(c.accept({ token: "acc", name: "N", password: "password1" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});

describe("serialised account creation (F70)", () => {
  const conn = (got: boolean, events: string[]) => async () => ({
    async getLock(name: string, t: number) { events.push(`lock ${name} ${t}`); return got; },
    async release(name: string) { events.push(`release ${name}`); },
    async close() { events.push("close"); },
  });
  it("register takes lu_user_create and re-checks the email (case-insensitive) inside it", async () => {
    const events: string[] = [];
    _setLockProviderForTests(conn(true, events));
    H.emailTaken = true; // another sign-up committed while this one hashed its password
    const c = emailAuthRouter.createCaller({ ...ctxFor().ctx, user: null });
    await expect(c.register({ name: "Bo", email: "Bo@X.com", password: "password1" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(events).toEqual(["lock lu_user_create 5", "release lu_user_create", "close"]);
    expect(H.inserted.length).toBe(0);
    H.emailTaken = false;
    await c.register({ name: "Bo", email: "bo@x.com", password: "password1" });
    expect(H.inserted.length).toBe(1);
  });
  it("a busy lock is reported, nothing is created", async () => {
    _setLockProviderForTests(conn(false, []));
    const c = emailAuthRouter.createCaller({ ...ctxFor().ctx, user: null });
    await expect(c.register({ name: "Cy", email: "cy@x.com", password: "password1" })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(H.inserted.length).toBe(0);
  });
});
