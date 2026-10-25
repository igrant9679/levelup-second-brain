/**
 * Phase 0 security lockdown (build -225) — authorization matrix and the new
 * guards. Owner = user id 1; TEAMMATE = an invited admin (every invited
 * teammate is role=admin, so admin must NOT be enough for owner-only tools).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

// ── mocks ──────────────────────────────────────────────────────────────────
const state = {
  smtp: null as any,
  saved: null as any,
  usersCount: 3,
  existingUser: null as any,
  inserted: [] as any[],
  updates: [] as any[],
  claimRows: 1,
  sent: [] as any[],
  counters: new Map<string, number>(),
};

/** A chainable stand-in for a drizzle query: any method returns itself and
 *  awaiting it resolves to `result`. */
function chain(result: any, onCall?: (name: string, args: any[]) => void): any {
  const p: any = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === "then") return (res: any, rej: any) => Promise.resolve(result).then(res, rej);
      return (...args: any[]) => { onCall?.(String(prop), args); return p; };
    },
  });
  return p;
}

const fakeDb = {
  select: (cols?: any) => chain(cols && "n" in cols ? [{ n: state.usersCount }] : state.existingUser ? [state.existingUser] : []),
  insert: () => ({ values: (v: any) => { state.inserted.push(v); return Promise.resolve([{ insertId: 1 }]); } }),
  update: () => chain([{ affectedRows: state.claimRows }], (name, args) => { if (name === "set") state.updates.push(args[0]); }),
  execute: async (q: any) => {
    // quota.ts: INSERT … ON DUPLICATE KEY UPDATE n = n + ? / SELECT n …
    const chunks = (q?.queryChunks || []) as any[];
    const params = chunks.filter((c) => typeof c !== "object" || c === null || !("value" in c && Array.isArray(c.value))).filter((c) => typeof c === "number" || typeof c === "string");
    const text = chunks.map((c: any) => (c && Array.isArray(c.value) ? c.value.join("") : "")).join("?");
    const [userId, bucket, day] = params as any[];
    const key = `${userId}|${bucket}|${day}`;
    if (/^\s*INSERT/i.test(text)) { const n = Number(params[3]); state.counters.set(key, (state.counters.get(key) || 0) + n); return [[]]; }
    return [[{ n: state.counters.get(key) || 0 }]];
  },
};

vi.mock("./db", () => ({
  getDb: vi.fn(async () => fakeDb),
  getSmtpImapAccountFull: vi.fn(async () => state.smtp),
  upsertSmtpImapAccount: vi.fn(async (v: any) => { state.saved = v; }),
  deleteSmtpImapAccount: vi.fn(),
  adminListAllUsers: vi.fn(async () => []),
  getSystemSetting: vi.fn(),
  setSystemSetting: vi.fn(),
  getAllConnectedOAuthAccounts: vi.fn(async () => []),
  getAllSmtpAccounts: vi.fn(async () => []),
  getUserByEmail: vi.fn(async (e: string) => (state.existingUser && state.existingUser.email === e ? state.existingUser : null)),
  upsertUser: vi.fn(),
  updateUserPasswordHash: vi.fn(),
  createTeamInvite: vi.fn(async (v: any) => ({ id: 5, ...v, accepted: 0 })),
  getAllTeamInvites: vi.fn(async () => []),
  getTeamInviteByToken: vi.fn(async (t: string) => ({ id: 9, token: t, email: "taken@test.com", name: null, role: "admin", accepted: 0, expiresAt: new Date(Date.now() + 86400e3) })),
  acceptTeamInvite: vi.fn(),
}));
vi.mock("./routers/appData", () => ({
  isOwnerCtxUser: vi.fn(async (u: { id: number }) => u.id === 1),
}));
vi.mock("./_core/sendEmail", () => ({
  sendEmail: vi.fn(async (p: any) => { state.sent.push(p); return true; }),
}));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("./_core/sdk", () => ({ sdk: { createSessionToken: vi.fn(async () => "jwt"), authenticateRequest: vi.fn() } }));

import { signOAuthState, verifyOAuthState } from "./_core/oauthState";
import { allowedRecipient } from "./_core/recipient";
import { spendQuota } from "./_core/quota";
import { oauthSyncRouter } from "./routers/oauth-sync";
import { teamInvitesRouter } from "./routers/teamInvites";
import { emailAuthRouter } from "./routers/emailAuth";

const ctx = (user: any) => ({ user, req: { protocol: "https", headers: {} }, res: { cookie: vi.fn(), clearCookie: vi.fn() } }) as any;
const OWNER = { id: 1, name: "Owner", email: "owner@test.com", role: "admin", openId: "email:owner@test.com" };
const TEAMMATE = { id: 7, name: "Mate", email: "mate@test.com", role: "admin", openId: "inv:abc" };

beforeEach(() => {
  state.smtp = { userId: 7, email: "mate@test.com", imapHost: "imap.x", imapPassword: "IMAP-SECRET", smtpPassword: "SMTP-SECRET", smtpHost: "smtp.x" };
  state.saved = null; state.usersCount = 3; state.existingUser = null;
  state.inserted = []; state.updates = []; state.claimRows = 1; state.sent = []; state.counters.clear();
  delete process.env.ALLOW_SIGNUP; delete process.env.APP_ORIGIN;
});

// ── OAuth state ───────────────────────────────────────────────────────────
describe("signed OAuth state", () => {
  it("round-trips a signed payload", () => {
    const s = signOAuthState({ userId: 42, origin: "https://levelupnow.tools", slot: "microsoft2" });
    expect(verifyOAuthState(s)).toMatchObject({ userId: 42, origin: "https://levelupnow.tools", slot: "microsoft2" });
  });
  it("rejects a forged or edited state", () => {
    const s = signOAuthState({ userId: 42, origin: "https://levelupnow.tools" });
    const [body, sig] = s.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), userId: 1 })).toString("base64url");
    expect(verifyOAuthState(`${forged}.${sig}`)).toBeNull();
    expect(verifyOAuthState(Buffer.from(JSON.stringify({ userId: 1, origin: "https://x.y" })).toString("base64url"))).toBeNull(); // the old unsigned format
    expect(verifyOAuthState(`${body}.AAAA`)).toBeNull();
  });
  it("expires after 15 minutes", () => {
    const s = signOAuthState({ userId: 42, origin: "https://levelupnow.tools" });
    expect(verifyOAuthState(s, Date.now() + 16 * 60_000)).toBeNull();
  });
});

// ── recipients ────────────────────────────────────────────────────────────
describe("alternate email recipients", () => {
  it("are honored only for the owner", async () => {
    expect(await allowedRecipient(OWNER, "assistant@else.com")).toBe("assistant@else.com");
    expect(await allowedRecipient(TEAMMATE, "someone@else.com")).toBe("mate@test.com");
    expect(await allowedRecipient(TEAMMATE, "MATE@test.com")).toBe("mate@test.com");
    expect(await allowedRecipient(TEAMMATE, null)).toBe("mate@test.com");
  });
});

// ── task assignment (no trust in the stamped column alone) ───────────────
describe("_taskAssignedTo", () => {
  it("decides from the task JSON, not a stale assigneeId stamp", async () => {
    const { _taskAssignedTo } = await vi.importActual<any>("./routers/appData");
    const ids = new Map<string, number>([["jane", 7]]);
    expect(_taskAssignedTo({ raw: JSON.stringify({ assignees: [7] }), assigneeId: null }, 7, ids)).toBe(true);
    expect(_taskAssignedTo({ raw: JSON.stringify({ assignedTo: "Jane" }), assigneeId: null }, 7, ids)).toBe(true);
    // stale stamp says 7, but the task names someone else → not 7's
    expect(_taskAssignedTo({ raw: JSON.stringify({ assignedTo: "Bob" }), assigneeId: 7 }, 7, ids)).toBe(false);
    expect(_taskAssignedTo({ raw: JSON.stringify({ assignees: [3] }), assigneeId: 7 }, 7, ids)).toBe(false);
  });
});

// ── owner-only mail tools ─────────────────────────────────────────────────
describe("SMTP / sender tools are owner-only and never return passwords", () => {
  it("refuses a teammate admin", async () => {
    await expect(oauthSyncRouter.createCaller(ctx(TEAMMATE)).adminGetSmtpImapAccount({ userId: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(oauthSyncRouter.createCaller(ctx(TEAMMATE)).setNotificationSender({ senderKey: "smtp:7" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(oauthSyncRouter.createCaller(ctx(TEAMMATE)).getNotificationSenderOptions()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("strips stored passwords for the owner and keeps them on a blank save", async () => {
    const got: any = await oauthSyncRouter.createCaller(ctx(OWNER)).adminGetSmtpImapAccount({ userId: 7 });
    expect(JSON.stringify(got)).not.toContain("SECRET");
    expect(got).toMatchObject({ hasImapPassword: true, hasSmtpPassword: true, imapPassword: "", smtpPassword: "" });
    await oauthSyncRouter.createCaller(ctx(OWNER)).adminSaveSmtpImapAccount({
      userId: 7, email: "mate@test.com", imapHost: "imap.x", imapPort: 993, imapEncryption: "ssl", imapUsername: "u",
      smtpHost: "smtp.x", smtpPort: 465, smtpEncryption: "ssl", smtpUsername: "u",
    });
    expect(state.saved).toMatchObject({ imapPassword: "IMAP-SECRET", smtpPassword: "SMTP-SECRET" });
  });
});

// ── invites ───────────────────────────────────────────────────────────────
describe("invites", () => {
  it("only the owner can create, list or resend", async () => {
    await expect(teamInvitesRouter.createCaller(ctx(TEAMMATE)).create({ email: "new@test.com", role: "user", expiryDays: 7 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(teamInvitesRouter.createCaller(ctx(TEAMMATE)).list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("links use the app's origin, not one sent by the browser", async () => {
    process.env.APP_ORIGIN = "https://levelupnow.tools";
    const r: any = await teamInvitesRouter.createCaller(ctx(OWNER)).create({ email: "new@test.com", role: "user", expiryDays: 7, origin: "https://evil.example" });
    expect(r.inviteUrl.startsWith("https://levelupnow.tools/invite/")).toBe(true);
    expect(JSON.stringify(state.sent)).not.toContain("evil.example");
  });
  it("cannot be created for, or accepted into, an existing account", async () => {
    state.existingUser = { id: 1, email: "taken@test.com", name: "Owner" };
    await expect(teamInvitesRouter.createCaller(ctx(OWNER)).create({ email: "taken@test.com", role: "admin", expiryDays: 7 })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(teamInvitesRouter.createCaller(ctx(null)).accept({ token: "t", name: "Someone", password: "longenough1" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(state.updates.some((u) => u && u.passwordHash)).toBe(false);
  });
});

// ── registration + password reset ─────────────────────────────────────────
describe("registration is invite-only", () => {
  it("refuses sign-up once accounts exist", async () => {
    await expect(emailAuthRouter.createCaller(ctx(null)).register({ name: "Stranger", email: "s@x.com", password: "longenough1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("allows the very first account, or when ALLOW_SIGNUP=true", async () => {
    process.env.ALLOW_SIGNUP = "true";
    await expect(emailAuthRouter.createCaller(ctx(null)).register({ name: "Stranger", email: "s@x.com", password: "longenough1" })).rejects.not.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("password reset", () => {
  it("stores only a hash and links to the app's own origin", async () => {
    state.existingUser = { id: 7, email: "mate@test.com", name: "Mate <b>" };
    await emailAuthRouter.createCaller(ctx(null)).forgotPassword({ email: "mate@test.com", origin: "https://evil.example" });
    const mail = state.sent[0];
    expect(mail.html).not.toContain("evil.example");
    expect(mail.html).toContain("https://levelupnow.tools/?reset_token=");
    expect(mail.html).not.toContain("Mate <b>");
    const token = /reset_token=([a-f0-9]{64})/.exec(mail.html)![1];
    const stored = state.inserted.find((v) => v.token)?.token;
    expect(stored).toBe(crypto.createHash("sha256").update(token).digest("hex"));
    expect(stored).not.toBe(token);
  });
  it("a link that was already claimed is refused", async () => {
    state.existingUser = { id: 7, token: "x", userId: 7, usedAt: null, expiresAt: new Date(Date.now() + 3600e3) };
    state.claimRows = 0;
    await expect(emailAuthRouter.createCaller(ctx(null)).resetPassword({ token: "abc", newPassword: "longenough1", confirmPassword: "longenough1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ── quotas ────────────────────────────────────────────────────────────────
describe("persistent quotas", () => {
  it("stops a teammate at the per-user email cap and gives the units back", async () => {
    for (let i = 0; i < 150; i++) await spendQuota(TEAMMATE, "email");
    await expect(spendQuota(TEAMMATE, "email")).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    await expect(spendQuota(TEAMMATE, "email", 40)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
  it("the owner has a higher cap", async () => {
    await spendQuota(OWNER, "email", 300);
    await expect(spendQuota(OWNER, "email", 101)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });
});
