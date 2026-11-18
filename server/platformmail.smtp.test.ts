/**
 * Platform mail through a plain SMTP mailbox (build -287, MAIL_PROVIDER=smtp).
 * A tiny SMTP server on 127.0.0.1 receives what LevelUp sends, so the whole
 * conversation (login, envelope, headers, body) is checked on a real socket.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import net from "node:net";
import {
  _resetSmtpTransport, platformFromAddress, platformMailConfigured, sendViaPlatform, smtpTransportOptions,
} from "./_core/platformMail";

type Got = { auth: string; from: string; rcpt: string[]; data: string };
const got: Got[] = [];
let rejectAuth = false;
let server: net.Server;
let port = 0;

beforeAll(async () => {
  server = net.createServer((sock) => {
    let cur: Got = { auth: "", from: "", rcpt: [], data: "" };
    let inData = false, buf = "";
    sock.write("220 sink ESMTP\r\n");
    sock.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          cur.data = buf.slice(0, end); buf = buf.slice(end + 5); inData = false;
          got.push(cur); cur = { auth: "", from: "", rcpt: [], data: "" };
          sock.write("250 queued\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO") sock.write("250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
        else if (cmd === "HELO") sock.write("250 sink\r\n");
        else if (cmd === "AUTH") {
          cur.auth = Buffer.from(line.split(" ")[2] || "", "base64").toString("utf8");
          sock.write(rejectAuth ? "535 5.7.8 Username and Password not accepted\r\n" : "235 ok\r\n");
        } else if (cmd === "MAIL") { cur.from = line; sock.write("250 ok\r\n"); }
        else if (cmd === "RCPT") { cur.rcpt.push(line); sock.write("250 ok\r\n"); }
        else if (cmd === "DATA") { inData = true; sock.write("354 go\r\n"); }
        else if (cmd === "RSET" || cmd === "NOOP") sock.write("250 ok\r\n");
        else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
        else sock.write("502 no\r\n");
      }
    });
    sock.on("error", () => { /* client went away */ });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as net.AddressInfo).port;
});
afterAll(async () => { _resetSmtpTransport(); await new Promise((r) => server.close(() => r(null))); });

const KEYS = ["MAIL_PROVIDER", "MAIL_FROM", "MAIL_SMTP_HOST", "MAIL_SMTP_PORT", "MAIL_SMTP_USER", "MAIL_SMTP_PASS", "MAIL_SMTP_TLS", "MAIL_SMTP_PER_MINUTE", "MAIL_INBOUND_ADDRESS", "MAIL_TLS_INSECURE", "POSTMARK_SERVER_TOKEN", "RESEND_API_KEY"];
const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
function setEnv(v: Record<string, string>) { for (const k of KEYS) delete process.env[k]; Object.assign(process.env, v); _resetSmtpTransport(); }
afterEach(() => { for (const k of KEYS) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } _resetSmtpTransport(); got.length = 0; rejectAuth = false; });

const local = () => ({ MAIL_PROVIDER: "smtp", MAIL_SMTP_HOST: "127.0.0.1", MAIL_SMTP_PORT: String(port), MAIL_SMTP_USER: "notify@levelup.test", MAIL_SMTP_PASS: "app-pass-123", MAIL_SMTP_TLS: "none" });

describe("MAIL_PROVIDER=smtp", () => {
  it("is off until host, login and password are all set", () => {
    setEnv({ MAIL_PROVIDER: "smtp", MAIL_SMTP_HOST: "smtp.example.com", MAIL_SMTP_USER: "notify@example.com" });
    expect(platformMailConfigured()).toBe(false);
    setEnv({ MAIL_PROVIDER: "smtp", MAIL_SMTP_HOST: "smtp.example.com", MAIL_SMTP_USER: "notify@example.com", MAIL_SMTP_PASS: "x" });
    expect(platformMailConfigured()).toBe(true);
    // a login that is not an address and no MAIL_FROM: nothing to send as
    setEnv({ MAIL_PROVIDER: "smtp", MAIL_SMTP_HOST: "smtp.example.com", MAIL_SMTP_USER: "notify", MAIL_SMTP_PASS: "x" });
    expect(platformMailConfigured()).toBe(false);
    setEnv({ MAIL_PROVIDER: "smtp", MAIL_SMTP_HOST: "smtp.example.com", MAIL_SMTP_USER: "notify", MAIL_SMTP_PASS: "x", MAIL_FROM: "LevelUp <notify@example.com>" });
    expect(platformMailConfigured()).toBe(true);
    expect(platformFromAddress()).toBe("notify@example.com");
    // the SMTP settings alone do nothing without MAIL_PROVIDER=smtp
    setEnv({ MAIL_SMTP_HOST: "smtp.example.com", MAIL_SMTP_USER: "notify@example.com", MAIL_SMTP_PASS: "x" });
    expect(platformMailConfigured()).toBe(false);
  });

  it("never sends the password unencrypted to a real server", () => {
    const base = { MAIL_PROVIDER: "smtp", MAIL_SMTP_HOST: "smtp.example.com", MAIL_SMTP_USER: "notify@example.com", MAIL_SMTP_PASS: "x" };
    setEnv({ ...base, MAIL_SMTP_PORT: "465" });
    expect(smtpTransportOptions()).toMatchObject({ port: 465, secure: true, requireTLS: false, ignoreTLS: false, tls: { rejectUnauthorized: true } });
    setEnv({ ...base, MAIL_SMTP_PORT: "587" });
    expect(smtpTransportOptions()).toMatchObject({ port: 587, secure: false, requireTLS: true, ignoreTLS: false });
    setEnv({ ...base });
    expect(smtpTransportOptions()).toMatchObject({ port: 587, requireTLS: true });
    setEnv({ ...base, MAIL_SMTP_PORT: "2525" });
    expect(smtpTransportOptions()).toMatchObject({ port: 2525, secure: false, requireTLS: true });
    // plain text is only for a server on this machine
    setEnv({ ...base, MAIL_SMTP_PORT: "25", MAIL_SMTP_TLS: "none" });
    expect(smtpTransportOptions()).toMatchObject({ requireTLS: true, ignoreTLS: false });
    setEnv({ ...base, MAIL_SMTP_PORT: "70000" });
    expect(smtpTransportOptions()).toBeNull();
    setEnv({ ...base, MAIL_SMTP_PER_MINUTE: "20" });
    expect(smtpTransportOptions()).toMatchObject({ rateDelta: 60_000, rateLimit: 20, pool: true });
    setEnv({ ...base, MAIL_TLS_INSECURE: "true" });
    expect(smtpTransportOptions()).toMatchObject({ tls: { rejectUnauthorized: false } });
  });

  it("sends under the workspace's name from the mailbox, threaded, with the login it was given", async () => {
    setEnv(local());
    const r = await sendViaPlatform({
      to: "pat@customer.test", subject: "Your check-in", html: "<p>Hello <b>Pat</b></p>", text: "Hello Pat",
      fromName: "Acme \"Corp\" via LevelUp", messageId: "<coach.12.abcd@levelupnow.tools>",
      replyTo: "owner@acme.test", inReplyTo: "<coach.11.ffff@levelupnow.tools>", references: "<coach.11.ffff@levelupnow.tools>",
    });
    expect(r).toEqual({ ok: true });
    expect(got).toHaveLength(1);
    const m = got[0];
    expect(m.auth).toBe("\0notify@levelup.test\0app-pass-123");
    expect(m.from).toContain("<notify@levelup.test>");
    expect(m.rcpt).toEqual(["RCPT TO:<pat@customer.test>"]);
    // the quotes inside the name are dropped (they would break the header); the
    // library leaves out the outer quotes when the name doesn't need them
    expect(m.data).toMatch(/^From: "?Acme Corp via LevelUp"? <notify@levelup\.test>$/m);
    expect(m.data).toMatch(/^Reply-To: owner@acme\.test$/m);
    expect(m.data).toMatch(/^Message-ID: <coach\.12\.abcd@levelupnow\.tools>$/m);
    expect(m.data).toMatch(/^In-Reply-To: <coach\.11\.ffff@levelupnow\.tools>$/m);
    expect(m.data).toMatch(/^Subject: Your check-in$/m);
    expect(m.data).toContain("Hello Pat");
    expect(m.data).toContain("<b>Pat</b>");
  });

  it("sends as MAIL_FROM when it is set, and replies go to the platform inbox when there is one", async () => {
    setEnv({ ...local(), MAIL_FROM: "LevelUp <hello@levelup.test>", MAIL_INBOUND_ADDRESS: "reply@inbound.levelup.test" });
    const r = await sendViaPlatform({ to: "a@b.test", subject: "s", html: "<p>x</p>", fromName: "LevelUp", messageId: "<coach.5.aa11@levelupnow.tools>", replyTo: "owner@acme.test" });
    expect(r.ok).toBe(true);
    expect(got[0].data).toMatch(/^From: LevelUp <hello@levelup\.test>$/m);
    expect(got[0].data).toMatch(/^Reply-To: reply\+coach\.5\.aa11@inbound\.levelup\.test$/m);
  });

  it("a refused login is a failure with the server's reason (sendEmail then tries the workspace's own sender)", async () => {
    setEnv(local());
    rejectAuth = true;
    const r = await sendViaPlatform({ to: "a@b.test", subject: "s", html: "<p>x</p>", fromName: "LevelUp" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/^smtp: .*535/);
    expect(r.error).not.toContain("app-pass-123");
    expect(got).toHaveLength(0);
  });

  it("keeps one connection for several mails", async () => {
    setEnv(local());
    let conns = 0;
    const onConn = () => { conns++; };
    server.on("connection", onConn);
    try {
      for (let i = 0; i < 3; i++) {
        const r = await sendViaPlatform({ to: `p${i}@b.test`, subject: `n${i}`, html: "<p>x</p>", fromName: "LevelUp" });
        expect(r.ok).toBe(true);
      }
    } finally { server.off("connection", onConn); }
    expect(got.map((g) => g.rcpt[0])).toEqual(["RCPT TO:<p0@b.test>", "RCPT TO:<p1@b.test>", "RCPT TO:<p2@b.test>"]);
    expect(conns).toBe(1);
  });
});
