/**
 * Billing and self-serve sign-up (build -279, Phase I).
 *
 *   public     plans (what can be bought, sign-up open?), signupStart,
 *              signupPeek, signupConfirm
 *   member     status (what this workspace is on; limits and usage)
 *   owner      checkout, portal, refresh, invoices, changePlan
 *   signed in  createWorkspace (another workspace for the same login)
 *   operator   opConfigGet / opConfigSet (plans, prices, sign-up switch),
 *              opSet (comp a workspace, restart a trial, remove billing)
 *
 * Every procedure here stays reachable while a workspace is LOCKED for
 * non-payment (see BILLING_OPEN_PATHS in _core/trpc.ts) — it is how the owner
 * gets out of the lock.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { operatorProcedure, ownerProcedure, protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { getWorkspace, wsIdOf } from "../_core/workspace";
import { billingConfig, saveBillingConfig, signupOpen } from "../_core/plans";
import { stripeConfigured, stripeMode, stripeWebhookSecret, StripeError } from "../_core/stripe";
import * as billing from "../_core/billing";
import { workspaceUsage } from "../_core/quota";
import { clientIp } from "../_core/rateLimit";
import { audit } from "../_core/audit";
import { SignupError, confirmSignup, createOwnWorkspace, peekSignup, startSignup, signupReady } from "../_core/signup";
import { issueCookieFor } from "./workspace";

const TRPC_CODES = new Set(["FORBIDDEN", "TOO_MANY_REQUESTS", "BAD_REQUEST", "CONFLICT", "UNAUTHORIZED", "INTERNAL_SERVER_ERROR"]);
function rethrow(e: any): never {
  if (e instanceof TRPCError) throw e;
  if (e instanceof SignupError) throw new TRPCError({ code: (TRPC_CODES.has(e.code) ? e.code : "BAD_REQUEST") as any, message: e.message });
  if (e instanceof StripeError) {
    console.error("[billing] Stripe:", e.status, e.code || "", e.message);
    throw new TRPCError({ code: "BAD_REQUEST", message: e.code === "not_configured" ? e.message : "The payment service could not do that just now. Please try again in a moment." });
  }
  throw new TRPCError({ code: "BAD_REQUEST", message: String(e?.message || "That did not work.") });
}
async function myWs(ctx: any): Promise<number> {
  const w = await wsIdOf(ctx.user as any);
  if (!w) throw new TRPCError({ code: "BAD_REQUEST", message: "No workspace." });
  return w;
}

export const billingRouter = router({
  /** What the sign-in page and the billing page offer. No workspace data. */
  plans: publicProcedure.query(async () => {
    const cfg = await billingConfig();
    // Audit 3: the sign-in page offers sign-up only when it can actually be used
    const open = (await signupReady()).ok;
    const sellable = await billing.sellable();
    return {
      signupOpen: open,
      billingOn: sellable,
      trialDays: sellable ? cfg.trialDays : 0,
      termsUrl: cfg.termsUrl, privacyUrl: cfg.privacyUrl,
      plans: sellable || open ? await billing.publicPlans() : [],
    };
  }),

  signupStart: publicProcedure
    .input(z.object({
      name: z.string().trim().min(1).max(128),
      workspaceName: z.string().trim().max(120).optional().default(""),
      email: z.string().trim().email().max(320),
      password: z.string().min(8, "Password must be at least 8 characters").max(500),
      acceptTerms: z.boolean().optional().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const cfg = await billingConfig();
        if ((cfg.termsUrl || cfg.privacyUrl) && !input.acceptTerms) throw new TRPCError({ code: "BAD_REQUEST", message: "Please accept the terms to continue." });
        return await startSignup({ name: input.name, workspaceName: input.workspaceName, email: input.email, password: input.password, ip: clientIp(ctx.req) });
      } catch (e) { rethrow(e); }
    }),

  signupPeek: publicProcedure.input(z.object({ token: z.string().max(128) })).query(async ({ input }) => peekSignup(input.token)),

  signupConfirm: publicProcedure
    .input(z.object({ token: z.string().max(128) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const r = await confirmSignup(input.token);
        await issueCookieFor(ctx, { openId: r.user.openId, name: r.user.name });
        void audit({ ...ctx, user: r.user } as any, "workspace.signup", { detail: { workspaceId: r.workspaceId } });
        return { ok: true as const, workspaceId: r.workspaceId, userId: Number(r.user.id) };
      } catch (e) { rethrow(e); }
    }),

  /** Another workspace for the login that is signed in; the browser is moved into it. */
  createWorkspace: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(120) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const r = await createOwnWorkspace(ctx.user as any, input.name);
        await issueCookieFor(ctx, { openId: r.user.openId, name: r.user.name });
        void audit(ctx, "workspace.self_created", { detail: { workspaceId: r.workspaceId } });
        return { ok: true as const, workspaceId: r.workspaceId, userId: Number(r.user.id) };
      } catch (e) { rethrow(e); }
    }),

  /** This workspace's plan, state and usage. Members see enough to understand a limit; money details are the owner's. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const w = await myWs(ctx);
    const ent = await billing.entitlement(w);
    const { isOwner } = await import("../_core/ownerGuard");
    const owner = await isOwner(ctx.user as any);
    const usage = await workspaceUsage(w);
    const members = await billing.memberCount(w);
    const storageBytes = ent.limits && ent.limits.storageMb != null ? await billing.storageUsedBytes(w) : null;
    const base = {
      billed: ent.billed, status: ent.status, planName: ent.planName, locked: ent.locked, lockReason: ent.lockReason,
      trialDaysLeft: ent.trialDaysLeft, limits: ent.limits, isOwner: owner,
      usage: { members, ai: usage.ai, email: usage.email, storageBytes },
    };
    if (!owner) return base;
    return {
      ...base, plan: ent.plan, trialEndsAt: ent.trialEndsAt, currentPeriodEnd: ent.currentPeriodEnd, cancelAtPeriodEnd: ent.cancelAtPeriodEnd,
      graceEndsAt: ent.graceEndsAt, interval: ent.interval, hasSubscription: ent.hasSubscription, seats: ent.seats,
      canBuy: await billing.sellable(),
      plans: ent.billed || ent.status === "none" ? await billing.publicPlans() : [],
    };
  }),

  checkout: ownerProcedure
    .input(z.object({ plan: z.string().max(32), interval: z.enum(["month", "year"]) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const w = await myWs(ctx);
        const url = await billing.createCheckout(w, input.plan, input.interval);
        void audit(ctx, "billing.checkout_started", { detail: { plan: input.plan, interval: input.interval } });
        return { url };
      } catch (e) { rethrow(e); }
    }),

  portal: ownerProcedure.mutation(async ({ ctx }) => {
    try { return { url: await billing.createPortal(await myWs(ctx)) }; } catch (e) { rethrow(e); }
  }),

  /** The workspace's invoices (newest first), each with a link to Stripe's own invoice page and PDF. */
  invoices: ownerProcedure.query(async ({ ctx }) => {
    const w = await myWs(ctx);
    try { return { invoices: await billing.listInvoices(w), error: null as string | null }; }
    catch (e: any) {
      console.error("[billing] invoices:", e?.status || "", e?.code || "", e?.message || e);
      return { invoices: [] as billing.InvoiceView[], error: "The invoices could not be loaded just now. They are also under “Manage billing”." };
    }
  }),

  /** Another plan, or monthly / yearly, for a workspace that already pays. Stripe prorates. */
  /**
   * What switching would cost (Stripe's own figures), before anything changes.
   * A plan that cannot be chosen throws, as changePlan would; Stripe being
   * unreachable answers {preview: null, error} so the page can still offer the change.
   */
  previewPlanChange: ownerProcedure
    .input(z.object({ plan: z.string().max(32), interval: z.enum(["month", "year"]) }))
    .query(async ({ ctx, input }) => {
      const w = await myWs(ctx);
      try { return { preview: await billing.previewPlanChange(w, input.plan, input.interval), error: null as string | null }; }
      catch (e: any) {
        if (!(e instanceof StripeError) || e.code === "not_configured") rethrow(e);
        console.error("[billing] plan preview:", e.status, e.code || "", e.message);
        return { preview: null as billing.PlanChangePreview | null, error: "Stripe could not work out the exact amount just now." };
      }
    }),

  changePlan: ownerProcedure
    .input(z.object({ plan: z.string().max(32), interval: z.enum(["month", "year"]), prorationDate: z.number().int().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        const w = await myWs(ctx);
        const ent = await billing.changePlan(w, input.plan, input.interval, input.prorationDate ?? null);
        void audit(ctx, "billing.plan_changed", { detail: { plan: input.plan, interval: input.interval } });
        return { status: ent.status, plan: ent.plan, planName: ent.planName, interval: ent.interval, currentPeriodEnd: ent.currentPeriodEnd };
      } catch (e) { rethrow(e); }
    }),

  /** After coming back from Stripe: read the subscription now instead of waiting for the webhook. */
  refresh: ownerProcedure.mutation(async ({ ctx }) => {
    try {
      const ent = await billing.refreshWorkspace(await myWs(ctx));
      return { status: ent.status, locked: ent.locked, planName: ent.planName };
    } catch (e) { rethrow(e); }
  }),

  // ── platform operator ─────────────────────────────────────────────────────
  opConfigGet: operatorProcedure.meta({ crossWorkspace: true }).query(async () => {
    const cfg = await billingConfig();
    return {
      config: cfg,
      stripe: { configured: stripeConfigured(), mode: stripeMode(), webhookSecretSet: !!stripeWebhookSecret() },
      sellable: await billing.sellable(),
      // Audit 3: why sign-up is not usable yet (closed | nothing_to_buy | no_platform_mail), null = ready
      signupBlocked: (await signupReady()).reason,
      prices: await billing.publicPlans().then((ps) => Object.fromEntries(ps.map((p) => [p.key, { monthly: p.monthly, yearly: p.yearly }]))),
    };
  }),

  opConfigSet: operatorProcedure.meta({ crossWorkspace: true })
    .input(z.object({ config: z.record(z.string(), z.unknown()) }))
    .mutation(async ({ ctx, input }) => {
      const before = await billingConfig();
      const cfg = await saveBillingConfig(input.config);
      billing._resetBillingForTest();   // prices and rows are re-read with the new plans
      void audit(ctx, "billing.config_change", { detail: { signupOpen: cfg.signupOpen, wasOpen: before.signupOpen, plans: cfg.plans.map((p) => p.key), trialDays: cfg.trialDays } });
      return { config: cfg, signupBlocked: (await signupReady()).reason };
    }),

  opSet: operatorProcedure.meta({ crossWorkspace: true })
    .input(z.object({ workspaceId: z.number().int().positive(), mode: z.enum(["none", "comped", "trial"]), plan: z.string().max(32).optional(), trialDays: z.number().int().min(0).max(365).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        if (!(await getWorkspace(input.workspaceId))) throw new TRPCError({ code: "NOT_FOUND", message: "No such workspace." });
        const ent = await billing.operatorSet(input.workspaceId, { mode: input.mode, plan: input.plan, trialDays: input.trialDays });
        void audit(ctx, "billing.operator_set", { detail: { workspaceId: input.workspaceId, mode: input.mode, plan: input.plan || null, trialDays: input.trialDays ?? null } });
        return { status: ent.status, planName: ent.planName, locked: ent.locked };
      } catch (e) { rethrow(e); }
    }),
});
