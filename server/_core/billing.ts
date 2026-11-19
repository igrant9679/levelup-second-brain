/**
 * Billing: what a workspace is on, what that allows, and Stripe (build -279,
 * Phase I of docs/multi-tenant-plan.md).
 *
 * ONE RULE FIRST: a workspace with NO row in workspace_billing is not billed.
 * It is never trialled, limited by a plan or locked. That is every workspace
 * that existed before this build and every workspace the operator creates by
 * hand. Only a self-serve sign-up (or the operator, on purpose) creates a row.
 *
 * States (workspace_billing.status):
 *   comped     the operator gave it away — never locked; plan limits apply
 *              only if `plan` names a real plan
 *   trialing   free until trialEndsAt, on the trial plan's limits
 *   active     a paid subscription
 *   past_due   the last payment failed; works for graceDays, then locks
 *   canceled   the subscription ended
 *
 * LOCKED (trial over with no subscription, grace over, or canceled): the
 * owner can sign in, pay, export and close the workspace — nothing else, for
 * anyone (`requireUser` in trpc.ts refuses other procedures; background jobs
 * skip the workspace). Nothing is deleted by a lock.
 *
 * Stripe is the source of truth for a subscription: webhooks only tell us
 * WHICH subscription changed, and the current state is then read from Stripe
 * (so events arriving out of order cannot leave a stale state).
 */
import crypto from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getSystemSetting, setSystemSetting } from "../db";
import { workspaceBilling, billingEvents, users, teamInvites, files, trialClaims } from "../../drizzle/schema";
import { billingConfig, planByKey, planByPrice, limitsOf, type Plan, type PlanLimits } from "./plans";
import { stripeCall, stripeConfigured, stripeHostedUrl, StripeError } from "./stripe";
import { appOrigin } from "./appOrigin";

export type BillingStatus = "comped" | "trialing" | "active" | "past_due" | "canceled";
const STATUSES = new Set<string>(["comped", "trialing", "active", "past_due", "canceled"]);
export type BillingRow = {
  workspaceId: number; plan: string; status: BillingStatus;
  trialEndsAt: Date | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null; stripeItemId: string | null;
  interval: string | null; seats: number; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; pastDueSince: Date | null;
  notified: Record<string, any>;
};
export type Entitlement = {
  /** false = this workspace has nothing to do with billing. */
  billed: boolean;
  status: "none" | BillingStatus | "trial_ended";
  plan: string | null; planName: string | null;
  locked: boolean; lockReason: null | "trial_ended" | "unpaid" | "canceled";
  trialEndsAt: string | null; trialDaysLeft: number | null;
  currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; graceEndsAt: string | null;
  interval: string | null; hasSubscription: boolean; seats: number;
  limits: PlanLimits | null;
};

const DAY = 86_400_000;
const TTL = 30_000;
const _rows = new Map<number, { at: number; v: BillingRow | null }>();
export function invalidateBilling(wsId?: number | null) { if (wsId == null) _rows.clear(); else _rows.delete(Number(wsId)); }
export function _resetBillingForTest() { _rows.clear(); _prices.clear(); _portalCfg = null; }

const toDate = (v: any): Date | null => { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return Number.isFinite(d.getTime()) ? d : null; };
const parseObj = (v: any): Record<string, any> => { try { const o = typeof v === "string" ? JSON.parse(v) : v; return o && typeof o === "object" && !Array.isArray(o) ? o : {}; } catch { return {}; } };
function shape(r: any, wsId: number): BillingRow | null {
  // (older unit tests use fake databases that answer any query with their own rows)
  if (!r || Number(r.workspaceId) !== wsId || !STATUSES.has(String(r.status))) return null;
  return {
    workspaceId: wsId, plan: String(r.plan || ""), status: r.status,
    trialEndsAt: toDate(r.trialEndsAt), stripeCustomerId: r.stripeCustomerId || null, stripeSubscriptionId: r.stripeSubscriptionId || null,
    stripeItemId: r.stripeItemId || null, interval: r.interval || null, seats: Number(r.seats) || 0,
    currentPeriodEnd: toDate(r.currentPeriodEnd), cancelAtPeriodEnd: !!Number(r.cancelAtPeriodEnd), pastDueSince: toDate(r.pastDueSince),
    notified: parseObj(r.notified),
  };
}

/** The workspace's billing record, or null when it is not billed. Never throws. */
export async function billingRow(wsId: number | null | undefined, fresh = false): Promise<BillingRow | null> {
  const n = Number(wsId);
  if (!Number.isInteger(n) || n <= 0) return null;
  const hit = _rows.get(n);
  if (!fresh && hit && Date.now() - hit.at < TTL) return hit.v;
  let v: BillingRow | null = null;
  try {
    const db: any = await getDb();
    // No database: keep the last known answer rather than treating a billed workspace as unbilled (Audit 3).
    if (!db) return hit ? hit.v : null;
    const rows: any[] = await db.select().from(workspaceBilling).where(eq(workspaceBilling.workspaceId, n)).limit(1);
    v = shape(rows && rows[0], n);
  } catch {
    // A failed read is not "no billing row": keep the last known row, and cache nothing.
    return hit ? hit.v : null;
  }
  _rows.set(n, { at: Date.now(), v });
  return v;
}

async function writeRow(wsId: number, set: Record<string, any>): Promise<void> {
  const db: any = await getDb();
  if (!db) throw new Error("Database unavailable");
  const v: any = { ...set };
  if (v.notified && typeof v.notified !== "string") v.notified = JSON.stringify(v.notified);
  await db.insert(workspaceBilling).values({ workspaceId: wsId, plan: "comped", status: "comped", ...v }).onDuplicateKeyUpdate({ set: v });
  invalidateBilling(wsId);
  try { (await import("./workspace")).invalidateWorkspace(wsId); } catch { /* cache only */ }
}

/** What the row means right now. Pure: the tests call it with fixed clocks. */
export function entitlementOf(row: BillingRow | null, plan: Plan | null, graceDays: number, now = Date.now(), trialCaps?: { ai: number; email: number } | null): Entitlement {
  if (!row) {
    return { billed: false, status: "none", plan: null, planName: null, locked: false, lockReason: null, trialEndsAt: null, trialDaysLeft: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null, interval: null, hasSubscription: false, seats: 0, limits: null };
  }
  const base: Entitlement = {
    billed: row.status !== "comped", status: row.status, plan: row.plan || null, planName: plan?.name || (row.status === "comped" ? "Complimentary" : row.plan || null),
    locked: false, lockReason: null,
    trialEndsAt: row.trialEndsAt ? row.trialEndsAt.toISOString() : null, trialDaysLeft: null,
    currentPeriodEnd: row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null, cancelAtPeriodEnd: row.cancelAtPeriodEnd, graceEndsAt: null,
    interval: row.interval, hasSubscription: !!row.stripeSubscriptionId && (row.status === "active" || row.status === "past_due" || row.status === "trialing"), seats: row.seats,
    limits: plan ? limitsOf(plan) : null,
  };
  if (row.status === "trialing") {
    const end = row.trialEndsAt ? row.trialEndsAt.getTime() : 0;
    // (a minute's slack: "14 days" on the day it starts, not 15 because the stored time was rounded up)
    base.trialDaysLeft = end <= now ? 0 : Math.max(1, Math.ceil((end - now - 60_000) / DAY));
    // a trial that continues inside a Stripe subscription is Stripe's to end (it becomes active or past_due)
    if (end <= now && !row.stripeSubscriptionId) { base.status = "trial_ended"; base.locked = true; base.lockReason = "trial_ended"; }
    // Audit 3: a FREE trial (no card yet) gets small daily AI / email allowances whatever the trial plan allows
    if (!row.stripeSubscriptionId && base.limits && trialCaps) {
      base.limits = { ...base.limits, ai: Math.min(base.limits.ai, trialCaps.ai), email: Math.min(base.limits.email, trialCaps.email) };
    }
  } else if (row.status === "past_due") {
    const since = row.pastDueSince ? row.pastDueSince.getTime() : now;
    const end = since + graceDays * DAY;
    base.graceEndsAt = new Date(end).toISOString();
    if (end <= now) { base.locked = true; base.lockReason = "unpaid"; }
  } else if (row.status === "canceled") {
    base.locked = true; base.lockReason = "canceled";
  }
  return base;
}

export async function entitlement(wsId: number | null | undefined): Promise<Entitlement> {
  const row = await billingRow(wsId);
  if (!row) return entitlementOf(null, null, 0);
  const cfg = await billingConfig();
  return entitlementOf(row, cfg.plans.find((p) => p.key === row.plan) || null, cfg.graceDays, Date.now(), { ai: cfg.trialAi, email: cfg.trialEmail });
}
/** Is the workspace locked for non-payment? Cheap (cached row); never throws. */
export async function isBillingLocked(wsId: number | null | undefined): Promise<boolean> {
  try { return (await entitlement(wsId)).locked; } catch { return false; }
}
/** The plan's daily allowance for a bucket, or null when no plan limits this workspace. */
export async function planDailyLimit(wsId: number | null | undefined, bucket: "ai" | "email"): Promise<number | null> {
  try { const l = (await entitlement(wsId)).limits; return l ? l[bucket] : null; } catch { return null; }
}

// ── head count and storage against the plan ─────────────────────────────────
export async function memberCount(wsId: number): Promise<number> {
  const db: any = await getDb();
  if (!db) return 0;
  // tenancy: one workspace's head count
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(users).where(eq(users.workspaceId, wsId));
  return Number(r?.n || 0);
}
async function pendingInvites(wsId: number): Promise<number> {
  const db: any = await getDb();
  if (!db) return 0;
  try {
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(teamInvites)
      .where(and(eq(teamInvites.workspaceId, wsId), sql`${teamInvites.acceptedAt} IS NULL`, sql`${teamInvites.expiresAt} > NOW()`));
    return Number(r?.n || 0);
  } catch { return 0; }
}
/**
 * Room for one more person? `countInvites` also counts invitations that are
 * still open (used when sending one), so a plan for 5 cannot have 5 members
 * and 20 invitations out.
 */
export async function seatCheck(wsId: number | null | undefined, opts: { countInvites?: boolean; adding?: number } = {}): Promise<{ ok: boolean; limit: number | null; used: number; planName: string | null }> {
  const ent = await entitlement(wsId);
  const limit = ent.limits ? ent.limits.members : null;
  if (limit == null || !wsId) return { ok: true, limit: null, used: 0, planName: ent.planName };
  const used = (await memberCount(Number(wsId))) + (opts.countInvites ? await pendingInvites(Number(wsId)) : 0);
  return { ok: used + (opts.adding ?? 1) <= limit, limit, used, planName: ent.planName };
}
export function seatMessage(c: { limit: number | null; planName: string | null }): string {
  return `This workspace's plan${c.planName ? ` (${c.planName})` : ""} allows ${c.limit} ${c.limit === 1 ? "person" : "people"}. The owner can change the plan in Workspace settings → Plan & billing.`;
}
const _storage = new Map<number, { at: number; bytes: number }>();
export async function storageUsedBytes(wsId: number, fresh = false): Promise<number> {
  const hit = _storage.get(wsId);
  if (!fresh && hit && Date.now() - hit.at < 60_000) return hit.bytes;
  let bytes = 0;
  try {
    const db: any = await getDb();
    if (db) {
      const [r] = await db.select({ n: sql<number>`coalesce(sum(${files.size}), 0)` }).from(files).where(and(eq(files.workspaceId, wsId), eq(files.store, "platform")));
      bytes = Number(r?.n || 0);
    }
  } catch { bytes = 0; }
  _storage.set(wsId, { at: Date.now(), bytes });
  return bytes;
}
/** Throws (with a message for the person) when a file of `bytes` would pass the plan's LevelUp-storage allowance. */
export async function assertStorageRoom(wsId: number | null | undefined, bytes: number): Promise<void> {
  const n = Number(wsId);
  if (!Number.isInteger(n) || n <= 0) return;
  const ent = await entitlement(n);
  const mb = ent.limits ? ent.limits.storageMb : null;
  if (mb == null) return;
  const used = await storageUsedBytes(n);
  if (used + Math.max(0, bytes) > mb * 1024 * 1024) {
    throw new Error(`This workspace has used its file storage (${mb >= 1024 ? Math.round(mb / 102.4) / 10 + " GB" : mb + " MB"} on the ${ent.planName || "current"} plan). The owner can change the plan, or connect the workspace's own storage, in Workspace settings.`);
  }
  _storage.set(n, { at: Date.now(), bytes: used + Math.max(0, bytes) });
}

// ── trials and the operator's hand ──────────────────────────────────────────
/** Can a new self-serve workspace be put on a trial at all? (Stripe set up and something to buy.) */
export async function sellable(): Promise<boolean> {
  if (!stripeConfigured()) return false;
  return (await billingConfig()).plans.some((p) => p.public && (p.priceMonthly || p.priceYearly));
}
/**
 * The key one person's free trial is remembered by (Audit 3): the address in lower case,
 * without a "+tag", and for Gmail without dots — so x+1@, x+2@ and x.y@gmail.com are one person.
 */
export function trialEmailKey(email: string | null | undefined): string | null {
  const e = String(email || "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return null;
  let local = e.slice(0, at), domain = e.slice(at + 1);
  local = local.split("+")[0];
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  if (!local) return null;
  return crypto.createHash("sha256").update(`${local}@${domain}`).digest("hex");
}
/**
 * Claim this person's one free trial. True = granted (first time for this address AND login);
 * false = they had one before. Atomic (INSERT IGNORE on the key), so two requests at once
 * cannot both win. Never throws: a failure counts as "had one" (no free trial on doubt).
 */
export async function claimTrial(email: string | null | undefined, loginId: number | null, wsId: number): Promise<boolean> {
  try {
    const key = trialEmailKey(email);
    const db: any = await getDb();
    if (!key || !db) return false;
    if (loginId) {
      // tenancy: platform — has this login (whatever its address now) had a trial?
      const [had] = await db.select({ k: trialClaims.emailKey }).from(trialClaims).where(eq(trialClaims.loginId, loginId)).limit(1);
      if (had) return false;
    }
    const res: any = await db.execute(sql`INSERT IGNORE INTO trial_claims (emailKey, loginId, workspaceId) VALUES (${key}, ${loginId}, ${wsId})`);
    return Number(res?.[0]?.affectedRows ?? res?.affectedRows ?? 0) === 1;
  } catch (e) { console.error("[billing] trial claim failed:", (e as any)?.message || e); return false; }
}

/**
 * Start the billing of a NEW self-serve workspace. `trial: false` (this person already had
 * their free trial) puts it on the trial plan with the trial already over: locked until a plan
 * is chosen. Throws when nothing can be bought (Audit 3: it used to leave the workspace with no
 * billing row — not billed, for ever).
 */
export async function startTrial(wsId: number, now = Date.now(), opts: { trial?: boolean } = {}): Promise<BillingRow | null> {
  if (!(await sellable())) throw new Error("Nothing can be bought on this LevelUp yet, so a new workspace can't be started.");
  const cfg = await billingConfig();
  const days = opts.trial === false ? 0 : cfg.trialDays;
  await writeRow(wsId, { plan: cfg.trialPlan, status: "trialing", trialEndsAt: days > 0 ? new Date(now + days * DAY) : alreadyOver(), notified: days > 0 ? {} : { trialEnded: new Date(now).toISOString() } });
  return billingRow(wsId, true);
}
/** The operator's override. `none` removes billing from the workspace altogether. */
/** "Already over": MySQL rounds a timestamp to the nearest second, so "now" can be stored up to half
 *  a second in the FUTURE and read as a trial still running. One second back is over on any clock. */
const alreadyOver = () => new Date(Date.now() - 1000);

export async function operatorSet(wsId: number, o: { mode: "none" | "comped" | "trial"; plan?: string; trialDays?: number }): Promise<Entitlement> {
  const db: any = await getDb();
  if (!db) throw new Error("Database unavailable");
  const cur = await billingRow(wsId, true);
  if (cur?.stripeSubscriptionId && (cur.status === "active" || cur.status === "past_due" || (cur.status === "trialing"))) {
    throw new Error("This workspace has a Stripe subscription. Cancel it in Stripe (or from the workspace's billing page) before changing its billing by hand.");
  }
  if (o.mode === "none") {
    await db.delete(workspaceBilling).where(eq(workspaceBilling.workspaceId, wsId));
    invalidateBilling(wsId);
  } else if (o.mode === "comped") {
    const plan = o.plan && (await planByKey(o.plan)) ? o.plan : "comped";
    await writeRow(wsId, { plan, status: "comped", trialEndsAt: null, pastDueSince: null, cancelAtPeriodEnd: 0, stripeSubscriptionId: null, stripeItemId: null, notified: {} });
  } else {
    const cfg = await billingConfig();
    const plan = o.plan && (await planByKey(o.plan)) ? o.plan : cfg.trialPlan;
    const days = Math.min(365, Math.max(0, Math.round(Number(o.trialDays ?? cfg.trialDays))));
    await writeRow(wsId, { plan, status: "trialing", trialEndsAt: days > 0 ? new Date(Date.now() + days * DAY) : alreadyOver(), pastDueSince: null, cancelAtPeriodEnd: 0, stripeSubscriptionId: null, stripeItemId: null, notified: {} });
  }
  return entitlement(wsId);
}

// ── Stripe ──────────────────────────────────────────────────────────────────
const _prices = new Map<string, { at: number; v: PriceInfo | null }>();
export type PriceInfo = { id: string; amount: number; currency: string; interval: string; perSeat?: boolean };
async function priceInfo(id: string): Promise<PriceInfo | null> {
  if (!id || !stripeConfigured()) return null;
  const hit = _prices.get(id);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.v;
  let v: PriceInfo | null = null;
  try {
    const p: any = await stripeCall("GET", `/v1/prices/${encodeURIComponent(id)}`);
    if (p && p.active !== false && p.recurring) v = { id, amount: Number(p.unit_amount) || 0, currency: String(p.currency || "usd"), interval: String(p.recurring.interval || "month") };
  } catch (e) { console.error("[billing] could not read price", id, (e as any)?.message || e); v = null; }
  _prices.set(id, { at: Date.now(), v });
  return v;
}
/** The plans a customer can be shown, with the amounts Stripe will charge. */
export async function publicPlans(): Promise<Array<Omit<Plan, "priceMonthly" | "priceYearly"> & { monthly: PriceInfo | null; yearly: PriceInfo | null; buyable: boolean }>> {
  const cfg = await billingConfig();
  const out = [];
  for (const p of cfg.plans.filter((x) => x.public)) {
    const [monthly, yearly] = await Promise.all([priceInfo(p.priceMonthly), priceInfo(p.priceYearly)]);
    const { priceMonthly: _m, priceYearly: _y, ...rest } = p;
    out.push({ ...rest, monthly, yearly, buyable: !!(monthly || yearly) });
  }
  return out;
}

async function ownerContact(wsId: number): Promise<{ id: number; email: string | null; name: string | null } | null> {
  const { getWorkspace } = await import("./workspace");
  const ws = await getWorkspace(wsId);
  if (!ws || !ws.ownerUserId) return null;
  const db: any = await getDb();
  if (!db) return null;
  const [m] = await db.select({ id: users.id, email: users.email, name: users.name, accountId: users.accountId }).from(users).where(eq(users.id, ws.ownerUserId)).limit(1);
  if (!m) return null;
  let email = m.email || null;
  if (!email && m.accountId) {
    const [a] = await db.select({ email: users.email }).from(users).where(eq(users.id, m.accountId)).limit(1);
    email = a?.email || null;
  }
  return { id: Number(m.id), email, name: m.name || null };
}

async function ensureCustomer(wsId: number): Promise<string> {
  const row = await billingRow(wsId, true);
  if (row?.stripeCustomerId) return row.stripeCustomerId;
  const { getWorkspace } = await import("./workspace");
  const ws = await getWorkspace(wsId);
  const owner = await ownerContact(wsId);
  const c: any = await stripeCall("POST", "/v1/customers", {
    name: ws?.name || `Workspace ${wsId}`, email: owner?.email || undefined, metadata: { workspaceId: String(wsId) },
  }, { idempotencyKey: `lu-customer-${wsId}` });
  if (!c?.id) throw new Error("Stripe did not create a customer");
  if (row) await writeRow(wsId, { stripeCustomerId: c.id });
  else await writeRow(wsId, { plan: (await billingConfig()).trialPlan, status: "trialing", trialEndsAt: alreadyOver(), stripeCustomerId: c.id, notified: {} });
  return c.id;
}

/** A Stripe Checkout page for this workspace and plan. Returns the URL to send the owner to. */
export async function createCheckout(wsId: number, planKey: string, interval: "month" | "year"): Promise<string> {
  const cfg = await billingConfig();
  const plan = cfg.plans.find((p) => p.key === planKey && p.public);
  const price = plan ? (interval === "year" ? plan.priceYearly : plan.priceMonthly) : "";
  if (!plan || !price) throw new Error("That plan is not available.");
  const row0 = await billingRow(wsId, true);
  // Audit 3: a workspace that is not billed has nothing to pay for — a checkout here used to create
  // a billing row with an already-ended trial, locking the workspace if the owner then walked away.
  if (!row0) throw new Error("This workspace is not on a paid plan, so there is nothing to pay for.");
  if (row0?.stripeSubscriptionId && (row0.status === "active" || row0.status === "past_due" || row0.status === "trialing")) {
    throw new Error("This workspace already has a subscription. Use “Manage billing” to change it.");
  }
  const people = await memberCount(wsId);
  if (plan.members != null && people > plan.members) {
    throw new Error(`The ${plan.name} plan allows ${plan.members} ${plan.members === 1 ? "person" : "people"}; this workspace has ${people}. Choose a larger plan or remove members first.`);
  }
  const customer = await ensureCustomer(wsId);
  const row = await billingRow(wsId, true);
  const params: Record<string, any> = {
    mode: "subscription", customer, client_reference_id: String(wsId),
    line_items: [{ price, quantity: plan.perSeat ? Math.max(1, people) : 1 }],
    success_url: `${appOrigin()}/?billing=success`, cancel_url: `${appOrigin()}/?billing=cancelled`,
    allow_promotion_codes: true,
    metadata: { workspaceId: String(wsId), plan: plan.key },
    subscription_data: { metadata: { workspaceId: String(wsId), plan: plan.key } },
  };
  // days left in the free trial are kept: the card is not charged until it ends (Stripe needs ≥ 48 h)
  const trialEnd = row?.status === "trialing" && row.trialEndsAt ? row.trialEndsAt.getTime() : 0;
  if (trialEnd - Date.now() > 49 * 3_600_000) params.subscription_data.trial_end = Math.floor(trialEnd / 1000);
  if (cfg.automaticTax) { params.automatic_tax = { enabled: true }; params.customer_update = { address: "auto", name: "auto" }; }
  // Audit 3: only one Checkout page at a time — an older page still open in another tab could be paid
  // as well, giving the workspace two subscriptions. Expire it first (an already used / expired page is fine).
  const prev = row?.notified && typeof row.notified.checkout === "string" ? row.notified.checkout : "";
  if (prev) { try { await stripeCall("POST", `/v1/checkout/sessions/${encodeURIComponent(prev)}/expire`); } catch { /* used or expired already */ } }
  const s: any = await stripeCall("POST", "/v1/checkout/sessions", params);
  if (!s?.url) throw new Error("Stripe did not return a checkout page");
  if (s.id) { try { const r = await billingRow(wsId, true); await writeRow(wsId, { notified: { ...(r?.notified || {}), checkout: String(s.id) } }); } catch { /* best effort */ } }
  return String(s.url);
}

/**
 * The portal settings LevelUp opens Stripe's portal with: card, invoices, billing details and
 * cancelling — but NOT changing plan or quantity (Audit 3: the portal skipped LevelUp's head-count
 * check and could pick prices LevelUp does not know; plans change inside LevelUp now). Created once,
 * remembered; if Stripe refuses, the account's default portal is used.
 */
let _portalCfg: { at: number; id: string | null } | null = null;
async function portalConfiguration(): Promise<string | null> {
  if (_portalCfg && Date.now() - _portalCfg.at < 6 * 3600_000) return _portalCfg.id;
  let id: string | null = null;
  try {
    const saved = await getSystemSetting("billingPortalConfig");
    if (saved && /^bpc_[A-Za-z0-9_]+$/.test(String(saved))) id = String(saved);
    else {
      const c: any = await stripeCall("POST", "/v1/billing_portal/configurations", {
        features: {
          customer_update: { enabled: true, allowed_updates: ["email", "address", "name", "tax_id"] },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end" },
          subscription_update: { enabled: false },
        },
      }, { idempotencyKey: "lu-portal-config-v1" });
      if (c?.id) { id = String(c.id); await setSystemSetting("billingPortalConfig", id); }
    }
  } catch (e) { console.error("[billing] could not set up the billing portal settings:", (e as any)?.message || e); id = null; }
  _portalCfg = { at: Date.now(), id };
  return id;
}

/** Stripe's customer portal (card, invoices, cancel). */
export async function createPortal(wsId: number): Promise<string> {
  const row = await billingRow(wsId, true);
  if (!row?.stripeCustomerId) throw new Error("This workspace has no billing account yet. Choose a plan first.");
  const configuration = await portalConfiguration();
  const base = { customer: row.stripeCustomerId, return_url: `${appOrigin()}/?billing=portal` };
  let s: any;
  try { s = await stripeCall("POST", "/v1/billing_portal/sessions", { ...base, ...(configuration ? { configuration } : {}) }); }
  catch (e) {
    // a remembered configuration from another Stripe account / mode: forget it and use the default portal
    if (!configuration || !(e instanceof StripeError) || e.status >= 500) throw e;
    try { await setSystemSetting("billingPortalConfig", ""); } catch { /* best effort */ }
    _portalCfg = null;
    s = await stripeCall("POST", "/v1/billing_portal/sessions", base);
  }
  if (!s?.url) throw new Error("Stripe did not return a billing page");
  return String(s.url);
}

async function wsOfSubscription(sub: any, hint?: number | null): Promise<number | null> {
  const db: any = await getDb();
  if (!db) return null;
  const cust = typeof sub?.customer === "string" ? sub.customer : sub?.customer?.id;
  if (cust) {
    // tenancy: platform — which workspace a Stripe customer id (from a signed webhook) belongs to
    const rows: any[] = await db.select({ w: workspaceBilling.workspaceId }).from(workspaceBilling).where(eq(workspaceBilling.stripeCustomerId, cust)).limit(1);
    if (rows[0]) return Number(rows[0].w);
  }
  const meta = Number(sub?.metadata?.workspaceId);
  const n = Number.isInteger(meta) && meta > 0 ? meta : Number(hint);
  if (!Number.isInteger(n) || n <= 0) return null;
  // only a workspace that exists and is not tied to a DIFFERENT Stripe customer
  const { getWorkspace } = await import("./workspace");
  if (!(await getWorkspace(n))) return null;
  const row = await billingRow(n, true);
  if (row?.stripeCustomerId && cust && row.stripeCustomerId !== cust) return null;
  return n;
}

/** Copy a Stripe subscription's current state onto the workspace. */
const liveStripe = (s: any) => s === "active" || s === "trialing" || s === "past_due" || s === "unpaid";
const liveRow = (s: any) => s === "active" || s === "past_due" || s === "trialing";

/** Stop a subscription at once (404 = already gone). Throws on any other failure. */
async function stripeCancelNow(subId: string): Promise<void> {
  try { await stripeCall("DELETE", `/v1/subscriptions/${encodeURIComponent(subId)}`); }
  catch (e) { if (!(e instanceof StripeError && e.status === 404)) throw e; }
}

export async function applySubscription(sub: any, hint?: number | null): Promise<{ workspaceId: number; status: BillingStatus } | null> {
  if (!sub || !sub.id) return null;
  const st = String(sub.status || "");
  const wsId = await wsOfSubscription(sub, hint);
  if (!wsId) {
    console.error("[billing] subscription", sub.id, "belongs to no workspace here");
    // Audit 3: one of OUR subscriptions (it names a workspace) whose workspace is gone must not go on charging.
    const metaWs = Number(sub?.metadata?.workspaceId);
    if (liveStripe(st) && Number.isInteger(metaWs) && metaWs > 0 && stripeConfigured()) {
      const { getWorkspace } = await import("./workspace");
      if (!(await getWorkspace(metaWs))) {
        try { await stripeCancelNow(sub.id); console.error("[billing] cancelled subscription", sub.id, "— its workspace", metaWs, "no longer exists"); }
        catch (e) { console.error("[billing] could not cancel orphaned subscription", sub.id, (e as any)?.message || e); }
      }
    }
    return null;
  }
  const row = await billingRow(wsId, true);
  // an old subscription's late event must not overwrite the current one
  if (row?.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id && liveRow(row.status) && st !== "active" && st !== "trialing") return null;
  // Audit 3: a SECOND live subscription (two Checkout pages, both paid) — keep the one already on the
  // workspace while Stripe still has it live, and stop the new one so the customer is not charged twice.
  if (row?.stripeSubscriptionId && row.stripeSubscriptionId !== sub.id && liveRow(row.status) && liveStripe(st)) {
    let currentLive = true;
    try { const cur: any = await stripeCall("GET", `/v1/subscriptions/${encodeURIComponent(row.stripeSubscriptionId)}`); currentLive = liveStripe(String(cur?.status || "")); }
    catch (e) { if (e instanceof StripeError && e.status === 404) currentLive = false; }
    if (currentLive) {
      try {
        await stripeCancelNow(sub.id);
        console.error(`[billing] workspace ${wsId} paid for a second subscription (${sub.id}); it was cancelled — refund its first payment in Stripe`);
      } catch (e) { console.error(`[billing] workspace ${wsId} has a second live subscription ${sub.id} that could not be cancelled:`, (e as any)?.message || e); }
      return { workspaceId: wsId, status: row.status };
    }
  }
  // Audit 3: "incomplete" = the first payment has not gone through yet. It changes nothing: it becomes
  // active once paid, or incomplete_expired (→ canceled). It used to start a free grace period.
  if (st === "incomplete") return row ? { workspaceId: wsId, status: row.status } : null;
  const item = sub.items?.data?.[0] || null;
  const price = item?.price?.id || item?.plan?.id || null;
  const found = await planByPrice(price);
  const status: BillingStatus = st === "trialing" ? "trialing" : st === "active" ? "active" : st === "canceled" || st === "incomplete_expired" || st === "paused" ? "canceled" : "past_due";
  // Audit 3: a live subscription on a workspace that has been closed is stopped (closing could not reach Stripe).
  if (status !== "canceled" && stripeConfigured()) {
    const { getWorkspace } = await import("./workspace");
    const ws: any = await getWorkspace(wsId);
    if (ws && (String(ws.status || "active") === "deleted" || ws.deletedAt)) {
      try { await stripeCancelNow(sub.id); await writeRow(wsId, { status: "canceled", stripeSubscriptionId: sub.id, cancelAtPeriodEnd: 0 }); return { workspaceId: wsId, status: "canceled" }; }
      catch (e) { console.error(`[billing] closed workspace ${wsId} still has live subscription ${sub.id}:`, (e as any)?.message || e); }
    }
  }
  const periodEnd = sub.current_period_end ?? item?.current_period_end ?? null;
  const cust = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  const set: Record<string, any> = {
    status, stripeSubscriptionId: sub.id, stripeItemId: item?.id || null, stripeCustomerId: cust || row?.stripeCustomerId || null,
    seats: Number(item?.quantity) || 1,
    currentPeriodEnd: periodEnd ? new Date(Number(periodEnd) * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ? 1 : 0,
    trialEndsAt: sub.trial_end ? new Date(Number(sub.trial_end) * 1000) : (status === "trialing" ? row?.trialEndsAt ?? null : null),
    pastDueSince: status === "past_due" ? (row?.status === "past_due" && row.pastDueSince ? row.pastDueSince : new Date()) : null,
  };
  // Audit 3: "unpaid" = Stripe has given up retrying. No fresh grace period: locked at once.
  if (st === "unpaid") {
    const cfg = await billingConfig();
    const already = row?.status === "past_due" && row.pastDueSince ? row.pastDueSince.getTime() : Date.now();
    set.pastDueSince = new Date(Math.min(already, Date.now() - cfg.graceDays * DAY - 1000));
  }
  if (found) { set.plan = found.plan.key; set.interval = found.interval; }
  else if (!row) set.plan = String(sub.metadata?.plan || (await billingConfig()).trialPlan);
  if (status === "active" && row?.status !== "active") set.notified = {};
  await writeRow(wsId, set);
  return { workspaceId: wsId, status };
}

/** Read the subscription from Stripe and apply it (after Checkout returns, and for every webhook). */
export async function refreshSubscription(subId: string, hint?: number | null) {
  const sub: any = await stripeCall("GET", `/v1/subscriptions/${encodeURIComponent(subId)}`);
  return applySubscription(sub, hint);
}
export async function refreshWorkspace(wsId: number): Promise<Entitlement> {
  const row = await billingRow(wsId, true);
  if (row?.stripeSubscriptionId && stripeConfigured()) {
    try { await refreshSubscription(row.stripeSubscriptionId, wsId); } catch (e) { console.error("[billing] refresh failed for workspace", wsId, (e as any)?.message || e); }
  } else if (row?.stripeCustomerId && stripeConfigured()) {
    // Checkout may have finished before the webhook arrived: look for the customer's subscription
    try {
      const list: any = await stripeCall("GET", "/v1/subscriptions", { customer: row.stripeCustomerId, status: "all", limit: 3 });
      const live = (list?.data || []).find((s: any) => s.status === "active" || s.status === "trialing" || s.status === "past_due");
      if (live) await applySubscription(live, wsId);
    } catch (e) { console.error("[billing] lookup failed for workspace", wsId, (e as any)?.message || e); }
  }
  return entitlement(wsId);
}

/**
 * One webhook event. Returns what happened (for the log). Each event id is
 * handled once; if handling fails the claim is released so Stripe's retry
 * gets another go.
 */
export async function handleStripeEvent(evt: any): Promise<{ handled: boolean; note?: string }> {
  const id = String(evt?.id || "");
  const type = String(evt?.type || "");
  if (!id || !type) return { handled: false, note: "not an event" };
  const db: any = await getDb();
  if (!db) throw new Error("Database unavailable");
  const obj = evt.data?.object || {};
  let subId: string | null = null;
  let hint: number | null = null;
  if (type === "checkout.session.completed") {
    if (obj.mode !== "subscription") return { handled: false, note: "not a subscription checkout" };
    subId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id || null;
    hint = Number(obj.client_reference_id) || null;
  } else if (type.startsWith("customer.subscription.")) {
    subId = obj.id || null;
  } else if (type === "invoice.payment_failed" || type === "invoice.paid" || type === "invoice.payment_succeeded") {
    subId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id || null;
  } else return { handled: false, note: "ignored" };
  if (!subId) return { handled: false, note: "no subscription on the event" };

  const res: any = await db.execute(sql`INSERT IGNORE INTO billing_events (eventId, type) VALUES (${id}, ${type.slice(0, 64)})`);
  const affected = Number(res?.[0]?.affectedRows ?? res?.affectedRows ?? 0);
  if (affected === 0) return { handled: false, note: "duplicate" };
  try {
    let applied: { workspaceId: number; status: BillingStatus } | null = null;
    try {
      applied = await refreshSubscription(subId, hint);
    } catch (e) {
      // a deleted subscription can no longer be read on some accounts: the event's own copy is final
      if (type === "customer.subscription.deleted" && e instanceof StripeError && e.status === 404) applied = await applySubscription({ ...obj, status: "canceled" }, hint);
      else throw e;
    }
    // tenancy: platform — the webhook ledger, by event id
    if (applied) await db.update(billingEvents).set({ workspaceId: applied.workspaceId }).where(eq(billingEvents.eventId, id));
    return { handled: !!applied, note: applied ? `workspace ${applied.workspaceId} → ${applied.status}` : "no workspace" };
  } catch (e) {
    // tenancy: platform — the webhook ledger, by event id
    try { await db.delete(billingEvents).where(eq(billingEvents.eventId, id)); } catch { /* the retry will be a duplicate; refresh covers it */ }
    throw e;
  }
}

// ── invoices and changing plan inside LevelUp (build -283) ──────────────────
export type InvoiceView = {
  id: string; number: string | null; date: string | null;
  /** in the currency's smallest unit (cents) */
  amount: number; currency: string;
  status: "paid" | "open" | "void" | "uncollectible";
  description: string | null; periodStart: string | null; periodEnd: string | null;
  /** Stripe's own invoice page / PDF */
  url: string | null; pdf: string | null;
};
const isoOf = (unix: any): string | null => { const n = Number(unix); return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : null; };

/** The workspace's invoices, newest first, as Stripe has them. A workspace with no billing account has none. */
export async function listInvoices(wsId: number, limit = 24): Promise<InvoiceView[]> {
  const row = await billingRow(wsId, true);
  if (!row?.stripeCustomerId || !stripeConfigured()) return [];
  const cust = row.stripeCustomerId;
  const list: any = await stripeCall("GET", "/v1/invoices", { customer: cust, limit: Math.max(1, Math.min(100, Math.floor(limit) || 24)) });
  const out: InvoiceView[] = [];
  for (const i of (Array.isArray(list?.data) ? list.data : [])) {
    if (!i || !i.id) continue;
    // only this workspace's own customer, whatever the answer holds
    if ((typeof i.customer === "string" ? i.customer : i.customer?.id) !== cust) continue;
    const st = String(i.status || "");
    if (st !== "paid" && st !== "open" && st !== "void" && st !== "uncollectible") continue;      // drafts are Stripe's working copies
    const line = i.lines?.data?.[0] || null;
    out.push({
      id: String(i.id), number: i.number ? String(i.number).slice(0, 60) : null, date: isoOf(i.created),
      amount: Number(i.total ?? i.amount_due ?? 0) || 0, currency: String(i.currency || "usd").toLowerCase().slice(0, 8),
      status: st as InvoiceView["status"],
      description: line?.description ? String(line.description).slice(0, 200) : null,
      periodStart: isoOf(line?.period?.start ?? i.period_start), periodEnd: isoOf(line?.period?.end ?? i.period_end),
      url: stripeHostedUrl(i.hosted_invoice_url), pdf: stripeHostedUrl(i.invoice_pdf),
    });
  }
  return out;
}

/**
 * Move a workspace that already pays to another plan, or between monthly and
 * yearly, without leaving LevelUp. Stripe credits the unused part of the
 * current period and charges the difference (proration). Returns the new state.
 */
export async function changePlan(wsId: number, planKey: string, interval: "month" | "year", prorationDate?: number | null, nowMs = Date.now()): Promise<Entitlement> {
  const { plan, price, row, quantity } = await planChangeTarget(wsId, planKey, interval);
  // the moment the preview was priced at, so the charge is the amount the owner saw (within the hour only)
  const at = Math.floor(Number(prorationDate));
  const nowS = Math.floor(nowMs / 1000);
  const pin = Number.isFinite(at) && at <= nowS + 300 && at >= nowS - 3600 ? Math.min(at, nowS) : null;
  const sub: any = await stripeCall("POST", `/v1/subscriptions/${encodeURIComponent(row.stripeSubscriptionId!)}`, {
    items: [{ id: row.stripeItemId, price, quantity }],
    // Audit 3: the difference is invoiced NOW, and the new plan only applies once that invoice is paid
    // (pending_if_incomplete) — a change used to apply at once and be paid for later, or never.
    proration_behavior: "always_invoice",
    payment_behavior: "pending_if_incomplete",
    ...(pin ? { proration_date: pin } : {}),
    // A double click inside the same minute is one change. The key names the plan it changes FROM too:
    // A→B, B→A, A→B within a minute are three changes (the third used to replay the first's answer).
  }, { idempotencyKey: `lu-plan-${wsId}-${row.stripeSubscriptionId}-${row.plan}.${row.interval || "month"}-${price}-${Math.floor(nowMs / 60_000)}` });
  if (!sub?.id) throw new Error("Stripe did not confirm the change");
  // Read the subscription back rather than trusting the answer (a replayed answer is an old state).
  try { await refreshSubscription(sub.id, wsId); } catch { await applySubscription(sub, wsId); }
  if (sub.pending_update) {
    throw new Error("The payment for the new plan did not go through, so the plan has not changed yet. Update the card in Manage billing — the change applies once it is paid.");
  }
  return entitlement(wsId);
}

export type PlanChangePreview = {
  plan: string; planName: string; interval: "month" | "year"; currency: string;
  /** unix seconds the amounts were worked out at — sent back with the change so Stripe charges the same */
  prorationDate: number;
  /** monthly ↔ yearly on a paying subscription: Stripe starts a new billing period and invoices at once */
  chargedNow: boolean;
  /** charged to the card today (cents); 0 unless chargedNow */
  dueNow: number;
  /** the invoice the change leads to — today's when chargedNow, otherwise the next renewal (cents, may be < 0 = credit) */
  total: number;
  /** the credit/charge for the change itself (proration lines), negative = credit */
  adjustment: number;
  /** what is left over as credit for later invoices (cents) */
  credit: number;
  /** when that invoice is charged (ISO) */
  date: string | null;
  /** the new recurring price for the whole workspace (cents per interval) */
  recurring: number;
  lines: { description: string; amount: number; proration: boolean }[];
};

/**
 * What switching would cost, worked out by Stripe (its upcoming-invoice
 * preview, with the same proration as the change itself). Nothing is changed.
 */
export async function previewPlanChange(wsId: number, planKey: string, interval: "month" | "year", nowMs = Date.now()): Promise<PlanChangePreview> {
  const { plan, price, row, quantity } = await planChangeTarget(wsId, planKey, interval);
  const at = Math.floor(nowMs / 1000);
  const inv: any = await stripeCall("GET", "/v1/invoices/upcoming", {
    ...(row.stripeCustomerId ? { customer: row.stripeCustomerId } : {}),
    subscription: row.stripeSubscriptionId,
    subscription_items: [{ id: row.stripeItemId, price, quantity }],
    // the same proration as the change itself (Audit 3: the difference is invoiced at once)
    subscription_proration_behavior: "always_invoice",
    subscription_proration_date: at,
  });
  const raw: any[] = (Array.isArray(inv?.lines?.data) ? inv.lines.data : []).filter((l: any) => l && typeof l === "object");
  const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n) : 0; };
  const lines = raw.map((l) => ({ description: String(l.description || "").slice(0, 200), amount: num(l.amount), proration: !!l.proration }));
  const total = num(inv?.total ?? lines.reduce((s, l) => s + l.amount, 0));
  // every change on a paying subscription is invoiced at once now (always_invoice); during a trial nothing is charged
  const chargedNow = row.status === "active";
  const pr = await priceInfo(price).catch(() => null);
  return {
    plan: plan.key, planName: plan.name, interval,
    currency: String(inv?.currency || pr?.currency || "usd").toLowerCase().slice(0, 8),
    prorationDate: at, chargedNow,
    dueNow: chargedNow ? Math.max(0, num(inv?.amount_due ?? total)) : 0,
    total,
    adjustment: lines.filter((l) => l.proration).reduce((s, l) => s + l.amount, 0),
    credit: Math.max(0, -total),
    date: chargedNow ? new Date(nowMs).toISOString() : (isoOf(inv?.next_payment_attempt) || isoOf(inv?.period_end) || (row.currentPeriodEnd ? row.currentPeriodEnd.toISOString() : null)),
    recurring: pr ? pr.amount * quantity : 0,
    lines: lines.slice(0, 12),
  };
}

/** The checks both the preview and the change make; the plan, its Stripe price and the quantity to charge for. */
async function planChangeTarget(wsId: number, planKey: string, interval: "month" | "year") {
  const cfg = await billingConfig();
  const plan = cfg.plans.find((p) => p.key === planKey && p.public);
  const price = plan ? (interval === "year" ? plan.priceYearly : plan.priceMonthly) : "";
  if (!plan || !price) throw new Error("That plan is not available.");
  const row = await billingRow(wsId, true);
  if (row?.status === "past_due") throw new Error("The last payment failed. Update the card first (Manage billing), then change the plan.");
  if (!row?.stripeSubscriptionId || !row.stripeItemId || (row.status !== "active" && row.status !== "trialing")) {
    throw new Error("This workspace has no subscription to change. Choose a plan first.");
  }
  if (row.plan === plan.key && row.interval === interval) throw new Error("This workspace is already on that plan.");
  const people = await memberCount(wsId);
  if (plan.members != null && people > plan.members) {
    throw new Error(`The ${plan.name} plan allows ${plan.members} ${plan.members === 1 ? "person" : "people"}; this workspace has ${people}. Choose a larger plan or remove members first.`);
  }
  return { plan, price, row, quantity: plan.perSeat ? Math.max(1, people) : 1 };
}

/** Per-seat plans: keep the subscription's quantity equal to the head count. Never throws. */
export async function syncSeats(wsId: number | null | undefined): Promise<void> {
  try {
    const n = Number(wsId);
    if (!Number.isInteger(n) || n <= 0 || !stripeConfigured()) return;
    const row = await billingRow(n, true);
    if (!row || !row.stripeSubscriptionId || !row.stripeItemId) return;
    if (row.status !== "active" && row.status !== "trialing" && row.status !== "past_due") return;
    const plan = await planByKey(row.plan);
    if (!plan || !plan.perSeat) return;
    const people = Math.max(1, await memberCount(n));
    if (people === row.seats) return;
    await stripeCall("POST", `/v1/subscription_items/${encodeURIComponent(row.stripeItemId)}`, { quantity: people, proration_behavior: "create_prorations" });
    await writeRow(n, { seats: people });
  } catch (e) { console.error("[billing] seat sync failed for workspace", wsId, (e as any)?.message || e); }
}

/**
 * A workspace that is being closed stops being charged at once. Never throws.
 * Returns false when a live subscription could NOT be stopped (Stripe unreachable,
 * or Stripe not configured here) — the daily `cancelClosedSubscriptions` retries it,
 * and the purge waits for it (Audit 3: a failed cancel used to charge for ever).
 */
export async function cancelSubscriptionNow(wsId: number): Promise<boolean> {
  try {
    const row = await billingRow(wsId, true);
    if (!row?.stripeSubscriptionId || row.status === "canceled" || row.status === "comped") return true;
    if (!stripeConfigured()) { console.error("[billing] workspace", wsId, "has a live subscription but Stripe is not configured here; it was not cancelled"); return false; }
    await stripeCancelNow(row.stripeSubscriptionId);
    await writeRow(wsId, { status: "canceled", cancelAtPeriodEnd: 0 });
    return true;
  } catch (e) { console.error("[billing] could not cancel the subscription of workspace", wsId, "— retried daily:", (e as any)?.message || e); return false; }
}

/** Daily: closed workspaces whose subscription is still live (the cancel at closing failed) — try again. */
export async function cancelClosedSubscriptions(): Promise<number> {
  const db: any = await getDb();
  if (!db) return 0;
  // tenancy: platform — billing state only
  const rows: any[] = await db.select({ w: workspaceBilling.workspaceId, s: workspaceBilling.status }).from(workspaceBilling).where(sql`${workspaceBilling.stripeSubscriptionId} IS NOT NULL`);
  const { getWorkspace } = await import("./workspace");
  let n = 0;
  for (const r of rows) {
    if (!liveRow(String(r.s))) continue;
    const ws: any = await getWorkspace(Number(r.w));
    if (ws && String(ws.status || "active") !== "deleted" && !ws.deletedAt) continue;
    if (await cancelSubscriptionNow(Number(r.w))) n++;
  }
  return n;
}

/**
 * Daily: read every live subscription back from Stripe (Audit 3: a missed or misrouted
 * webhook left a workspace on its last known state for ever — e.g. "active" long after
 * the subscription had ended, or a Stripe trial that never turned into a lock).
 */
export async function refreshAllSubscriptions(): Promise<number> {
  const db: any = await getDb();
  if (!db || !stripeConfigured()) return 0;
  // tenancy: platform — billing state only
  const rows: any[] = await db.select({ w: workspaceBilling.workspaceId, s: workspaceBilling.status, sub: workspaceBilling.stripeSubscriptionId }).from(workspaceBilling).where(sql`${workspaceBilling.stripeSubscriptionId} IS NOT NULL`);
  let n = 0;
  for (const r of rows) {
    if (!liveRow(String(r.s)) || !r.sub) continue;
    try { await refreshSubscription(String(r.sub), Number(r.w)); n++; }
    catch (e) {
      if (e instanceof StripeError && e.status === 404) { await writeRow(Number(r.w), { status: "canceled", cancelAtPeriodEnd: 0 }); n++; }
      else console.error("[billing] daily refresh failed for workspace", r.w, (e as any)?.message || e);
    }
  }
  return n;
}

// ── reminders (daily job) ───────────────────────────────────────────────────
const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as any)[c]);
/** Which reminder (if any) is due for a row. Pure. */
export function reminderDue(row: BillingRow, ent: Entitlement, now = Date.now()): null | "trial3" | "trialEnded" | "pastDue" | "locked" {
  const n = row.notified || {};
  if (row.status === "trialing" && !row.stripeSubscriptionId && row.trialEndsAt) {
    const left = row.trialEndsAt.getTime() - now;
    if (left <= 0) return n.trialEnded ? null : "trialEnded";
    if (left <= 3 * DAY && !n.trial3) return "trial3";
  }
  if (row.status === "past_due") {
    if (ent.locked) return n.locked ? null : "locked";
    if (!n.pastDue) return "pastDue";
  }
  return null;
}
export async function billingReminders(now = Date.now()): Promise<number> {
  const db: any = await getDb();
  if (!db) return 0;
  const cfg = await billingConfig();
  // tenancy: platform — billing state only (no workspace content)
  const rows: any[] = await db.select().from(workspaceBilling);
  let sent = 0;
  for (const raw of rows) {
    const row = shape(raw, Number(raw?.workspaceId));
    if (!row || row.status === "comped" || row.status === "active" || row.status === "canceled") continue;
    try {
      const ent = entitlementOf(row, cfg.plans.find((p) => p.key === row.plan) || null, cfg.graceDays, now);
      const due = reminderDue(row, ent, now);
      if (!due) continue;
      const { getWorkspace } = await import("./workspace");
      const ws = await getWorkspace(row.workspaceId);
      if (!ws || ws.status !== "active" || ws.deletedAt) continue;
      const owner = await ownerContact(row.workspaceId);
      // claim first: a mail that cannot be sent is not retried every day for ever
      await writeRow(row.workspaceId, { notified: { ...row.notified, [due]: new Date(now).toISOString() } });
      if (!owner?.email) continue;
      const link = `${appOrigin()}/?billing=open`;
      const name = esc(ws.name);
      const text: Record<string, [string, string]> = {
        trial3: [`Your LevelUp trial ends in ${Math.max(1, ent.trialDaysLeft || 1)} day${(ent.trialDaysLeft || 1) === 1 ? "" : "s"}`, `<p>The free trial of <b>${name}</b> ends on ${esc(row.trialEndsAt?.toISOString().slice(0, 10))}.</p><p>Choose a plan to keep working without a break. Nothing is deleted if you don’t — the workspace is locked until a plan is chosen, and you can export your data at any time.</p>`],
        trialEnded: [`Your LevelUp trial has ended`, `<p>The free trial of <b>${name}</b> has ended and the workspace is locked.</p><p>Choose a plan to carry on where you left off. Your data is kept; you can also export it or close the workspace.</p>`],
        pastDue: [`A payment for LevelUp did not go through`, `<p>The last payment for <b>${name}</b> failed. Please update the card — the workspace keeps working until ${esc((ent.graceEndsAt || "").slice(0, 10))} and is locked after that.</p>`],
        locked: [`Your LevelUp workspace is locked`, `<p><b>${name}</b> has been locked because its payment is still outstanding. Update the card to unlock it at once. Your data is kept.</p>`],
      };
      const [subject, body] = text[due];
      const { sendEmail } = await import("./sendEmail");
      const ok = await sendEmail({
        to: owner.email, subject, kind: "account", workspaceId: row.workspaceId, senderUserId: null,
        html: `${body}<p><a href="${link}">Open Plan &amp; billing</a></p>`,
      } as any);
      if (ok) sent++;
    } catch (e) { console.error("[billing] reminder failed for workspace", row.workspaceId, (e as any)?.message || e); }
  }
  return sent;
}
/** Daily: seat counts of per-seat subscriptions (a safety net behind the live sync). */
export async function syncAllSeats(): Promise<void> {
  const db: any = await getDb();
  if (!db || !stripeConfigured()) return;
  // tenancy: platform — billing state only
  const rows: any[] = await db.select({ w: workspaceBilling.workspaceId }).from(workspaceBilling).where(sql`${workspaceBilling.stripeSubscriptionId} IS NOT NULL`);
  for (const r of rows) await syncSeats(Number(r.w));
}

/** Operator console: one line per billed workspace. */
export async function billingSummaries(): Promise<Map<number, { status: string; plan: string | null; planName: string | null; locked: boolean; trialDaysLeft: number | null; hasSubscription: boolean; seats: number }>> {
  const out = new Map();
  const db: any = await getDb();
  if (!db) return out;
  const cfg = await billingConfig();
  // tenancy: operator — billing state only (no workspace content)
  const rows: any[] = await db.select().from(workspaceBilling);
  for (const raw of rows) {
    const row = shape(raw, Number(raw?.workspaceId));
    if (!row) continue;
    const e = entitlementOf(row, cfg.plans.find((p) => p.key === row.plan) || null, cfg.graceDays);
    out.set(row.workspaceId, { status: e.status, plan: e.plan, planName: e.planName, locked: e.locked, trialDaysLeft: e.trialDaysLeft, hasSubscription: e.hasSubscription, seats: e.seats });
  }
  return out;
}
