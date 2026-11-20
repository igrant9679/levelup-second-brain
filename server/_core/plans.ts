/**
 * Plans and the platform's billing settings (build -279, Phase I).
 *
 * A plan is a set of LIMITS plus (optionally) the Stripe prices that sell it.
 * Prices are never written here: the operator pastes Stripe price ids
 * (price_…) in the Platform console and the amounts shown to customers are
 * read from Stripe, so what the page says is what the card is charged.
 *
 * Stored as ONE JSON value, system_settings.billingConfig (platform setting,
 * operator only). Defaults below apply to anything the operator has not set.
 *
 * Nothing here is on until the operator turns it on:
 *   - sign-up is closed (signupOpen false),
 *   - a plan without a price id cannot be bought,
 *   - workspaces that have no billing record (every workspace that existed
 *     before this build, and every workspace the operator creates by hand)
 *     are never limited, trialled or locked.
 */
import { getSystemSetting, setSystemSetting } from "../db";

export type PlanLimits = {
  /** Most people in the workspace. null = no limit. */
  members: number | null;
  /** AI requests a day for the whole workspace, on LevelUp's keys. */
  ai: number;
  /** Emails a day for the whole workspace. */
  email: number;
  /** Megabytes of files in LevelUp's storage. null = no limit. */
  storageMb: number | null;
};
export type Plan = PlanLimits & {
  key: string;
  name: string;
  blurb: string;
  /** Charged per person (the subscription quantity follows the head count) or one flat price. */
  perSeat: boolean;
  /** Stripe price ids. A plan with neither cannot be bought. */
  priceMonthly: string;
  priceYearly: string;
  /** Offered on the sign-up and billing pages. */
  public: boolean;
  order: number;
};
export type BillingConfig = {
  plans: Plan[];
  /** Anyone may create a workspace from the sign-in page. */
  signupOpen: boolean;
  trialDays: number;
  /** The plan whose limits apply during a trial. */
  trialPlan: string;
  /** Daily AI requests / emails a workspace on a FREE trial may use, whatever the trial plan allows (Audit 3). */
  trialAi: number;
  trialEmail: number;
  /** Days a failed payment is tolerated before the workspace is locked. */
  graceDays: number;
  termsUrl: string;
  privacyUrl: string;
  /** Let Stripe compute tax at checkout (needs Stripe Tax set up in the Stripe account). */
  automaticTax: boolean;
  /** -290: the public front page (/welcome, and / for first-time visitors once sign-up is offered). */
  frontPage: boolean;
  /** -290: filled into the built-in /terms and /privacy drafts. Blank = a visible placeholder. */
  legalName: string;
  legalContact: string;
  legalLaw: string;
  /** The operator has had the built-in drafts reviewed; until then they carry a "draft" notice. */
  legalReviewed: boolean;
};

export const DEFAULT_PLANS: Plan[] = [
  { key: "solo", name: "Solo", blurb: "One person. Everything in LevelUp, for yourself.", perSeat: false, members: 1, ai: 300, email: 100, storageMb: 2048, priceMonthly: "", priceYearly: "", public: true, order: 1 },
  { key: "team", name: "Team", blurb: "A team that shares projects, tasks and notes.", perSeat: true, members: 25, ai: 3000, email: 500, storageMb: 20480, priceMonthly: "", priceYearly: "", public: true, order: 2 },
  { key: "business", name: "Business", blurb: "Larger organisations: no member limit, higher allowances.", perSeat: true, members: null, ai: 10000, email: 2000, storageMb: 102400, priceMonthly: "", priceYearly: "", public: true, order: 3 },
];
export const DEFAULT_CONFIG: BillingConfig = {
  plans: DEFAULT_PLANS, signupOpen: false, trialDays: 14, trialPlan: "team", trialAi: 200, trialEmail: 50, graceDays: 7, termsUrl: "", privacyUrl: "", automaticTax: false,
  frontPage: true, legalName: "", legalContact: "", legalLaw: "", legalReviewed: false,
};

const KEY = "billingConfig";
let _cache: { at: number; v: BillingConfig } | null = null;
export function invalidateBillingConfig() { _cache = null; }

const num = (v: any, d: number, min: number, max: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d; };
const numOrNull = (v: any, d: number | null, max: number) => (v === null || v === "" || v === undefined ? (v === undefined ? d : null) : num(v, d ?? 0, 0, max));
const str = (v: any, max: number) => String(v ?? "").trim().slice(0, max);
const priceId = (v: any) => { const s = str(v, 80); return /^price_[A-Za-z0-9_]+$/.test(s) ? s : ""; };
/** One line of ordinary text: no control characters, no markup brackets. */
const plain = (v: any, max: number) => str(v, max * 2).replace(/[\x00-\x1f\x7f]/g, " ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const emailAddr = (v: any) => { const s = str(v, 200); return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(s) ? s : ""; };
const httpUrl = (v: any) => { const s = str(v, 300); try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? s : ""; } catch { return ""; } };

/** Whatever was stored (or sent by the console) → a complete, valid config. */
export function normalizeConfig(raw: any): BillingConfig {
  const o = raw && typeof raw === "object" ? raw : {};
  const seen = new Set<string>();
  const src: any[] = Array.isArray(o.plans) && o.plans.length ? o.plans : DEFAULT_PLANS;
  const plans: Plan[] = [];
  for (const p of src.slice(0, 12)) {
    const key = str(p?.key, 32).toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!key || seen.has(key) || key === "comped") continue;
    seen.add(key);
    const d = DEFAULT_PLANS.find((x) => x.key === key);
    plans.push({
      key,
      name: str(p?.name, 40) || d?.name || key,
      blurb: str(p?.blurb, 200),
      perSeat: !!p?.perSeat,
      members: numOrNull(p?.members, d ? d.members : null, 100000),
      ai: num(p?.ai, d?.ai ?? 1000, 0, 10_000_000),
      email: num(p?.email, d?.email ?? 200, 0, 10_000_000),
      storageMb: numOrNull(p?.storageMb, d ? d.storageMb : null, 100_000_000),
      priceMonthly: priceId(p?.priceMonthly),
      priceYearly: priceId(p?.priceYearly),
      public: p?.public !== false,
      order: num(p?.order, plans.length + 1, 0, 999),
    });
  }
  plans.sort((a, b) => a.order - b.order);
  const trialPlan = plans.some((p) => p.key === str(o.trialPlan, 32)) ? str(o.trialPlan, 32) : (plans.find((p) => p.key === "team") || plans[0]).key;
  return {
    plans,
    signupOpen: o.signupOpen === true,
    trialDays: num(o.trialDays, DEFAULT_CONFIG.trialDays, 0, 90),
    trialPlan,
    trialAi: num(o.trialAi, DEFAULT_CONFIG.trialAi, 0, 100_000),
    trialEmail: num(o.trialEmail, DEFAULT_CONFIG.trialEmail, 0, 100_000),
    graceDays: num(o.graceDays, DEFAULT_CONFIG.graceDays, 0, 60),
    termsUrl: httpUrl(o.termsUrl),
    privacyUrl: httpUrl(o.privacyUrl),
    automaticTax: o.automaticTax === true,
    frontPage: o.frontPage !== false,
    legalName: plain(o.legalName, 120),
    legalContact: emailAddr(o.legalContact),
    legalLaw: plain(o.legalLaw, 80),
    legalReviewed: o.legalReviewed === true,
  };
}

export async function billingConfig(): Promise<BillingConfig> {
  if (_cache && Date.now() - _cache.at < 30_000) return _cache.v;
  let raw: any = null;
  try { const s = await getSystemSetting(KEY); raw = s ? JSON.parse(s) : null; } catch { raw = null; }
  const v = normalizeConfig(raw);
  _cache = { at: Date.now(), v };
  return v;
}
export async function saveBillingConfig(raw: any): Promise<BillingConfig> {
  const v = normalizeConfig(raw);
  await setSystemSetting(KEY, JSON.stringify(v));
  invalidateBillingConfig();
  return v;
}
export async function planByKey(key: string | null | undefined): Promise<Plan | null> {
  if (!key) return null;
  return (await billingConfig()).plans.find((p) => p.key === key) || null;
}
/** Which plan and interval a Stripe price id sells (webhooks arrive with the price, not our key). */
export async function planByPrice(price: string | null | undefined): Promise<{ plan: Plan; interval: "month" | "year" } | null> {
  if (!price) return null;
  for (const p of (await billingConfig()).plans) {
    if (p.priceMonthly && p.priceMonthly === price) return { plan: p, interval: "month" };
    if (p.priceYearly && p.priceYearly === price) return { plan: p, interval: "year" };
  }
  return null;
}
export function limitsOf(p: Plan): PlanLimits { return { members: p.members, ai: p.ai, email: p.email, storageMb: p.storageMb }; }
/**
 * Sign-up is open when the operator switched it on. (Audit 3: ALLOW_SIGNUP no longer forces it —
 * one variable opened two sign-up paths, one of them unchecked.) Whether it can actually be USED
 * is `signupReady()` in signup.ts (something to buy + a platform mail service).
 */
export async function signupOpen(): Promise<boolean> {
  return (await billingConfig()).signupOpen;
}
