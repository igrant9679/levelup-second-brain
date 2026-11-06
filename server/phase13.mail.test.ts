/**
 * Audit F8 / F10 / F11 (build -273):
 *  - system mail only through the OWNER's accounts, TLS verified;
 *  - PM report recipients limited to known people;
 *  - delegate lookups by "u:" key take whole ids only, and nudges don't store addresses.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { systemSettings, oauthTokens, users, pmPeople, userAppData, smtpImapAccounts } from "../drizzle/schema";

const state: any = { setting: null, oauth: [], users: [{ id: 1 }], smtp: [], people: [], contacts: "[]", allEmails: [] };
function fakeDb() {
  const rowsFor = (t: any, fields: any) => {
    if (t === systemSettings) return state.setting ? [{ key: "notificationSender", value: state.setting }] : [];
    if (t === oauthTokens) return state.oauth;
    if (t === users) return fields && "email" in fields && !("name" in fields) ? state.allEmails.map((email: string) => ({ email })) : state.users;
    if (t === pmPeople) return state.people;
    if (t === userAppData) return [{ contacts: state.contacts }];
    if (t === smtpImapAccounts) return state.smtp;
    return [];
  };
  return {
    select(fields?: any) {
      const q: any = { t: null };
      const b: any = {
        from(t: any) { q.t = t; return b; }, where() { return b; }, orderBy() { return b; }, limit() { return b; },
        then(res: any, rej: any) { return Promise.resolve(rowsFor(q.t, fields)).then(res, rej); },
      };
      return b;
    },
  };
}
const built: any[] = [];
vi.mock("nodemailer", () => ({ default: { createTransport: (o: any) => { built.push(o); return { sendMail: vi.fn().mockResolvedValue({}) }; } } }));
vi.mock("./db", () => ({
  getDb: async () => fakeDb(),
  insertEmailDeliveryLog: vi.fn().mockResolvedValue(undefined),
  getAllSmtpAccounts: async () => state.smtp,
  getSmtpImapAccountFull: async (uid: number) => state.smtp.find((a: any) => a.userId === uid) || null,
}));

import { sendEmail } from "./_core/sendEmail";
import { mailTlsOptions, _resetOwnerIdsForTest } from "./_core/mailTrust";
import { knownRecipientEmails, resolvePerson } from "./_core/pmDelegation";

const acct = (userId: number, email: string) => ({ userId, email, smtpHost: `smtp.${userId}.test`, smtpPort: 587, smtpEncryption: "tls", smtpUsername: email, smtpPassword: "x", displayName: null });

beforeEach(() => {
  built.length = 0; _resetOwnerIdsForTest();
  Object.assign(state, { setting: null, oauth: [], users: [{ id: 1 }], smtp: [], people: [], contacts: "[]", allEmails: [] });
  delete process.env.MAIL_TLS_INSECURE;
});

describe("system mail sender (F8)", () => {
  it("never falls back to a member's SMTP or OAuth account", async () => {
    state.smtp = [acct(2, "member@x.test")];
    state.oauth = [{ userId: 3, provider: "google", email: "m3@x.test", refreshToken: "r", accessToken: "a" }];
    state.setting = "smtp:2"; // a stale pre-225 choice pointing at a member
    expect(await sendEmail({ to: "a@b.test", subject: "Reset", html: "<p>x</p>" })).toBe(false);
    expect(built.length).toBe(0);
  });
  it("uses the owner's account, with TLS certificates verified", async () => {
    state.smtp = [acct(2, "member@x.test"), acct(1, "owner@x.test")];
    expect(await sendEmail({ to: "a@b.test", subject: "Invite", html: "<p>x</p>" })).toBe(true);
    expect(built.length).toBe(1);
    expect(built[0].host).toBe("smtp.1.test");
    expect(built[0].tls).toEqual({ rejectUnauthorized: true });
  });
  it("MAIL_TLS_INSECURE=true is the only way to skip certificate checks", () => {
    expect(mailTlsOptions().rejectUnauthorized).toBe(true);
    process.env.MAIL_TLS_INSECURE = "true";
    expect(mailTlsOptions().rejectUnauthorized).toBe(false);
  });
});

describe("PM report recipients (F10) and delegate lookup (F11)", () => {
  it("knows workspace accounts, PM people and contacts only", async () => {
    state.allEmails = ["Owner@X.test", "member@x.test"];
    state.people = [{ email: "Vendor@Out.test" }];
    state.contacts = JSON.stringify([{ id: 1, email: "client@co.test" }, { id: 2, emails: [{ address: "alt@co.test" }, "plain@co.test"] }]);
    const k = await knownRecipientEmails(fakeDb(), 1);
    for (const a of ["owner@x.test", "member@x.test", "vendor@out.test", "client@co.test", "alt@co.test", "plain@co.test"]) expect(k.has(a)).toBe(true);
    expect(k.has("stranger@evil.test")).toBe(false);
  });
  it("a u: key must be a whole positive id", async () => {
    state.users = [{ id: 1, name: "Owner", email: "owner@x.test" }];
    expect(await resolvePerson(fakeDb(), 1, "u:1 OR 1=1")).toBeNull();
    expect(await resolvePerson(fakeDb(), 1, "u:-4")).toBeNull();
    expect(await resolvePerson(fakeDb(), 1, "u:1.5")).toBeNull();
    expect(await resolvePerson(fakeDb(), 1, "u:1")).toEqual({ name: "Owner", email: "owner@x.test" });
  });
});
