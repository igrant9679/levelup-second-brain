/**
 * Public pages (build -290): the front page, and draft Terms and Privacy pages.
 *
 *   /welcome (and /pricing)  what LevelUp is, the plans with the prices Stripe
 *                            will charge (publicPlans), and "Start free trial".
 *                            Always viewable — the operator previews it here.
 *   /                        the front page ONLY for a first-time visitor:
 *                            exactly "/" (no query string), no valid session
 *                            cookie, no `lu_app` cookie (set by the app on every
 *                            device that has opened it — app-workspace.js), the
 *                            operator has not switched the front page off, and
 *                            sign-up is actually offered (signupReady). Anyone
 *                            else gets the app exactly as before — so until
 *                            sign-up opens, nothing changes at "/".
 *   /terms, /privacy         drafts written from what LevelUp stores and sends.
 *                            The operator's business name, contact address and
 *                            governing law come from billingConfig (blank = a
 *                            visible placeholder); a "draft" notice shows until
 *                            the operator ticks legalReviewed.
 *
 * The pages are rendered on the server, carry NO script (CSP has no script
 * source) and load nothing from another site. Every value from the config or
 * from Stripe is escaped.
 */
import type { Express, Request, Response, NextFunction } from "express";
import type { BillingConfig } from "./plans";

export const LEGAL_UPDATED = "19 November 2026";

export type PublicPrice = { amount: number; currency: string; interval: string } | null;
export type PublicPlan = {
  key: string; name: string; blurb: string; perSeat: boolean;
  members: number | null; ai: number; email: number; storageMb: number | null;
  monthly: PublicPrice; yearly: PublicPrice; buyable: boolean;
};
export type PageData = {
  cfg: BillingConfig;
  plans: PublicPlan[];
  /** Sign-up can be used right now (signupReady().ok). */
  signupOpen: boolean;
  origin: string;
};
export type PublicDeps = {
  hasSession: (req: Request) => Promise<boolean>;
  data: () => Promise<PageData>;
};

// ── helpers ─────────────────────────────────────────────────────────────────
export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
const ZERO_DECIMAL = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);
/** Stripe's unit_amount → "$12" / "$12.50" / "¥1,200". */
export function money(p: { amount: number; currency: string }): string {
  const cur = String(p.currency || "usd").toLowerCase();
  const major = ZERO_DECIMAL.has(cur) ? p.amount : p.amount / 100;
  const whole = Math.round(major * 100) % 100 === 0;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase(), minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(major);
  } catch {
    return `${major.toFixed(whole ? 0 : 2)} ${cur.toUpperCase()}`;
  }
}
const storageText = (mb: number | null) => (mb == null ? "Unlimited file storage" : mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB of file storage` : `${mb} MB of file storage`);
const peopleText = (m: number | null) => (m == null ? "Any number of people" : m === 1 ? "One person" : `Up to ${m} people`);
const num = (n: number) => n.toLocaleString("en-US");

/** A blank config value shows as a highlighted placeholder, so it can't go unnoticed. */
function filled(v: string, placeholder: string): string {
  return v ? esc(v) : `<mark class="ph">[${esc(placeholder)}]</mark>`;
}

// ── page shell ──────────────────────────────────────────────────────────────
const CSS = `
:root{--bg:#f7f8fb;--s1:#ffffff;--s2:#eef0f6;--bd:#dfe3ec;--t1:#111827;--t2:#3f4757;--t3:#5b6474;--ac:#4f46e5;--ach:#4338ca;--on-ac:#ffffff;--ok:#047857;--mark:#fde68a;--mark-t:#3b2a00}
@media (prefers-color-scheme:dark){:root{--bg:#0b0f1a;--s1:#121828;--s2:#1a2236;--bd:#2a3550;--t1:#f1f4fa;--t2:#c3cad8;--t3:#9aa4b8;--ac:#5b55e8;--ach:#a5b4fc;--on-ac:#ffffff;--ok:#34d399;--mark:#facc15;--mark-t:#1f1600}}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--t1);font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Inter,"Helvetica Neue",Arial,sans-serif}
a{color:var(--ach)}
a:focus-visible,.btn:focus-visible{outline:3px solid var(--ach);outline-offset:2px}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.skip{position:absolute;left:-999px;top:0;background:var(--s1);padding:8px 12px;z-index:10}
.skip:focus{left:12px;top:12px}
header.top{border-bottom:1px solid var(--bd);background:var(--s1)}
header.top .wrap{display:flex;align-items:center;gap:16px;min-height:64px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none;color:var(--t1);font-weight:700;font-size:18px;margin-right:auto}
.brand img{width:34px;height:34px;object-fit:contain}
nav.links{display:flex;gap:18px;align-items:center;flex-wrap:wrap;font-size:15px}
nav.links a{color:var(--t2);text-decoration:none;display:inline-flex;align-items:center;min-height:44px}
nav.links a:hover{color:var(--t1);text-decoration:underline}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 20px;border-radius:10px;font-weight:600;font-size:15px;text-decoration:none;border:1px solid transparent}
.btn-p{background:var(--ac);color:var(--on-ac)}
.btn-p:hover{filter:brightness(1.08)}
.btn-s{background:var(--s1);color:var(--t1);border-color:var(--bd)}
nav.links .btn-p{color:var(--on-ac)}
.hero{padding-top:72px;padding-bottom:56px;text-align:center}
.hero h1{font-size:clamp(32px,5.2vw,52px);line-height:1.12;margin:0 auto 18px;max-width:820px;letter-spacing:-.02em}
.hero p.lead{font-size:clamp(17px,2.2vw,20px);color:var(--t2);max-width:680px;margin:0 auto 28px}
.cta{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.note{font-size:14px;color:var(--t3);margin-top:14px}
section{padding:56px 0}
section.alt{background:var(--s1);border-top:1px solid var(--bd);border-bottom:1px solid var(--bd)}
h2{font-size:clamp(26px,3.4vw,34px);line-height:1.2;margin:0 0 10px;letter-spacing:-.01em}
.sub{color:var(--t2);margin:0 0 32px;max-width:680px}
.grid{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.card{background:var(--s1);border:1px solid var(--bd);border-radius:14px;padding:22px}
section.alt .card{background:var(--bg)}
.card h3{margin:0 0 8px;font-size:18px}
.card p{margin:0;color:var(--t2);font-size:15px}
.ico{font-size:24px;line-height:1;margin-bottom:12px}
.plans{display:grid;gap:18px;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));align-items:stretch}
.plan{display:flex;flex-direction:column}
.plan .price{font-size:34px;font-weight:700;margin:6px 0 0;letter-spacing:-.01em}
.plan .per{font-size:15px;font-weight:500;color:var(--t2)}
.plan .alt{font-size:14px;color:var(--t3);margin:2px 0 0}
.plan ul{list-style:none;padding:0;margin:16px 0 20px;flex:1}
.plan li{padding:5px 0 5px 26px;position:relative;font-size:15px;color:var(--t2)}
.plan li::before{content:"✓";position:absolute;left:0;color:var(--ok);font-weight:700}
.plan .btn{width:100%}
.soon{font-size:18px;font-weight:600;color:var(--t2);margin:10px 0 0}
details{border-bottom:1px solid var(--bd);padding:14px 0}
details summary{cursor:pointer;font-weight:600;font-size:16px;min-height:28px}
details p{color:var(--t2);margin:10px 0 0}
footer{padding:32px 0 48px;color:var(--t3);font-size:14px}
footer .wrap{display:flex;gap:18px;flex-wrap:wrap;align-items:center}
footer a{color:var(--t2);display:inline-flex;align-items:center;min-height:44px}
.legal{max-width:760px}
.legal h1{font-size:clamp(28px,4vw,38px);margin:40px 0 4px}
.legal h2{font-size:21px;margin:34px 0 8px}
.legal p,.legal li{color:var(--t2)}
.legal ul{padding-left:22px}
.updated{color:var(--t3);font-size:14px;margin:0 0 20px}
.draft{background:var(--s2);border:1px solid var(--bd);border-left:4px solid #b45309;border-radius:10px;padding:12px 16px;margin:20px 0;color:var(--t1);font-size:15px}
mark.ph{background:var(--mark);color:var(--mark-t);padding:0 3px;border-radius:3px}
@media (max-width:640px){
  nav.links{gap:12px;font-size:14px}
  nav.links .hide-sm{display:none}
  .hero{padding-top:48px;padding-bottom:40px}
  section{padding:40px 0}
}
`;

function shell(title: string, description: string, body: string, origin: string, canonicalPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(origin + canonicalPath)}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<meta name="color-scheme" content="light dark">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${body}
</body>
</html>`;
}

function header(signupOpen: boolean, onLanding: boolean): string {
  const pricing = onLanding ? "#pricing" : "/welcome#pricing";
  const features = onLanding ? "#features" : "/welcome#features";
  return `<header class="top"><div class="wrap">
<a class="brand" href="/welcome"><img src="/levelup-logo.webp" alt="" width="34" height="34"><span>LevelUp</span></a>
<nav class="links" aria-label="Main">
<a class="hide-sm" href="${features}">Features</a>
<a href="${pricing}">Pricing</a>
<a href="/?signin">Sign in</a>
${signupOpen ? `<a class="btn btn-p" href="/?start=signup">Start free trial</a>` : ""}
</nav>
</div></header>`;
}

function footer(cfg: BillingConfig): string {
  const terms = cfg.termsUrl || "/terms";
  const privacy = cfg.privacyUrl || "/privacy";
  const year = new Date().getFullYear();
  return `<footer><div class="wrap">
<span>© ${year} ${cfg.legalName ? esc(cfg.legalName) : "LevelUp"}</span>
<a href="${esc(terms)}">Terms</a>
<a href="${esc(privacy)}">Privacy</a>
<a href="/?signin">Sign in</a>
${cfg.legalContact ? `<a href="mailto:${esc(cfg.legalContact)}">Contact</a>` : ""}
</div></footer>`;
}

// ── the front page ──────────────────────────────────────────────────────────
const FEATURES: Array<[string, string, string]> = [
  ["✅", "Tasks and your day", "Lists, a board, a priority matrix and a calendar view. A Today screen that plans the day, a focus timer, and a short wrap-up at the end of it."],
  ["📝", "Notes that link up", "Notes that save as you type, [[links]] between them, checklists and tables, and full-text search. Paste from Word or Excel and the formatting comes with it."],
  ["📊", "Projects from start to finish", "A Gantt chart you can drag, risks and actions, budgets with earned value, status reports, and import from Microsoft Project."],
  ["📅", "Calendar and mail", "Your Outlook or Google calendar and mail next to your tasks, so the plan for the day takes your meetings into account."],
  ["✨", "An assistant on every page", "Ask about your tasks, notes and calendar, or have it make changes once you've approved them. It can stay open beside the page, and its answers cite the notes they come from."],
  ["👥", "Made for teams", "Share projects, tasks and notes, give people roles, hand work off and follow up by email. Each workspace is kept separate from every other."],
];

function planCard(p: PublicPlan, signupOpen: boolean, trialDays: number): string {
  const per = p.perSeat ? " per person" : "";
  let price = `<p class="soon">Price coming soon</p>`;
  if (p.monthly) {
    price = `<p class="price">${esc(money(p.monthly))}<span class="per">${per} / month</span></p>`;
    if (p.yearly && p.yearly.currency === p.monthly.currency) {
      const save = p.monthly.amount > 0 ? Math.round((1 - p.yearly.amount / (p.monthly.amount * 12)) * 100) : 0;
      price += `<p class="alt">or ${esc(money(p.yearly))}${per} / year${save >= 5 ? ` (save ${save}%)` : ""}</p>`;
    }
  } else if (p.yearly) {
    price = `<p class="price">${esc(money(p.yearly))}<span class="per">${per} / year</span></p>`;
  }
  const items = [
    peopleText(p.members),
    `${num(p.ai)} AI requests a day`,
    `${num(p.email)} emails a day`,
    storageText(p.storageMb),
    "Every LevelUp feature",
  ];
  const btn = signupOpen && p.buyable
    ? `<a class="btn btn-p" href="/?start=signup&amp;plan=${encodeURIComponent(p.key)}">${trialDays > 0 ? `Start ${trialDays}-day free trial` : "Get started"}</a>`
    : `<a class="btn btn-s" href="/?signin">Sign in</a>`;
  return `<div class="card plan"><h3>${esc(p.name)}</h3>${p.blurb ? `<p>${esc(p.blurb)}</p>` : ""}${price}<ul>${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>${btn}</div>`;
}

export function landingHtml(d: PageData): string {
  const { cfg, signupOpen, origin } = d;
  const trialDays = signupOpen ? cfg.trialDays : 0;
  const plans = d.plans.filter((p) => p.buyable);
  const shown = plans.length ? plans : d.plans; // before prices are set (operator preview): limits, "coming soon"
  const startBtn = signupOpen
    ? `<a class="btn btn-p" href="/?start=signup">${trialDays > 0 ? `Start your ${trialDays}-day free trial` : "Create your workspace"}</a>`
    : `<a class="btn btn-p" href="/?signin">Sign in</a>`;
  const trialNote = signupOpen && trialDays > 0 ? `<p class="note">${trialDays} days free. No card needed to start.</p>` : signupOpen ? "" : `<p class="note">New workspaces are by invitation for now.</p>`;
  const body = `${header(signupOpen, true)}
<main id="main">
<div class="wrap hero">
<h1>Your tasks, notes, projects and calendar in one place</h1>
<p class="lead">LevelUp is a second brain for you and your team. Plan the day, keep your notes, run your projects and ask an assistant that knows all of it.</p>
<div class="cta">${startBtn}<a class="btn btn-s" href="#pricing">See plans and pricing</a></div>
${trialNote}
</div>

<section class="alt" id="features" aria-labelledby="f-h"><div class="wrap">
<h2 id="f-h">Everything you work on, connected</h2>
<p class="sub">You don't need one app for tasks, another for notes and a third for projects. In LevelUp they're one workspace, and they link to each other.</p>
<div class="grid">${FEATURES.map(([i, t, s]) => `<div class="card"><div class="ico" aria-hidden="true">${i}</div><h3>${esc(t)}</h3><p>${esc(s)}</p></div>`).join("")}</div>
</div></section>

<section id="pricing" aria-labelledby="p-h"><div class="wrap">
<h2 id="p-h">Plans and pricing</h2>
<p class="sub">${trialDays > 0 ? `Every plan starts with a ${trialDays}-day free trial and doesn't need a card. ` : ""}${shown.some((p) => p.monthly && p.yearly) ? "Pay monthly or yearly and cancel any time." : "Cancel any time."} The prices below are what you'll be charged${cfg.automaticTax ? ", before any sales tax or VAT added at checkout" : ""}.</p>
${shown.length ? `<div class="plans">${shown.map((p) => planCard(p, signupOpen, trialDays)).join("")}</div>` : `<p class="sub">Plans are coming soon.</p>`}
</div></section>

<section class="alt" aria-labelledby="d-h"><div class="wrap">
<h2 id="d-h">Your data stays yours</h2>
<div class="grid">
<div class="card"><h3>Take it with you</h3><p>The workspace owner can download everything in the workspace at any time. A closed workspace is deleted for good 30 days after it's closed.</p></div>
<div class="card"><h3>Kept private</h3><p>No ads and no tracking scripts. We never sell your content or use it to train AI models. Passwords are stored as one-way hashes, and the keys to connected accounts are encrypted.</p></div>
<div class="card"><h3>Your storage, your AI keys</h3><p>Use the storage and AI included in your plan, or connect your own S3 bucket, Google Drive or AI provider key.</p></div>
</div>
</div></section>

<section aria-labelledby="q-h"><div class="wrap" style="max-width:820px">
<h2 id="q-h">Questions</h2>
${trialDays > 0 ? `<details><summary>How does the free trial work?</summary><p>You get ${trialDays} days with no card. Before the trial ends, the workspace owner picks a plan. If no plan is chosen, the workspace is locked, not deleted: you can still choose a plan, download your data or close it. Each person gets one free trial.</p></details>` : ""}
<details><summary>Can I change plans or cancel?</summary><p>Yes. The workspace owner can switch plans in Workspace settings → Plan &amp; billing and sees the exact amount before confirming. If you cancel, you keep access until the end of the period you've paid for.</p></details>
<details><summary>What counts as an AI request?</summary><p>Each question to the assistant, and each AI action such as a summary or suggested tags, uses one request from the workspace's daily allowance. If you use your own AI provider key, those requests don't come out of the allowance.</p></details>
<details><summary>Who can see what I put in?</summary><p>Only the people in your workspace, and only what's shared with them. Other workspaces can never see your content. When you use an AI feature, the text that request needs goes to the AI provider in use. The <a href="${esc(cfg.privacyUrl || "/privacy")}">Privacy Policy</a> lists every service involved.</p></details>
<details><summary>Does it work on my phone?</summary><p>Yes. LevelUp works in any modern browser on a computer, tablet or phone, and you can add it to your home screen like an app.</p></details>
</div></section>
</main>
${footer(cfg)}`;
  return shell("LevelUp: tasks, notes, projects and calendar in one place", "A second brain for you and your team: tasks, notes, projects, calendar and an assistant that knows all of it. Plans and pricing.", body, origin, "/welcome");
}

// ── Terms ───────────────────────────────────────────────────────────────────
function legalShell(kind: "terms" | "privacy", d: PageData, sections: string): string {
  const { cfg, origin, signupOpen } = d;
  const title = kind === "terms" ? "Terms of Service" : "Privacy Policy";
  const draft = cfg.legalReviewed ? "" : `<div class="draft" role="note"><b>Draft.</b> This ${kind === "terms" ? "agreement" : "policy"} has not been reviewed yet and may change before it is final.</div>`;
  const body = `${header(signupOpen, false)}
<main id="main" class="wrap legal">
<h1>${title}</h1>
<p class="updated">Last updated ${LEGAL_UPDATED}</p>
${draft}
${sections}
</main>
${footer(cfg)}`;
  return shell(`${title} · LevelUp`, `The ${title} for LevelUp.`, body, origin, `/${kind}`);
}

export function termsHtml(d: PageData): string {
  const { cfg, origin } = d;
  const name = filled(cfg.legalName, "your legal business name");
  const contact = cfg.legalContact ? `<a href="mailto:${esc(cfg.legalContact)}">${esc(cfg.legalContact)}</a>` : filled("", "contact email address");
  const law = filled(cfg.legalLaw, "country / state whose law applies");
  const s = `
<h2>1. This agreement</h2>
<p>These terms are an agreement between you and ${name} ("we", "us") for your use of LevelUp at ${esc(origin)} (the "service"). By creating a workspace, accepting an invitation or using the service, you agree to them. If you use LevelUp for an organisation, you agree to them on its behalf and confirm that you may do so.</p>

<h2>2. Accounts and workspaces</h2>
<ul>
<li>A workspace belongs to the customer who created it. Its <b>owner</b> manages its plan, billing, members and settings. The owner may make other members admins.</li>
<li>You must give accurate details, keep your password to yourself and tell us straight away if you think someone else has used your account. You are responsible for what happens under your account.</li>
<li>Content created in a workspace is the workspace's. The owner can remove members, and when a member is removed, what they created stays in the workspace.</li>
<li>You must be at least 16 years old to use the service.</li>
</ul>

<h2>3. Free trial</h2>
<p>A new workspace may start with a free trial${cfg.trialDays > 0 ? ` of ${cfg.trialDays} days` : ""}. You don't need a card to start one, and each person gets one free trial. When the trial ends without a plan, the workspace is locked, not deleted: the owner can still choose a plan, download its data or close it. During a trial, daily allowances for AI requests and emails may be lower than on a paid plan.</p>

<h2>4. Plans, payment and renewal</h2>
<ul>
<li>Paid plans are billed in advance, monthly or yearly, through our payment processor Stripe. We never see or store your full card number.</li>
<li>A subscription renews automatically at the end of each period until it is cancelled. On a per-person plan, the charge follows the number of people in the workspace.</li>
<li>When you change plan, the price difference is worked out for the rest of the current period. An upgrade is charged straight away and only takes effect once the payment goes through. You are shown the amount before you confirm.</li>
<li>Prices don't include taxes unless we say they do. Sales tax or VAT may be added at checkout where the law requires it.</li>
<li>If a payment fails, you have ${cfg.graceDays} days to update your payment method. After that the workspace is locked until it is paid. Nothing is deleted.</li>
<li>We may change our prices. If we do, we will tell the workspace owner at least 30 days before the new price applies to them, and it will only apply from their next renewal.</li>
</ul>

<h2>5. Cancelling and refunds</h2>
<p>The owner can cancel at any time in Workspace settings → Plan &amp; billing. The workspace stays usable until the end of the period already paid for. We don't refund unused parts of a period, except where the law requires us to.</p>

<h2>6. Your content</h2>
<p>You keep all rights to what you put into LevelUp. You give us permission to store, copy, transmit and process it only as far as we need to run the service for you. That includes making backups and, when you use an AI feature, sending the text the request needs to the AI provider in use. We don't sell your content or use it to train AI models. You are responsible for having the right to the content you add and to share it with the people you share it with.</p>

<h2>7. Acceptable use</h2>
<p>You must not:</p>
<ul>
<li>break the law, or store or send content that is unlawful, infringes someone else's rights, or is meant to harass or harm;</li>
<li>send spam or unwanted bulk email through LevelUp's email features;</li>
<li>try to get into other workspaces or accounts, test or get around our security, or get around plan limits;</li>
<li>upload malware, or overload or disrupt the service;</li>
<li>resell the service or copy it to build a competing product without our written permission.</li>
</ul>

<h2>8. AI features</h2>
<p>AI answers and suggestions can be wrong or incomplete. Check them before you rely on them. The assistant only changes your data in the ways the workspace allows, and you are responsible for the actions you approve.</p>

<h2>9. Services you connect</h2>
<p>You can connect other services, such as Microsoft 365, Google, a mailbox, your own file storage or bank data through SimpleFIN. Your use of those services is governed by their own terms. We aren't responsible for whether they are available or for what they do with your data.</p>

<h2>10. The service and changes to it</h2>
<p>We work to keep LevelUp available and your data safe, but we don't promise the service will always be available or free of errors. We may add, change or remove features. If a change takes away something important that you pay for, we will tell you before it happens.</p>

<h2>11. Suspension and closing</h2>
<p>We may suspend or close a workspace that breaks these terms, isn't paid for, or puts the service or other customers at risk. Where we reasonably can, we will warn you first. The owner can close the workspace at any time. A closed workspace and everything in it is deleted for good 30 days after closing. Download anything you want to keep before then.</p>

<h2>12. Warranties and liability</h2>
<p>As far as the law allows, the service is provided "as is", without warranties of any kind. As far as the law allows, we are not liable for indirect or consequential losses, such as lost profits or lost data. Our total liability for any claim is limited to what you paid us for the service in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law, or takes away rights you have as a consumer.</p>

<h2>13. Changes to these terms</h2>
<p>We may update these terms. If a change is significant, we will tell workspace owners by email or in the app at least 30 days before it takes effect. If you keep using the service after that, you accept the new terms.</p>

<h2>14. Governing law</h2>
<p>These terms are governed by the laws of ${law}, except where the law of the country you live in says otherwise.</p>

<h2>15. Contact</h2>
<p>For questions about these terms, contact ${name} at ${contact}.</p>`;
  return legalShell("terms", d, s);
}

// ── Privacy ─────────────────────────────────────────────────────────────────
export function privacyHtml(d: PageData): string {
  const { cfg } = d;
  const name = filled(cfg.legalName, "your legal business name");
  const contact = cfg.legalContact ? `<a href="mailto:${esc(cfg.legalContact)}">${esc(cfg.legalContact)}</a>` : filled("", "contact email address");
  const s = `
<p>This policy explains what LevelUp collects, why, who else handles it, and the choices you have.</p>

<h2>1. Who is responsible</h2>
<p>${name} runs LevelUp and is responsible for your account data. When an organisation uses LevelUp, the organisation decides what goes into its workspace and is responsible for that content. We handle that content for the organisation. You can reach us at ${contact}.</p>

<h2>2. What we collect</h2>
<ul>
<li><b>Your account:</b> your name, email address, workspace name and role. Your password is stored only as a one-way hash, so we can't read it.</li>
<li><b>What you put in:</b> tasks, notes, projects, calendar entries, journal entries, goals, habits, budget and money records, comments, and files you upload.</li>
<li><b>Connected accounts:</b> when you connect Microsoft 365, Google, a mailbox, bank data through SimpleFIN, or your own file storage, we store the access tokens or passwords needed (encrypted) and the data those services send back, such as calendar events, mail or transactions, as far as the features you use need it.</li>
<li><b>Billing:</b> your plan, its status, invoices, and the customer and subscription identifiers Stripe gives us. Stripe handles your card details. We never see or store your full card number.</li>
<li><b>Security and running the service:</b> sign-in attempts and IP addresses (to block password guessing), a record of administrative actions, a log of the emails the service sends, error reports, and, if you turn notifications on, your browser's push subscription.</li>
</ul>
<p>We don't use advertising or analytics trackers.</p>

<h2>3. Cookies and storage on your device</h2>
<ul>
<li>One sign-in cookie keeps you signed in. Scripts on the page can't read it.</li>
<li>A small cookie, <code>lu_app</code>, remembers that this browser has opened the app, so you go straight to it instead of this front page.</li>
<li>The app keeps a working copy of your data in your browser's local storage, so it's fast and works through short outages. You can clear it in Settings → Privacy.</li>
<li>The app loads its typeface from Google Fonts, so Google receives your IP address when the app opens. The front page and these legal pages load nothing from other sites.</li>
</ul>

<h2>4. How we use it</h2>
<p>We use it to run the service you signed up for: storing and syncing your data, sending the emails you ask for or turn on (confirmations, invitations, reminders, digests, check-ins), billing, keeping the service and your account secure, answering support requests, and meeting legal obligations. We don't sell personal data, show ads, or use your content to train AI models.</p>

<h2>5. Who else handles it</h2>
<p>We use these service providers. Each gets only what it needs for its job:</p>
<ul>
<li><b>Hosting:</b> Railway runs our servers and database. Uploaded files are kept in LevelUp's cloud file storage, or in your own S3 bucket or Google Drive if your workspace connects one.</li>
<li><b>AI providers</b> (OpenAI, Anthropic or Google, depending on the workspace's settings): only when you use an AI feature, and only the text that request needs, such as your question and the notes or tasks it's about.</li>
<li><b>Stripe</b> for payments.</li>
<li><b>Email delivery:</b> the mail service that sends LevelUp's emails, or your own mailbox if you connect one.</li>
<li><b>Services you connect</b> yourself, such as Microsoft, Google and SimpleFIN.</li>
<li><b>Browser push services</b> (from Apple, Google or Mozilla) carry notification text to your device if you turn notifications on.</li>
</ul>
<p>Within your workspace, other members see only what is shared with them. We may disclose information when the law requires it, or to protect people or the service.</p>

<h2>6. How long we keep it</h2>
<ul>
<li>Your content stays for as long as your workspace exists. When a workspace is closed, it is deleted for good 30 days later.</li>
<li>Deleted notes stay in the Trash for 30 days.</li>
<li>Email and task logs are deleted after 90 days (the operator can shorten this).</li>
<li>Nightly backups are encrypted and kept for ${filled("", "backup retention period")}. Something you delete can stay in a backup until that backup is deleted.</li>
</ul>

<h2>7. Security</h2>
<p>Connections are encrypted (HTTPS). Passwords are hashed. Stored keys and passwords for connected services are encrypted. Backups are encrypted. Each workspace is kept separate from every other, sign-in attempts are limited, and private files are only served to signed-in members of their workspace. No system is perfectly secure. If a breach affects your data, we will tell you as the law requires.</p>

<h2>8. Your rights</h2>
<p>Depending on where you live, you may have the right to see, correct, export or delete your personal data, to object to or restrict how we use it, and to complain to your data protection authority. You can change your name and email in Settings, and the workspace owner can download everything in the workspace at any time. For anything else, contact us at ${contact}. If your workspace belongs to an organisation, we may send your request on to that organisation.</p>

<h2>9. International transfers</h2>
<p>Our providers may process data in the United States and other countries. Where the law requires it, we rely on safeguards such as standard contractual clauses.</p>

<h2>10. Children</h2>
<p>LevelUp is not meant for anyone under 16, and we don't knowingly collect their data.</p>

<h2>11. Changes</h2>
<p>If we make significant changes to this policy, we will tell workspace owners by email or in the app before they take effect.</p>`;
  return legalShell("privacy", d, s);
}

// ── routes ──────────────────────────────────────────────────────────────────
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";

function send(res: Response, html: string, cache: string) {
  res.setHeader("Content-Security-Policy", PAGE_CSP);
  res.setHeader("Cache-Control", cache);
  res.setHeader("Vary", "Cookie");
  res.status(200).type("html").send(html);
}
function hasCookie(req: Request, name: string): boolean {
  return String(req.headers.cookie || "").split(";").some((c) => c.trim().split("=")[0] === name);
}

export function registerPublicPages(app: Express, deps: PublicDeps = defaultDeps()) {
  const page = (render: (d: PageData) => string, cache: string) => async (_req: Request, res: Response, next: NextFunction) => {
    try { send(res, render(await deps.data()), cache); }
    catch (e) { console.error("[public pages]", (e as any)?.message || e); next(); }
  };
  app.get(["/welcome", "/pricing"], page(landingHtml, "no-cache"));
  app.get("/terms", page(termsHtml, "no-cache"));
  app.get("/privacy", page(privacyHtml, "no-cache"));
  // "/" — the front page for first-time visitors only (see the top of this file)
  app.get("/", async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (req.originalUrl !== "/") return next();
      if (hasCookie(req, "lu_app")) return next();
      if (await deps.hasSession(req)) return next();
      const d = await deps.data();
      if (!d.cfg.frontPage || !d.signupOpen) return next();
      send(res, landingHtml(d), "no-store");
    } catch (e) {
      console.error("[public pages] /", (e as any)?.message || e);
      next();
    }
  });
}

let _memo: { at: number; v: PageData } | null = null;
export function _resetPublicPagesForTests() { _memo = null; }
function defaultDeps(): PublicDeps {
  return {
    hasSession: async (req) => (await import("./sdk")).sdk.hasValidSessionCookie(req),
    data: async () => {
      if (_memo && Date.now() - _memo.at < 30_000) return _memo.v;
      const [{ billingConfig }, billing, { signupReady }, { appOrigin }] = await Promise.all([
        import("./plans"), import("./billing"), import("./signup"), import("./appOrigin"),
      ]);
      const cfg = await billingConfig();
      const [ready, sellable] = await Promise.all([signupReady(), billing.sellable()]);
      const plans = sellable ? ((await billing.publicPlans()) as PublicPlan[]) : (cfg.plans.filter((p) => p.public).map((p) => ({ key: p.key, name: p.name, blurb: p.blurb, perSeat: p.perSeat, members: p.members, ai: p.ai, email: p.email, storageMb: p.storageMb, monthly: null, yearly: null, buyable: false })));
      const v: PageData = { cfg, plans, signupOpen: ready.ok, origin: appOrigin() };
      _memo = { at: Date.now(), v };
      return v;
    },
  };
}
