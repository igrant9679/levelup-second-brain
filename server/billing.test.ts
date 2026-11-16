/**
 * Build -279 (Phase I): the pure parts of billing — what a billing record
 * means at a given moment, which reminder is due, the plan settings the
 * operator can store, Stripe's form encoding and the webhook signature.
 * (The whole flow against a real MySQL and a fake Stripe is in
 * server/billing.flow.test.ts.)
 */
import { describe, it, expect } from "vitest";
import { entitlementOf, reminderDue, type BillingRow } from "./_core/billing";
import { normalizeConfig, DEFAULT_PLANS } from "./_core/plans";
import { formEncode, signWebhook, verifyWebhook } from "./_core/stripe";
// @ts-ignore — plain ESM helper
import { parseForm } from "../scripts/lib/fake-stripe.mjs";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-20T12:00:00Z");
const team = DEFAULT_PLANS.find((p) => p.key === "team")!;
const row = (o: Partial<BillingRow>): BillingRow => ({
  workspaceId: 7, plan: "team", status: "trialing", trialEndsAt: null, stripeCustomerId: null, stripeSubscriptionId: null, stripeItemId: null,
  interval: null, seats: 0, currentPeriodEnd: null, cancelAtPeriodEnd: false, pastDueSince: null, notified: {}, ...o,
});

describe("what a billing record means", () => {
  it("no record = not billed: no limits, never locked", () => {
    const e = entitlementOf(null, null, 7, NOW);
    expect(e).toMatchObject({ billed: false, status: "none", locked: false, limits: null });
  });
  it("a trial runs on the trial plan's limits and counts down", () => {
    const e = entitlementOf(row({ trialEndsAt: new Date(NOW + 2.2 * DAY) }), team, 7, NOW);
    expect(e).toMatchObject({ billed: true, status: "trialing", locked: false, trialDaysLeft: 3 });
    expect(e.limits).toEqual({ members: 25, ai: 3000, email: 500, storageMb: 20480 });
  });
  it("a trial that ended without a subscription is locked; with one it is Stripe's to end", () => {
    expect(entitlementOf(row({ trialEndsAt: new Date(NOW - 1000) }), team, 7, NOW)).toMatchObject({ status: "trial_ended", locked: true, lockReason: "trial_ended", trialDaysLeft: 0 });
    expect(entitlementOf(row({ trialEndsAt: new Date(NOW - 1000), stripeSubscriptionId: "sub_1" }), team, 7, NOW)).toMatchObject({ status: "trialing", locked: false });
  });
  it("a failed payment keeps working for the grace period, then locks", () => {
    const inGrace = entitlementOf(row({ status: "past_due", pastDueSince: new Date(NOW - 6 * DAY), stripeSubscriptionId: "sub_1" }), team, 7, NOW);
    expect(inGrace).toMatchObject({ status: "past_due", locked: false, hasSubscription: true });
    expect(inGrace.graceEndsAt).toBe(new Date(NOW + DAY).toISOString());
    expect(entitlementOf(row({ status: "past_due", pastDueSince: new Date(NOW - 8 * DAY) }), team, 7, NOW)).toMatchObject({ locked: true, lockReason: "unpaid" });
    expect(entitlementOf(row({ status: "past_due", pastDueSince: new Date(NOW - 1000) }), team, 0, NOW)).toMatchObject({ locked: true });
  });
  it("active is open, canceled is locked, comped is never locked or billed", () => {
    expect(entitlementOf(row({ status: "active", stripeSubscriptionId: "sub_1", seats: 4 }), team, 7, NOW)).toMatchObject({ locked: false, hasSubscription: true, seats: 4 });
    expect(entitlementOf(row({ status: "canceled", stripeSubscriptionId: "sub_1" }), team, 7, NOW)).toMatchObject({ locked: true, lockReason: "canceled", hasSubscription: false });
    const comped = entitlementOf(row({ status: "comped", plan: "comped", trialEndsAt: new Date(NOW - 99 * DAY) }), null, 7, NOW);
    expect(comped).toMatchObject({ billed: false, locked: false, limits: null, planName: "Complimentary" });
    // comped ON a plan: that plan's limits, still never locked
    expect(entitlementOf(row({ status: "comped", plan: "team" }), team, 7, NOW)).toMatchObject({ billed: false, locked: false, limits: { members: 25 } });
  });
});

describe("reminders", () => {
  const ent = (r: BillingRow) => entitlementOf(r, team, 7, NOW);
  it("three days before a trial ends, and once it has ended — each once", () => {
    const far = row({ trialEndsAt: new Date(NOW + 5 * DAY) });
    expect(reminderDue(far, ent(far), NOW)).toBeNull();
    const near = row({ trialEndsAt: new Date(NOW + 2 * DAY) });
    expect(reminderDue(near, ent(near), NOW)).toBe("trial3");
    expect(reminderDue({ ...near, notified: { trial3: "x" } }, ent(near), NOW)).toBeNull();
    const over = row({ trialEndsAt: new Date(NOW - DAY), notified: { trial3: "x" } });
    expect(reminderDue(over, ent(over), NOW)).toBe("trialEnded");
    expect(reminderDue({ ...over, notified: { trial3: "x", trialEnded: "x" } }, ent(over), NOW)).toBeNull();
  });
  it("nothing for a trial that already has a subscription", () => {
    const r = row({ trialEndsAt: new Date(NOW + DAY), stripeSubscriptionId: "sub_1" });
    expect(reminderDue(r, ent(r), NOW)).toBeNull();
  });
  it("a failed payment, then the lock", () => {
    const pd = row({ status: "past_due", pastDueSince: new Date(NOW - DAY) });
    expect(reminderDue(pd, ent(pd), NOW)).toBe("pastDue");
    const locked = row({ status: "past_due", pastDueSince: new Date(NOW - 9 * DAY), notified: { pastDue: "x" } });
    expect(reminderDue(locked, ent(locked), NOW)).toBe("locked");
    expect(reminderDue({ ...locked, notified: { pastDue: "x", locked: "x" } }, ent(locked), NOW)).toBeNull();
  });
});

describe("the operator's plan settings", () => {
  it("defaults: three plans, sign-up closed, nothing buyable", () => {
    const c = normalizeConfig(null);
    expect(c.plans.map((p) => p.key)).toEqual(["solo", "team", "business"]);
    expect(c).toMatchObject({ signupOpen: false, trialDays: 14, trialPlan: "team", graceDays: 7, automaticTax: false });
    expect(c.plans.every((p) => !p.priceMonthly && !p.priceYearly)).toBe(true);
  });
  it("keeps only well-formed values", () => {
    const c = normalizeConfig({
      signupOpen: "yes", trialDays: 400, graceDays: -3, trialPlan: "nope", termsUrl: "javascript:alert(1)", privacyUrl: "https://example.com/privacy",
      plans: [
        { key: "Team!", name: "<b>Team</b>", perSeat: 1, members: "10", ai: "abc", priceMonthly: "price_1AbC", priceYearly: "'; DROP", order: 2 },
        { key: "team", name: "dup" }, { key: "comped", name: "reserved" }, { key: "", name: "nokey" },
        { key: "free", name: "Free", members: null, storageMb: "", order: 1, public: false },
      ],
    });
    expect(c.signupOpen).toBe(false);          // only the boolean true opens sign-up
    expect(c.trialDays).toBe(90);
    expect(c.graceDays).toBe(0);
    expect(c.termsUrl).toBe("");
    expect(c.privacyUrl).toBe("https://example.com/privacy");
    expect(c.plans.map((p) => p.key)).toEqual(["free", "team"]);
    const t = c.plans.find((p) => p.key === "team")!;
    expect(t).toMatchObject({ perSeat: true, members: 10, ai: 3000, priceMonthly: "price_1AbC", priceYearly: "" });
    expect(c.plans.find((p) => p.key === "free")).toMatchObject({ members: null, storageMb: null, public: false });
    expect(c.trialPlan).toBe("team");
  });
});

describe("talking to Stripe", () => {
  it("encodes nested parameters the way Stripe reads them (and the fake reads them back)", () => {
    const params = { mode: "subscription", line_items: [{ price: "price_1", quantity: 3 }], subscription_data: { trial_end: 1790000000, metadata: { workspaceId: "7" } }, skip: undefined, none: null, name: "A & B" };
    const s = formEncode(params);
    expect(decodeURIComponent(s)).toContain("line_items[0][price]=price_1");
    expect(decodeURIComponent(s)).toContain("subscription_data[metadata][workspaceId]=7");
    expect(s).toContain("name=A%20%26%20B");
    expect(s).not.toContain("skip");
    expect(parseForm(s)).toEqual({ mode: "subscription", line_items: [{ price: "price_1", quantity: "3" }], subscription_data: { trial_end: "1790000000", metadata: { workspaceId: "7" } }, name: "A & B" });
  });
  it("accepts a correctly signed webhook and nothing else", () => {
    const secret = "whsec_test_123";
    const payload = JSON.stringify({ id: "evt_1", type: "invoice.paid", data: { object: {} } });
    const t = Math.floor(NOW / 1000);
    const header = signWebhook(payload, secret, t);
    expect(verifyWebhook(Buffer.from(payload), header, secret, 300, NOW)).toMatchObject({ id: "evt_1" });
    expect(verifyWebhook(payload, `t=${t},v1=${"0".repeat(64)},${header.split(",")[1]}`, secret, 300, NOW).id).toBe("evt_1");   // several v1 values
    expect(() => verifyWebhook(payload.replace("evt_1", "evt_2"), header, secret, 300, NOW)).toThrow(/mismatch/);
    expect(() => verifyWebhook(payload, header, "whsec_other", 300, NOW)).toThrow(/mismatch/);
    expect(() => verifyWebhook(payload, header, secret, 300, NOW + 10 * 60_000)).toThrow(/tolerance/);
    expect(() => verifyWebhook(payload, "", secret, 300, NOW)).toThrow(/Malformed/);
    expect(() => verifyWebhook(payload, header, "", 300, NOW)).toThrow(/secret/);
  });
});
