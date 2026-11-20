/**
 * LAUNCH CHECKLIST (build -289) — Platform console → "Ready to open sign-up?".
 *
 * One place that says which of the operator's setup steps are done before strangers can sign up:
 * platform mail, Stripe keys, webhook, prices, the keys that protect backups and stored secrets,
 * LevelUp's own AI keys, and the steps nothing on the server can see (Railway's health check,
 * Google's consent screen, Azure's account types, a test-mode run) — those the operator ticks.
 *
 * Read-only apart from the ticks: it never returns a secret (only whether one is set, Stripe's
 * mode and masked facts), never creates anything in Stripe, and a Stripe or database failure
 * shows as an item to look at, not an error.
 */
import { desc } from "drizzle-orm";
import { getDb, getSystemSetting, setSystemSetting } from "../db";
import { billingEvents } from "../../drizzle/schema";

export type CheckStatus = "ok" | "todo" | "warn" | "manual" | "info";
export type CheckItem = {
  id: string;
  group: "signup" | "safety" | "signin" | "manual";
  title: string;
  status: CheckStatus;
  /** Blocks sign-up until done (the server refuses to offer sign-up without it). */
  required: boolean;
  detail: string;
  fix?: string;
  /** Manual items: when the operator ticked it. */
  doneAt?: string | null;
};

/** Steps the server cannot check; the operator ticks them. */
export const MANUAL_ITEMS: Record<string, { title: string; fix: string; group: CheckItem["group"] }> = {
  healthcheck: {
    group: "manual",
    title: "Railway health check",
    fix: "Railway → your service → Settings → Deploy → Healthcheck Path: /api/health. A deploy that cannot reach the database then never replaces the running one.",
  },
  googleConsent: {
    group: "signin",
    title: "Google consent screen published",
    fix: "Google Cloud console → APIs & Services → OAuth consent screen → Publish app. While it is in “Testing”, Google sign-in tokens die after 7 days and only listed test users can connect.",
  },
  azureMultiTenant: {
    group: "signin",
    title: "Microsoft (Azure) app open to other organisations",
    fix: "Azure portal → App registrations → LevelUp → Authentication → Supported account types: “Accounts in any organizational directory and personal Microsoft accounts”. Otherwise only your own organisation can connect Outlook.",
  },
  testRun: {
    group: "manual",
    title: "A full run in Stripe test mode",
    fix: "With Stripe TEST keys: sign up with a new address, confirm the email, check the trial, pay with card 4242 4242 4242 4242, switch plan, try a declined card (4000 0000 0000 0341), open Manage billing, cancel. Then switch to live keys.",
  },
};

const CHECK_KEY = "launchChecklist";

async function ticks(): Promise<Record<string, string>> {
  try {
    const v = await getSystemSetting(CHECK_KEY);
    const o = v ? JSON.parse(v) : {};
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}

/** Tick / untick a manual item (operator only — the router checks). */
export async function setManualTick(id: string, done: boolean): Promise<void> {
  if (!Object.prototype.hasOwnProperty.call(MANUAL_ITEMS, id)) throw new Error("Unknown checklist item");
  const t = await ticks();
  if (done) t[id] = new Date().toISOString(); else delete t[id];
  await setSystemSetting(CHECK_KEY, JSON.stringify(t));
}

const env = (k: string) => String(process.env[k] || "").trim();
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ago(iso: string | Date | null | undefined, now: number): string {
  if (!iso) return "";
  const t = new Date(iso as any).getTime();
  if (!isFinite(t)) return "";
  const h = Math.round((now - t) / 3_600_000);
  if (h < 1) return "less than an hour ago";
  if (h < 48) return `${h} hour${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

export async function launchChecklist(now = Date.now()): Promise<{
  items: CheckItem[];
  required: { done: number; total: number };
  recommended: { done: number; total: number };
  ready: boolean;
  signup: { open: boolean; offered: boolean; blocked: string | null };
}> {
  const items: CheckItem[] = [];
  const push = (i: CheckItem) => items.push(i);

  // ── what sign-up needs ──────────────────────────────────────────────────
  const pm = await import("./platformMail");
  const mailOk = pm.platformMailConfigured();
  const prov = env("MAIL_PROVIDER").toLowerCase();
  push({
    id: "mail", group: "signup", required: true, title: "Platform mail service",
    status: mailOk ? "ok" : "todo",
    detail: mailOk
      ? `Sending through ${prov === "smtp" ? "an SMTP mailbox" : prov === "postmark" ? "Postmark" : "Resend"} as ${pm.platformFromAddress() || "(no address)"}.`
      : prov ? `MAIL_PROVIDER is “${prov}” but its settings are incomplete.` : "Not set up. Sign-up confirmations, password resets and invitations for customers would otherwise come from your own mailbox, so sign-up is not offered without it.",
    fix: mailOk ? undefined : "On Railway set MAIL_PROVIDER=smtp, MAIL_SMTP_HOST, MAIL_SMTP_USER, MAIL_SMTP_PASS (and MAIL_SMTP_PORT if it is not 587; MAIL_FROM optional). Or MAIL_PROVIDER=postmark with POSTMARK_SERVER_TOKEN + MAIL_FROM, or resend with RESEND_API_KEY + MAIL_FROM.",
  });

  const st = await import("./stripe");
  const key = st.stripeConfigured();
  const mode = st.stripeMode();
  push({
    id: "stripeKey", group: "signup", required: true, title: "Stripe secret key",
    status: key ? "ok" : "todo",
    detail: key ? `Connected in ${mode === "live" ? "LIVE" : "TEST"} mode.` : "Not set — nothing can be sold.",
    fix: key ? undefined : "Stripe → Developers → API keys → Secret key (start with the test key, sk_test_…) → Railway: STRIPE_SECRET_KEY.",
  });
  const hook = !!st.stripeWebhookSecret();
  const origin = (await import("./appOrigin")).appOrigin();
  push({
    id: "webhookSecret", group: "signup", required: true, title: "Stripe webhook secret",
    status: hook ? "ok" : "todo",
    detail: hook ? "Set." : "Not set — Stripe's payment events would be refused, so paid workspaces would not unlock on their own.",
    fix: hook ? undefined : `Stripe → Developers → Webhooks → Add endpoint ${origin}/api/stripe/webhook (events listed in Billing & sign-up) → copy its signing secret → Railway: STRIPE_WEBHOOK_SECRET.`,
  });

  const { billingConfig } = await import("./plans");
  const cfg = await billingConfig();
  const offered = cfg.plans.filter((p) => p.public);
  const withIds = offered.filter((p) => p.priceMonthly || p.priceYearly);
  let priceStatus: CheckStatus = "todo", priceDetail = "", priceFix: string | undefined;
  if (!withIds.length) {
    priceDetail = offered.length ? "No offered plan has a Stripe price id yet." : "No plan is offered.";
    priceFix = "Stripe → Product catalogue → add a product per plan with a recurring monthly (and yearly) price → paste each price_… id in Billing & sign-up → Plans.";
  } else if (!key) {
    priceStatus = "warn"; priceDetail = `${withIds.length} plan(s) have price ids; they can be checked once the Stripe key is set.`;
  } else {
    try {
      const { publicPlans } = await import("./billing");
      const pub = await publicPlans();
      const missing: string[] = [];
      let buyable = 0;
      for (const p of withIds) {
        const v = pub.find((x) => x.key === p.key);
        if (v?.buyable) buyable++;
        if (p.priceMonthly && !v?.monthly) missing.push(`${p.name} monthly`);
        if (p.priceYearly && !v?.yearly) missing.push(`${p.name} yearly`);
      }
      if (buyable && !missing.length) { priceStatus = "ok"; priceDetail = `${buyable} plan(s) on sale; every price id was found in Stripe.`; }
      else if (buyable) { priceStatus = "warn"; priceDetail = `${buyable} plan(s) on sale, but Stripe does not know: ${missing.join(", ")}.`; priceFix = "Check those ids in Billing & sign-up — a test-mode id does not exist in live mode and the other way round."; }
      else { priceStatus = "todo"; priceDetail = `None of the price ids was found in Stripe (${missing.join(", ")}).`; priceFix = "Copy the ids again from Stripe — and from the same mode (test or live) as the secret key."; }
    } catch (e: any) {
      priceStatus = "warn"; priceDetail = `Stripe could not be asked just now (${String(e?.message || e).slice(0, 120)}).`;
    }
  }
  push({ id: "prices", group: "signup", required: true, title: "Plans with Stripe prices", status: priceStatus, detail: priceDetail, fix: priceFix });

  let lastEvent: Date | null = null;
  try {
    const db: any = await getDb();
    if (db) {
      // tenancy: operator-only platform check — reads one timestamp, no workspace or person
      const [r] = await db.select({ createdAt: billingEvents.createdAt }).from(billingEvents).orderBy(desc(billingEvents.createdAt)).limit(1);
      lastEvent = r?.createdAt ? new Date(r.createdAt) : null;
    }
  } catch { lastEvent = null; }
  push({
    id: "webhookSeen", group: "signup", required: false, title: "Stripe events arriving",
    status: lastEvent ? "ok" : hook && key ? "warn" : "info",
    detail: lastEvent ? `Last event from Stripe ${ago(lastEvent, now)}.` : "No event from Stripe has arrived yet. The first one comes with the first test checkout.",
    fix: lastEvent ? undefined : "Stripe → Developers → Webhooks → your endpoint → “Send test event” — or run a test checkout. If it fails there, the endpoint address or signing secret is wrong.",
  });

  push({
    id: "stripeMode", group: "signup", required: false, title: "Stripe mode",
    status: !key ? "info" : mode === "live" ? "ok" : "warn",
    detail: !key ? "Shown once the key is set." : mode === "live" ? "Live: real cards are charged." : "Test mode: nothing is charged and test cards work. Right for the first run.",
    fix: key && mode !== "live" ? "When the test run passes: live secret key, a live webhook endpoint + its secret, and the live price ids (live and test ids differ)." : undefined,
  });

  const legal = !!(cfg.termsUrl && cfg.privacyUrl);
  // -290: LevelUp's built-in drafts (/terms, /privacy) count as set, but stay a warning
  // until the operator has filled in their blanks and had them reviewed.
  const builtin = (u: string) => { try { const p = new URL(u).pathname.replace(/\/+$/, ""); return p === "/terms" || p === "/privacy"; } catch { return false; } };
  const usesBuiltin = legal && (builtin(cfg.termsUrl) || builtin(cfg.privacyUrl));
  const blanks = [!cfg.legalName && "business name", !cfg.legalContact && "contact email", !cfg.legalLaw && "governing law"].filter(Boolean) as string[];
  const draftOk = !usesBuiltin || (cfg.legalReviewed && !blanks.length);
  push({
    id: "terms", group: "signup", required: false, title: "Terms and Privacy links",
    status: legal && draftOk ? "ok" : "warn",
    detail: !legal
      ? (cfg.termsUrl || cfg.privacyUrl ? "Only one of the two is set." : "Neither is set. Sign-up works without them, but customers paying for a service expect both. LevelUp has built-in drafts at /terms and /privacy.")
      : !usesBuiltin ? "Both set; sign-up asks people to accept them."
      : draftOk ? "Using LevelUp’s built-in pages, filled in and marked as reviewed."
      : `Using LevelUp’s built-in drafts${blanks.length ? `; still blank: ${blanks.join(", ")}` : ""}${cfg.legalReviewed ? "" : "; not yet reviewed (they show a “Draft” notice)"}.`,
    fix: !legal ? "Billing & sign-up → Sign-up and trial → “Use LevelUp’s built-in Terms and Privacy pages” (or paste links to your own), then Save."
      : draftOk ? undefined
      : "Billing & sign-up → fill in business name, contact email and governing law; have the drafts reviewed by a lawyer, then tick “have been reviewed”.",
  });

  // ── keeping it safe ─────────────────────────────────────────────────────
  const sk = env("SECRETS_KEY");
  push({
    id: "secretsKey", group: "safety", required: false, title: "SECRETS_KEY",
    status: sk.length >= 32 ? "ok" : sk ? "warn" : "todo",
    detail: sk.length >= 32 ? "Set: stored secrets (mail passwords, AI keys, storage keys) have their own key." : sk ? "Set but shorter than 32 characters." : "Not set: stored secrets are encrypted with a key made from JWT_SECRET, so rotating JWT_SECRET would make every stored secret unreadable.",
    fix: sk.length >= 32 ? undefined : "Railway: SECRETS_KEY = a long random value (keep a copy somewhere safe). Setting it later is safe — what is already stored still opens.",
  });
  const bk = env("BACKUP_KEY");
  push({
    id: "backupKey", group: "safety", required: false, title: "BACKUP_KEY",
    status: bk.length >= 32 ? "ok" : bk ? "warn" : "todo",
    detail: bk.length >= 32 ? "Set: nightly backups have their own key." : bk ? "Set but shorter than 32 characters." : "Not set: backups are encrypted with a key made from JWT_SECRET.",
    fix: bk.length >= 32 ? undefined : "Railway: BACKUP_KEY = a long random value, kept OUTSIDE Railway too (a backup is useless without it).",
  });
  const jwt = env("JWT_SECRET");
  push({
    id: "jwt", group: "safety", required: false, title: "JWT_SECRET strength",
    status: jwt.length >= 32 ? "ok" : "warn",
    detail: jwt.length >= 32 ? "Long enough." : `Only ${jwt.length} characters — sign-in cookies are signed with it.`,
    fix: jwt.length >= 32 ? undefined : "Set SECRETS_KEY and BACKUP_KEY first, then a longer JWT_SECRET (everyone is signed out once).",
  });
  try {
    const { backupStatus } = await import("./backup");
    const b = await backupStatus();
    const fresh = b && now - new Date(b.at).getTime() < 36 * 3_600_000;
    push({
      id: "backup", group: "safety", required: false, title: "Nightly backup",
      status: b?.ok && fresh ? "ok" : "warn",
      detail: !b ? "No backup has run yet." : b.ok ? `Last backup ${ago(b.at, now)}${fresh ? "" : " — older than a day and a half"}.` : `The last backup (${ago(b.at, now)}) failed: ${String(b.error || "").slice(0, 160)}`,
      fix: b?.ok && fresh ? undefined : "Settings → Backup & Export → Backups: run one now and read the error.",
    });
  } catch { /* backups not available in this build */ }

  try {
    const { platformAIStatus } = await import("./workspaceAI");
    const ai = await platformAIStatus();
    push({
      id: "platformAI", group: "safety", required: false, title: "LevelUp's AI keys",
      status: ai.active.configured ? "ok" : "warn",
      detail: ai.active.configured ? `Customers without their own key use ${ai.active.provider}; only you can change it.` : "None saved: customers without their own key get no AI answers.",
      fix: ai.active.configured ? undefined : "Platform console → LevelUp's AI keys.",
    });
  } catch { /* ignore */ }

  if (env("ALLOW_SIGNUP")) {
    push({ id: "allowSignupEnv", group: "safety", required: false, title: "ALLOW_SIGNUP on Railway", status: "info", detail: "Still set, but it no longer does anything (since -288 sign-up is opened only here).", fix: "Remove ALLOW_SIGNUP from Railway when convenient." });
  }

  // ── customers' sign-ins to Google / Microsoft ───────────────────────────
  const t = await ticks();
  const manual = (id: string, extra?: Partial<CheckItem>) => {
    const m = MANUAL_ITEMS[id];
    push({ id, group: m.group, required: false, title: m.title, status: t[id] ? "ok" : "manual", detail: t[id] ? `Ticked ${ago(t[id], now)}.` : "LevelUp cannot check this — tick it when done.", fix: m.fix, doneAt: t[id] || null, ...extra });
  };
  const tenant = env("MS_TENANT_ID");
  if (GUID.test(tenant)) {
    push({ id: "msTenant", group: "signin", required: false, title: "MS_TENANT_ID on Railway", status: "warn", detail: "Set to one organisation's id, so only that organisation can connect Outlook / OneNote.", fix: "Remove MS_TENANT_ID (or set it to common) once the Azure app accepts other organisations." });
  }
  manual("googleConsent");
  manual("azureMultiTenant");
  manual("healthcheck");
  manual("testRun");

  // ── totals ──────────────────────────────────────────────────────────────
  const req = items.filter((i) => i.required);
  const rec = items.filter((i) => !i.required && i.status !== "info");
  const { signupReady } = await import("./signup");
  const sr = await signupReady();
  return {
    items,
    required: { done: req.filter((i) => i.status === "ok").length, total: req.length },
    recommended: { done: rec.filter((i) => i.status === "ok").length, total: rec.length },
    ready: req.every((i) => i.status === "ok"),
    signup: { open: !!cfg.signupOpen, offered: sr.ok, blocked: sr.reason },
  };
}
