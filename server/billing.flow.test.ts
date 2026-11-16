/**
 * Build -279 (Phase I): sign-up and billing, end to end.
 *
 * The REAL server code on a REAL MySQL (CI's, or an ephemeral one from
 * mysql-memory-server) talking to a FAKE Stripe (scripts/lib/fake-stripe.mjs)
 * that answers the API calls and sends signed webhooks to a real HTTP route.
 *
 *   sign-up closed → opened by the operator → confirmation mail → workspace +
 *   owner + trial → plan limits → Checkout → paid → payment fails → grace →
 *   LOCKED (what still works, what does not, for whom) → recovers → seats
 *   follow the head count → canceled → a second workspace for the same login
 *   → closing a workspace stops its subscription → reminders.
 *
 * And throughout: workspace 1, which has no billing record, is never touched.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import path from "path";
import crypto from "crypto";
import http from "http";
import express from "express";
import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
// @ts-ignore — plain ESM helper
import { startFakeStripe } from "../scripts/lib/fake-stripe.mjs";

vi.setConfig({ testTimeout: 180_000, hookTimeout: 600_000 });
process.env.JWT_SECRET = process.env.JWT_SECRET || "billing-test-secret-0123456789abcdef";
process.env.SECRETS_KEY = process.env.SECRETS_KEY || "billing-test-secrets-key-0123456789";
process.env.OWNER_OPEN_ID = "email:op@platform.test";
process.env.APP_ORIGIN = "http://localhost:4310";
delete process.env.ALLOW_SIGNUP;
const CI_URL = process.env.DATABASE_URL || "";
const DB_NAME = "levelup_billing_" + crypto.randomBytes(4).toString("hex");

// Mail is captured, not sent.
const mails: Array<{ to: string; subject: string; html: string; kind?: string; workspaceId?: number | null }> = [];
let mailWorks = true;
vi.mock("./_core/sendEmail", () => ({
  sendEmail: async (p: any) => { if (!mailWorks) return false; mails.push({ to: p.to, subject: p.subject, html: p.html, kind: p.kind, workspaceId: p.workspaceId ?? null }); return true; },
}));

let conn: mysql.Connection;
let memServer: any = null;
let fake: any;
let hook: http.Server;
let appRouter: any, createContext: any, sdk: any, billing: any;
const q = async (sql: string, params: any[] = []) => (await conn.query(sql, params))[0] as any[];
const DAY = 86_400_000;

function reqRes(cookie?: string) {
  const headers: Record<string, any> = { host: "localhost:4310" };
  if (cookie) headers.cookie = cookie;
  const setCookies: Array<{ name: string; value: string }> = [];
  const req: any = { headers, protocol: "http", secure: false, hostname: "localhost", query: {}, socket: { remoteAddress: "127.0.0.1" }, ip: "127.0.0.1", get: (h: string) => headers[String(h).toLowerCase()] };
  const res: any = { cookie: (name: string, value: string) => { setCookies.push({ name, value }); }, clearCookie: () => {}, setHeader: () => {}, getHeader: () => undefined };
  return { req, res, setCookies };
}
async function as(openId: string | null) {
  const { COOKIE_NAME } = await import("@shared/const");
  const { req, res, setCookies } = reqRes(openId ? `${COOKIE_NAME}=${await sdk.createSessionToken(openId, { name: "t" })}` : undefined);
  return { c: appRouter.createCaller(await createContext({ req, res })), setCookies };
}
const userOf = async (openId: string) => (await q("SELECT * FROM users WHERE openId = ?", [openId]))[0];
const bill = async (ws: number) => (await q("SELECT * FROM workspace_billing WHERE workspaceId = ?", [ws]))[0];
const fresh = () => billing.invalidateBilling();
async function until<T>(fn: () => Promise<T | false | null | undefined>, ms = 8000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v as T; if (Date.now() > end) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 60)); }
}
const tokenIn = (html: string) => (html.match(/[?&]signup=([a-f0-9]{64})/) || [])[1];

let OP = "email:op@platform.test";
let W = 0;                                   // the self-serve workspace
const NEW = "email:nora@newco.test";

describe("sign-up and billing, end to end (real MySQL + fake Stripe)", () => {
  beforeAll(async () => {
    let url = "";
    if (CI_URL) {
      const u = new URL(CI_URL); u.pathname = "/";
      const admin = await mysql.createConnection({ uri: u.toString() });
      await admin.query("CREATE DATABASE `" + DB_NAME + "`");
      await admin.end();
      u.pathname = "/" + DB_NAME; url = u.toString();
    } else {
      const { createDB } = await import("mysql-memory-server");
      memServer = await createDB({ version: "8.0.x", dbName: DB_NAME, logLevel: "ERROR" } as any);
      url = `mysql://${memServer.username}@127.0.0.1:${memServer.port}/${memServer.dbName}`;
    }
    const mconn = await mysql.createConnection({ uri: url, multipleStatements: true });
    await migrate(drizzle(mconn), { migrationsFolder: path.join(__dirname, "../drizzle") });
    await mconn.end();
    process.env.DATABASE_URL = url;
    conn = await mysql.createConnection({ uri: url });

    fake = await startFakeStripe({ prices: {
      price_solo_m: { unit_amount: 900, interval: "month" }, price_team_m: { unit_amount: 1200, interval: "month" }, price_team_y: { unit_amount: 12000, interval: "year" },
    }, webhookSecret: "whsec_flow_test" });
    process.env.STRIPE_SECRET_KEY = fake.secretKey;
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_flow_test";
    process.env.STRIPE_API_BASE = fake.url;

    ({ appRouter } = await import("./routers"));
    ({ createContext } = await import("./_core/context"));
    ({ sdk } = await import("./_core/sdk"));
    billing = await import("./_core/billing");
    // the real webhook route on a real port
    const app = express();
    (await import("./_core/stripeWebhook")).registerStripeWebhook(app);
    app.use(express.json());
    hook = app.listen(0, "127.0.0.1");
    await new Promise((r) => hook.once("listening", r));
    fake.setWebhook(`http://127.0.0.1:${(hook.address() as any).port}/api/stripe/webhook`);

    // Workspace 1 (made by migration 0063) with its owner, who is also the operator, and a member.
    await conn.query("INSERT INTO users (openId, name, email, loginMethod, role, passwordHash, workspaceId) VALUES (?, 'Olive Operator', 'op@platform.test', 'email', 'admin', 'x', 1), ('email:mem@platform.test', 'Mel Member', 'mem@platform.test', 'email', 'user', 'x', 1)", [OP]);
    await (await import("./_core/workspace")).ensureWorkspaceBootstrap();
  }, 600_000);

  afterAll(async () => {
    try { await new Promise((r) => hook?.close(() => r(null))); } catch { /* */ }
    try { await fake?.stop(); } catch { /* */ }
    try { await conn?.end(); } catch { /* */ }
    try { if (memServer) await memServer.stop(); } catch { /* */ }
    if (CI_URL) {
      try { const u = new URL(CI_URL); u.pathname = "/"; const admin = await mysql.createConnection({ uri: u.toString() }); await admin.query("DROP DATABASE IF EXISTS `" + DB_NAME + "`"); await admin.end(); } catch { /* */ }
    }
  }, 60_000);

  it("nothing is on by default: sign-up closed, no plans for sale, the existing workspace not billed", async () => {
    const pub = await (await as(null)).c.billing.plans();
    expect(pub).toMatchObject({ signupOpen: false, billingOn: false, plans: [] });
    await expect((await as(null)).c.billing.signupStart({ name: "X", email: "x@x.test", password: "password1" })).rejects.toThrow(/invitation/);
    const st = await (await as(OP)).c.billing.status();
    expect(st).toMatchObject({ billed: false, status: "none", locked: false, limits: null, isOwner: true });
    expect((await (await as(OP)).c.auth.me()).billing).toBeNull();
    expect((await q("SELECT COUNT(*) AS n FROM workspace_billing"))[0].n).toBe(0);
    // members and strangers cannot touch the platform's billing settings
    await expect((await as("email:mem@platform.test")).c.billing.opConfigGet()).rejects.toThrow();
    await expect((await as(null)).c.billing.opConfigSet({ config: { signupOpen: true } })).rejects.toThrow();
    await expect((await as("email:mem@platform.test")).c.billing.checkout({ plan: "team", interval: "month" })).rejects.toThrow();
  });

  it("the operator sets prices and opens sign-up; the amounts shown come from Stripe", async () => {
    const op = (await as(OP)).c;
    const before = await op.billing.opConfigGet();
    expect(before.stripe).toMatchObject({ configured: true, mode: "test", webhookSecretSet: true });
    expect(before.sellable).toBe(false);
    const plans = before.config.plans.map((p: any) => p.key === "team" ? { ...p, priceMonthly: "price_team_m", priceYearly: "price_team_y" } : p.key === "solo" ? { ...p, priceMonthly: "price_solo_m" } : p);
    const saved = await op.billing.opConfigSet({ config: { ...before.config, plans, signupOpen: true } });
    expect(saved.config.signupOpen).toBe(true);
    const pub = await (await as(null)).c.billing.plans();
    expect(pub).toMatchObject({ signupOpen: true, billingOn: true, trialDays: 14 });
    const team = pub.plans.find((p: any) => p.key === "team");
    expect(team).toMatchObject({ buyable: true, perSeat: true, monthly: { amount: 1200, currency: "usd", interval: "month" }, yearly: { amount: 12000, interval: "year" } });
    expect(team.priceMonthly).toBeUndefined();                       // price ids are not published
    expect(pub.plans.find((p: any) => p.key === "business").buyable).toBe(false);
    expect((await q("SELECT action FROM audit_log WHERE action = 'billing.config_change'")).length).toBe(1);
  });

  it("sign-up: nothing exists until the emailed link is opened; then a workspace, its owner and a trial", async () => {
    const anon = (await as(null)).c;
    mails.length = 0;
    await expect(anon.billing.signupStart({ name: "Nora New", workspaceName: "NewCo", email: "Nora@NewCo.test", password: "short" })).rejects.toThrow();
    expect(await anon.billing.signupStart({ name: "Nora New", workspaceName: "NewCo", email: "Nora@NewCo.test", password: "correct horse battery" })).toEqual({ ok: true });
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ to: "nora@newco.test", kind: "account" });
    const token = tokenIn(mails[0].html);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(mails[0].html).toContain("http://localhost:4310/?signup=");
    // nothing was created, and the database holds neither the token nor the password
    expect(await userOf(NEW)).toBeUndefined();
    expect((await q("SELECT COUNT(*) AS n FROM workspaces"))[0].n).toBe(1);
    const [req] = await q("SELECT * FROM signups");
    expect(req.tokenHash).not.toBe(token);
    expect(JSON.stringify(req)).not.toContain("correct horse");
    // an address that already has an account gets the same answer and a different mail; no request is stored
    expect(await anon.billing.signupStart({ name: "Olive", email: "op@platform.test", password: "whatever-123" })).toEqual({ ok: true });
    expect(mails[1].subject).toMatch(/already have/);
    expect((await q("SELECT COUNT(*) AS n FROM signups"))[0].n).toBe(1);
    // the mail could not be sent → refused, nothing kept
    mailWorks = false;
    await expect(anon.billing.signupStart({ name: "Zed", email: "zed@nomail.test", password: "password-123" })).rejects.toThrow(/confirmation email/);
    mailWorks = true;
    expect((await q("SELECT COUNT(*) AS n FROM signups WHERE email = 'zed@nomail.test'"))[0].n).toBe(0);

    expect(await anon.billing.signupPeek({ token })).toMatchObject({ valid: true, email: "nora@newco.test", workspaceName: "NewCo" });
    expect(await anon.billing.signupPeek({ token: "f".repeat(64) })).toEqual({ valid: false });
    const visitor = await as(null);
    const done = await visitor.c.billing.signupConfirm({ token });
    W = done.workspaceId;
    expect(W).toBeGreaterThan(1);
    expect(visitor.setCookies).toHaveLength(1);                       // signed in
    const nora = await userOf(NEW);
    expect(nora).toMatchObject({ workspaceId: W, role: "admin", accountId: null, platformRole: null });
    expect((await q("SELECT name, ownerUserId, status FROM workspaces WHERE id = ?", [W]))[0]).toMatchObject({ name: "NewCo", ownerUserId: nora.id, status: "active" });
    // the password she chose signs her in
    const login = await (await as(null)).c.emailAuth.login({ email: "nora@newco.test", password: "correct horse battery" });
    expect(login.success ?? login.ok ?? true).toBeTruthy();
    // the link works once
    await expect((await as(null)).c.billing.signupConfirm({ token })).rejects.toThrow(/no longer valid/);
    expect(await anon.billing.signupPeek({ token })).toEqual({ valid: false });

    const b = await bill(W);
    expect(b).toMatchObject({ plan: "team", status: "trialing", stripeSubscriptionId: null });
    expect(Math.round((new Date(b.trialEndsAt).getTime() - Date.now()) / DAY)).toBe(14);
    const me = await (await as(NEW)).c.auth.me();
    expect(me).toMatchObject({ isOwner: true, isOperator: false, workspace: { id: W, role: "owner" } });
    expect(me.billing).toMatchObject({ status: "trialing", locked: false, trialDaysLeft: 14, planName: "Team" });
    // the new workspace sees none of workspace 1's people, and the other way round
    const team = await (await as(NEW)).c.team.listMembers();
    expect(JSON.stringify(team)).not.toContain("platform.test");
    expect(await bill(1)).toBeUndefined();
  });

  it("the plan sets the limits: daily AI and mail, head count", async () => {
    const { workspaceCap } = await import("./_core/quota");
    expect(await workspaceCap(W, "ai")).toBe(3000);
    expect(await workspaceCap(W, "email")).toBe(500);
    expect(await workspaceCap(1, "ai")).toBe(5000);                    // not billed: the platform default
    const st = await (await as(NEW)).c.billing.status();
    expect(st).toMatchObject({ status: "trialing", limits: { members: 25 }, usage: { members: 1 }, canBuy: true });
    // on a one-person plan nobody can be invited
    const op = (await as(OP)).c;
    await op.billing.opSet({ workspaceId: W, mode: "comped", plan: "solo" });
    fresh();
    await expect((await as(NEW)).c.teamInvites.create({ email: "second@newco.test", role: "user" })).rejects.toThrow(/allows 1 person/);
    expect(await workspaceCap(W, "ai")).toBe(300);
    // the operator's own override still wins over the plan
    await conn.query("UPDATE workspaces SET quotas = ? WHERE id = ?", [JSON.stringify({ ai: 42 }), W]);
    (await import("./_core/workspace")).invalidateWorkspace(W);
    expect(await workspaceCap(W, "ai")).toBe(42);
    await conn.query("UPDATE workspaces SET quotas = NULL WHERE id = ?", [W]);
    (await import("./_core/workspace")).invalidateWorkspace(W);
    await op.billing.opSet({ workspaceId: W, mode: "trial", plan: "team", trialDays: 14 });
    fresh();
    expect((await bill(W)).status).toBe("trialing");
  });

  it("Checkout: the owner pays; the trial days left are kept; the webhook is signed and handled once", async () => {
    const nora = (await as(NEW)).c;
    await expect(nora.billing.checkout({ plan: "business", interval: "month" })).rejects.toThrow(/not available/);
    const { url } = await nora.billing.checkout({ plan: "team", interval: "month" });
    expect(url).toContain(fake.url + "/pay/cs_");
    const cs = fake.lastSession();
    expect(cs.params).toMatchObject({ mode: "subscription", client_reference_id: String(W), line_items: [{ price: "price_team_m", quantity: "1" }], success_url: "http://localhost:4310/?billing=success" });
    expect(Number(cs.params.subscription_data.trial_end)).toBeGreaterThan(Date.now() / 1000 + 12 * 86400);
    const cust = (await bill(W)).stripeCustomerId;
    expect(cust).toMatch(/^cus_/);
    expect(fake.state.customers.get(cust)).toMatchObject({ email: "nora@newco.test", name: "NewCo", metadata: { workspaceId: String(W) } });

    const sub = await fake.pay(cs.id);
    expect(fake.state.deliveries.filter((d: any) => d.status === 200).length).toBe(2);
    fresh();
    expect(await bill(W)).toMatchObject({ status: "trialing", plan: "team", interval: "month", stripeSubscriptionId: sub.id, seats: 1 });
    expect((await (await as(NEW)).c.billing.status())).toMatchObject({ hasSubscription: true, status: "trialing", locked: false });
    // a second Checkout is refused once there is a subscription
    await expect(nora.billing.checkout({ plan: "team", interval: "year" })).rejects.toThrow(/already has a subscription/);

    // the same event again → handled once
    const [evt] = await q("SELECT eventId FROM billing_events LIMIT 1");
    const again = await billing.handleStripeEvent({ id: evt.eventId, type: "customer.subscription.updated", data: { object: { id: sub.id } } });
    expect(again).toMatchObject({ handled: false, note: "duplicate" });
    // a forged webhook is refused before anything is read
    const hookUrl = fake.state.webhookUrl;
    const forged = await fetch(hookUrl, { method: "POST", headers: { "content-type": "application/json", "stripe-signature": `t=${Math.floor(Date.now() / 1000)},v1=${"a".repeat(64)}` }, body: JSON.stringify({ id: "evt_forged", type: "customer.subscription.deleted", data: { object: { id: sub.id } } }) });
    expect(forged.status).toBe(400);
    fresh();
    expect((await bill(W)).status).toBe("trialing");

    // the trial ends, the first charge succeeds
    await fake.recover(sub.id);
    fresh();
    expect(await bill(W)).toMatchObject({ status: "active", trialEndsAt: null });
    expect((await (await as(NEW)).c.auth.me()).billing).toMatchObject({ status: "active", locked: false });
  });

  it("a failed payment: a grace period, then the workspace is LOCKED — for everyone in it, and only it", async () => {
    const sub = (await bill(W)).stripeSubscriptionId;
    // a teammate joins first (so the lock can be seen from a member's side, and for the seat count below)
    mails.length = 0;
    await (await as(NEW)).c.teamInvites.create({ email: "mia@newco.test", role: "user" });
    const [inv] = await q("SELECT token FROM team_invites WHERE email = 'mia@newco.test'");
    await (await as(null)).c.teamInvites.accept({ token: inv.token, name: "Mia Member", password: "another-password-1" });
    const mia = (await q("SELECT openId FROM users WHERE email = 'mia@newco.test' AND workspaceId = ?", [W]))[0].openId;
    // per-seat plan: Stripe is told there are two people now
    await until(async () => fake.state.subscriptions.get(sub).quantity === 2);
    await until(async () => { fresh(); return (await bill(W)).seats === 2; });

    await fake.failPayment(sub);
    fresh();
    let b = await bill(W);
    expect(b.status).toBe("past_due");
    expect(b.pastDueSince).toBeTruthy();
    let me = await (await as(NEW)).c.auth.me();
    expect(me.billing).toMatchObject({ status: "past_due", locked: false });
    expect(me.billing.graceEndsAt).toBeTruthy();
    await (await as(NEW)).c.appData.load();                            // still working in the grace period

    await conn.query("UPDATE workspace_billing SET pastDueSince = ? WHERE workspaceId = ?", [new Date(Date.now() - 8 * DAY), W]);
    fresh(); (await import("./_core/workspace")).invalidateWorkspace();
    me = await (await as(NEW)).c.auth.me();
    expect(me.billing).toMatchObject({ locked: true, lockReason: "unpaid" });
    for (const who of [NEW, mia]) {
      const c = (await as(who)).c;
      await expect(c.appData.load()).rejects.toThrow(/BILLING_LOCKED/);
      await expect(c.team.listMembers()).rejects.toThrow(/BILLING_LOCKED/);
      await expect(c.appData.save({ tasks: [] })).rejects.toThrow(/BILLING_LOCKED/);
      expect((await c.billing.status()).locked).toBe(true);           // …but they can see why
      expect((await c.workspace.list()).workspaces.length).toBeGreaterThan(0);
    }
    // the owner's ways out stay open: pay, export, close
    const owner = (await as(NEW)).c;
    expect((await owner.billing.portal()).url).toContain("/portal/cus_");
    expect((await owner.workspace.export()).dump.tables.users.rows.length).toBe(2);
    await expect((await as(mia)).c.billing.portal()).rejects.toThrow();
    // background jobs skip it; the unbilled workspace 1 carries on
    const { activeWorkspaceIds } = await import("./_core/workspace");
    expect(await activeWorkspaceIds()).toEqual([1]);
    await (await as(OP)).c.appData.load();
    // nobody can join a locked workspace
    await (await as(OP)).c.billing.opConfigGet();
    await conn.query("INSERT INTO team_invites (invitedBy, workspaceId, email, role, token, expiresAt) VALUES (?, ?, 'late@newco.test', 'user', ?, ?)", [(await userOf(NEW)).id, W, "c".repeat(64), new Date(Date.now() + DAY)]);
    await expect((await as(null)).c.teamInvites.accept({ token: "c".repeat(64), name: "Late", password: "password-12345" })).rejects.toThrow(/not open/);

    // the card is fixed → open again at once
    await fake.recover(sub);
    fresh(); (await import("./_core/workspace")).invalidateWorkspace();
    expect(await bill(W)).toMatchObject({ status: "active", pastDueSince: null });
    await (await as(mia)).c.appData.load();
    expect((await activeWorkspaceIds()).sort()).toEqual([1, W]);
    // removing the teammate brings the seat count back down
    const miaRow = (await q("SELECT id FROM users WHERE openId = ?", [mia]))[0];
    await (await as(NEW)).c.team.deleteMember({ userId: miaRow.id });
    await until(async () => fake.state.subscriptions.get(sub).quantity === 1);
  });

  it("cancelling ends in a lock; the operator can comp, restart a trial or take billing away", async () => {
    const sub = (await bill(W)).stripeSubscriptionId;
    await fake.cancel(sub);
    fresh();
    expect((await bill(W)).status).toBe("canceled");
    expect((await (await as(NEW)).c.auth.me()).billing).toMatchObject({ locked: true, lockReason: "canceled" });
    await expect((await as(NEW)).c.appData.load()).rejects.toThrow(/BILLING_LOCKED/);
    // they can subscribe again from the lock
    const again = await (await as(NEW)).c.billing.checkout({ plan: "team", interval: "year" });
    expect(again.url).toContain("/pay/cs_");
    expect(fake.lastSession().params.subscription_data.trial_end).toBeUndefined();   // no second free trial

    const op = (await as(OP)).c;
    const list = await op.workspace.opList();
    expect(list.workspaces.find((w: any) => w.id === W).billing).toMatchObject({ status: "canceled", locked: true });
    expect(list.workspaces.find((w: any) => w.id === 1).billing).toBeNull();
    expect(JSON.stringify(list)).not.toContain("cus_");                // no Stripe ids in the console list
    await op.billing.opSet({ workspaceId: W, mode: "trial", trialDays: 0 });
    fresh();
    expect((await (await as(NEW)).c.auth.me()).billing).toMatchObject({ status: "trial_ended", locked: true });
    await op.billing.opSet({ workspaceId: W, mode: "comped" });
    fresh();
    expect((await (await as(NEW)).c.auth.me()).billing).toMatchObject({ status: "comped", locked: false, billed: false });
    await (await as(NEW)).c.appData.load();
    await op.billing.opSet({ workspaceId: W, mode: "none" });
    fresh();
    expect(await bill(W)).toBeUndefined();
    expect((await (await as(NEW)).c.auth.me()).billing).toBeNull();
    // only the operator
    await expect((await as(NEW)).c.billing.opSet({ workspaceId: 1, mode: "trial", trialDays: 0 })).rejects.toThrow();
    expect(await bill(1)).toBeUndefined();
  });

  it("one login, another workspace: created from inside, one free trial at a time; closing it stops the subscription", async () => {
    const first = await as(NEW);
    const made = await first.c.billing.createWorkspace({ name: "Nora's side project" });
    const X = made.workspaceId;
    expect(X).toBeGreaterThan(W);
    expect(first.setCookies).toHaveLength(1);                           // moved into it
    const member = (await q("SELECT * FROM users WHERE workspaceId = ?", [X]))[0];
    const login = await userOf(NEW);
    expect(member).toMatchObject({ accountId: login.id, role: "admin", passwordHash: null });
    expect((await q("SELECT ownerUserId FROM workspaces WHERE id = ?", [X]))[0].ownerUserId).toBe(member.id);
    expect(await bill(X)).toMatchObject({ status: "trialing", plan: "team" });
    const meX = await (await as(member.openId)).c.auth.me();
    expect(meX.workspaces.map((w: any) => w.id).sort()).toEqual([W, X]);
    // a second free trial is refused while this one runs
    await expect((await as(member.openId)).c.billing.createWorkspace({ name: "Third" })).rejects.toThrow(/free trial/);

    const x = (await as(member.openId)).c;
    await x.billing.checkout({ plan: "solo", interval: "month" });
    const sub = await fake.pay(fake.lastSession().id);
    fresh();
    expect((await bill(X)).stripeSubscriptionId).toBe(sub.id);
    await x.workspace.requestDelete({ confirmName: "Nora's side project" });
    expect(fake.state.subscriptions.get(sub.id).status).toBe("canceled");
    fresh();
    expect((await bill(X)).status).toBe("canceled");
  });

  it("reminders: before a trial ends and when it has — once each, to the owner", async () => {
    const op = (await as(OP)).c;
    await op.billing.opSet({ workspaceId: W, mode: "trial", trialDays: 2 });
    fresh();
    mails.length = 0;
    expect(await billing.billingReminders()).toBe(1);
    expect(mails[0]).toMatchObject({ to: "nora@newco.test", kind: "account", workspaceId: W });
    expect(mails[0].subject).toMatch(/trial ends in 2 days/);
    expect(mails[0].html).toContain("http://localhost:4310/?billing=open");
    expect(await billing.billingReminders()).toBe(0);
    expect(await billing.billingReminders(Date.now() + 3 * DAY)).toBe(1);
    expect(mails[1].subject).toMatch(/trial has ended/);
    expect(await billing.billingReminders(Date.now() + 9 * DAY)).toBe(0);
    expect(mails.every((m) => m.to === "nora@newco.test")).toBe(true);
  });

  it("sign-up closes again when the operator says so; an open confirmation link then does nothing", async () => {
    const anon = (await as(null)).c;
    mails.length = 0;
    await anon.billing.signupStart({ name: "Late Larry", email: "larry@late.test", password: "password-123456" });
    const token = tokenIn(mails[0].html);
    const op = (await as(OP)).c;
    const cur = await op.billing.opConfigGet();
    await op.billing.opConfigSet({ config: { ...cur.config, signupOpen: false } });
    await expect(anon.billing.signupConfirm({ token })).rejects.toThrow(/closed/);
    await expect(anon.billing.signupStart({ name: "A", email: "a@a.test", password: "password-123456" })).rejects.toThrow(/invitation/);
    expect((await q("SELECT COUNT(*) AS n FROM users WHERE email = 'larry@late.test'"))[0].n).toBe(0);
    await expect((await as(NEW)).c.billing.createWorkspace({ name: "Nope" })).rejects.toThrow(/not open/);
  });
});
