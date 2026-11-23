/**
 * Build -290: the public front page, and the draft Terms and Privacy pages.
 * Pure renderers + the routes on a real express app (deps injected), plus the
 * new billingConfig fields.
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { normalizeConfig } from "./_core/plans";
import fs from "fs";
import path from "path";
import { landingHtml, termsHtml, privacyHtml, money, registerPublicPages, shot, TOUR, type PageData, type PublicPlan } from "./_core/publicPages";

const plan = (o: Partial<PublicPlan>): PublicPlan => ({
  key: "solo", name: "Solo", blurb: "", perSeat: false, members: 1, ai: 300, email: 100, storageMb: 2048,
  monthly: null, yearly: null, buyable: false, ...o,
});
const data = (o: Partial<PageData> & { cfg?: any } = {}): PageData => ({
  cfg: normalizeConfig({ trialDays: 14, ...(o.cfg || {}) }),
  plans: o.plans ?? [
    plan({ key: "solo", name: "Solo", monthly: { amount: 1200, currency: "usd", interval: "month" }, yearly: { amount: 12000, currency: "usd", interval: "year" }, buyable: true }),
    plan({ key: "team", name: "Team", perSeat: true, members: 25, storageMb: 20480, monthly: { amount: 950, currency: "usd", interval: "month" }, buyable: true }),
  ],
  signupOpen: o.signupOpen ?? true,
  origin: o.origin ?? "https://levelup.test",
});
const scriptFree = (html: string) => {
  expect(html).not.toMatch(/<script/i);
  expect(html).not.toMatch(/<[a-z][^>]*\son[a-z]+\s*=/i);   // no handler attribute inside a real tag
  expect(html).not.toMatch(/javascript:/i);
};

describe("prices", () => {
  it("formats Stripe amounts", () => {
    expect(money({ amount: 1200, currency: "usd" })).toBe("$12");
    expect(money({ amount: 1250, currency: "usd" })).toBe("$12.50");
    expect(money({ amount: 999, currency: "eur" })).toBe("€9.99");
    expect(money({ amount: 1200, currency: "jpy" })).toBe("¥1,200");   // zero-decimal currency
    expect(money({ amount: 500, currency: "zzz" })).toMatch(/5/);      // unknown currency never throws
  });
});

describe("front page", () => {
  it("shows real screenshots that exist, sized, described, and in both colour schemes (-291)", () => {
    const html = landingHtml(data());
    const imgs = Array.from(html.matchAll(/<img[^>]*src="(\/front\/[a-z]+-light\.webp)"[^>]*>/g));
    const darks = Array.from(html.matchAll(/<source srcset="(\/front\/[a-z]+-dark\.webp)" media="\(prefers-color-scheme:dark\)">/g));
    expect(imgs.length).toBe(1 + TOUR.length);          // the hero + one per tour row
    expect(darks.length).toBe(imgs.length);
    for (const m of [...imgs, ...darks]) {
      const file = path.join(__dirname, "../client/public", m[1]);
      expect(fs.existsSync(file), m[1]).toBe(true);
      expect(fs.statSync(file).size).toBeLessThan(400 * 1024);   // a public page: keep them light
    }
    for (const m of imgs) {
      expect(m[0]).toMatch(/ alt="[^"]{30,}"/);         // described for screen readers
      expect(m[0]).toMatch(/ width="\d+" height="\d+"/); // no layout jump while they load
    }
    // Only the first one loads eagerly.
    expect(imgs.filter((m) => /loading="lazy"/.test(m[0])).length).toBe(imgs.length - 1);
    expect(imgs[0][0]).toContain('fetchpriority="high"');
    expect(shot("x", '"><b>', 1, 1)).not.toContain("<b>");
  });
  it("shows the plans with Stripe's prices, the yearly saving, and trial links", () => {
    const html = landingHtml(data());
    scriptFree(html);
    expect(html).toContain("$12");
    expect(html).toContain("or $120 / year (save 17%)");
    expect(html).toContain("$9.50");
    expect(html).toContain(" per person");
    expect(html).toContain("Up to 25 people");
    expect(html).toContain("20 GB of file storage");
    expect(html).toContain('href="/?start=signup"');
    expect(html).toContain("Start your 14-day free trial");
    expect(html).toContain("No card needed");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });
  it("escapes everything that comes from the config", () => {
    const evil = '<img src=x onerror="alert(1)">';
    const html = landingHtml(data({
      plans: [plan({ key: "solo", name: evil, blurb: `"><script>alert(2)</script>`, monthly: { amount: 100, currency: "usd", interval: "month" }, buyable: true })],
      cfg: { legalName: evil, legalContact: "a@b.co" },
    }));
    scriptFree(html);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x");
    expect(normalizeConfig({ legalName: evil }).legalName).not.toMatch(/[<>]/);
  });
  it("hides plans that can't be bought; before any price is set it previews limits as 'coming soon'", () => {
    const one = landingHtml(data({ plans: [plan({ key: "a", name: "Alpha", monthly: { amount: 500, currency: "usd", interval: "month" }, buyable: true }), plan({ key: "b", name: "Bravo" })] }));
    expect(one).toContain("Alpha");
    expect(one).not.toContain("Bravo");
    const none = landingHtml(data({ plans: [plan({ key: "b", name: "Bravo" })], signupOpen: false }));
    expect(none).toContain("Bravo");
    expect(none).toContain("Price coming soon");
    expect(none).not.toContain("start=signup");          // sign-up not offered: no trial buttons
    expect(none).toContain('href="/?signin"');
  });
  it("links to the operator's own Terms / Privacy when set", () => {
    const html = landingHtml(data({ cfg: { termsUrl: "https://acme.test/t", privacyUrl: "https://acme.test/p" } }));
    expect(html).toContain('href="https://acme.test/t"');
    expect(html).toContain('href="https://acme.test/p"');
  });
});

describe("Terms and Privacy drafts", () => {
  it("show visible placeholders and a Draft notice until filled in and reviewed", () => {
    for (const fn of [termsHtml, privacyHtml]) {
      const html = fn(data());
      scriptFree(html);
      expect(html).toContain('<mark class="ph">');
      expect(html).toContain("Draft.");
    }
    expect(termsHtml(data())).toContain("[your legal business name]");
    expect(privacyHtml(data())).toContain("[backup retention period]");
  });
  it("fill in the operator's details, escaped, and drop the notice once reviewed", () => {
    const d = data({ cfg: { legalName: "Acme & Co", legalContact: "help@acme.test", legalLaw: "the State of New York", legalReviewed: true, graceDays: 5 } });
    const t = termsHtml(d);
    expect(t).toContain("Acme &amp; Co");
    expect(t).toContain('href="mailto:help@acme.test"');
    expect(t).toContain("the laws of the State of New York");
    expect(t).toContain("you have 5 days to update");
    expect(t).not.toContain("Draft.");
    expect(t).not.toContain("[your legal business name]");
    const p = privacyHtml(d);
    expect(p).not.toContain("Draft.");
    expect(p).toContain("[backup retention period]");   // not a config value: stays until the text is edited
  });
});

describe("config fields", () => {
  it("defaults and validation", () => {
    expect(normalizeConfig(null)).toMatchObject({ frontPage: true, legalName: "", legalContact: "", legalLaw: "", legalReviewed: false });
    const c = normalizeConfig({ frontPage: false, legalName: "  Acme\u0000\nInc  ", legalContact: "not an email", legalLaw: "x".repeat(200), legalReviewed: "yes" });
    expect(c.frontPage).toBe(false);
    expect(c.legalName).toBe("Acme Inc");
    expect(c.legalContact).toBe("");
    expect(c.legalLaw.length).toBe(80);
    expect(c.legalReviewed).toBe(false);                 // only the boolean true
    expect(normalizeConfig({ legalContact: "help@acme.test", legalReviewed: true })).toMatchObject({ legalContact: "help@acme.test", legalReviewed: true });
  });
});

describe("routes", () => {
  let base = "";
  let server: any;
  let session = false;
  let d: PageData;
  beforeAll(async () => {
    const app = express();
    registerPublicPages(app as any, { hasSession: async () => session, data: async () => d });
    app.use("*", (_req, res) => { res.status(200).type("html").send("<!doctype html><title>APP</title>"); });
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server?.close());
  beforeEach(() => { session = false; d = data(); });

  const get = async (path: string, cookie?: string) => {
    const r = await fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: "manual" });
    const text = await r.text();
    return { r, text, landing: text.includes("Plans and pricing"), app: text.includes("<title>APP</title>") };
  };

  it("'/' shows the front page to a first-time visitor once sign-up is offered", async () => {
    const x = await get("/");
    expect(x.landing).toBe(true);
    const csp = x.r.headers.get("content-security-policy") || "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toMatch(/script-src/);
    expect(x.r.headers.get("cache-control")).toBe("no-store");
    expect(x.r.headers.get("vary")).toMatch(/cookie/i);
  });
  it("everyone else gets the app at '/'", async () => {
    expect((await get("/", "lu_app=1")).app).toBe(true);
    expect((await get("/", "other=1; lu_app=1")).app).toBe(true);
    session = true;
    expect((await get("/")).app).toBe(true);
    session = false;
    expect((await get("/?signup=" + "a".repeat(64))).app).toBe(true);
    expect((await get("/?signin")).app).toBe(true);
    expect((await get("/?start=signup")).app).toBe(true);
    d = data({ signupOpen: false });
    expect((await get("/")).app).toBe(true);
    d = data({ cfg: { frontPage: false } });
    expect((await get("/")).app).toBe(true);
    d = data();
    expect((await get("/", "xlu_app=1")).landing).toBe(true);   // a cookie that only ends in lu_app doesn't count
  });
  it("/welcome, /pricing, /terms and /privacy are always served", async () => {
    d = data({ signupOpen: false, cfg: { frontPage: false } });
    session = true;
    for (const p of ["/welcome", "/pricing"]) expect((await get(p, "lu_app=1")).landing).toBe(true);
    const t = await get("/terms");
    expect(t.text).toContain("Terms of Service");
    expect(t.r.headers.get("content-security-policy")).not.toMatch(/script-src/);
    expect((await get("/privacy")).text).toContain("Privacy Policy");
  });
  it("a failure falls through to the app instead of an error page", async () => {
    const app = express();
    registerPublicPages(app as any, { hasSession: async () => false, data: async () => { throw new Error("db down"); } });
    app.use("*", (_req, res) => { res.status(200).send("APP"); });
    const s: any = await new Promise((r) => { const x = app.listen(0, "127.0.0.1", () => r(x)); });
    const b = `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
    const orig = console.error; console.error = () => {};
    try {
      expect(await (await fetch(b + "/")).text()).toBe("APP");
      expect(await (await fetch(b + "/terms")).text()).toBe("APP");
    } finally { console.error = orig; s.close(); }
  });
});
