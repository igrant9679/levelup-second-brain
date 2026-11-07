/**
 * Audit 2026-11-06 medium/low (server): what comes in and goes out.
 *  - F21 mail hosts must be public (assertPublicHost; the SMTP/IMAP test refuses
 *    loopback / private / metadata addresses without connecting);
 *  - F22 1 MB bodies unless signed in; zip-bomb caps on .docx imports;
 *  - F35 avatars are real PNG/JPEG/WebP/GIF; new uploads are private and served
 *    by GET /api/files/… to signed-in users with safe headers.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";
import JSZip from "jszip";

vi.mock("./db", () => ({ getDb: vi.fn(async () => null) }));

import { assertPublicHost, publicConnectTarget } from "./_core/netGuard";
import { installBodyParsers, SMALL_BODY } from "./_core/bodyLimits";
import { assertZipWithinLimits, zipStats, ZIP_LIMITS } from "./_core/zipGuard";
import { registerFileRoutes, fileTypeFor, parseFileRef } from "./_core/fileProxy";
import { sniffImageType, userProfileRouter } from "./routers/userProfile";
import { oauthSyncRouter } from "./routers/oauth-sync";

async function serve(app: express.Express): Promise<{ url: string; close: () => Promise<void> }> {
  const srv = http.createServer(app);
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const port = (srv.address() as any).port;
  return { url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => srv.close(() => r())) };
}

describe("mail hosts (F21)", () => {
  it("refuses loopback, private, link-local / metadata and local names", async () => {
    for (const h of ["127.0.0.1", "localhost", "10.0.0.8", "192.168.1.20", "169.254.169.254", "[::1]", "fd00::5", "mail.internal", "printer.local", "0.0.0.0"])
      await expect(assertPublicHost(h)).rejects.toThrow();
    await expect(assertPublicHost("8.8.8.8")).resolves.toEqual({ host: "8.8.8.8", addresses: ["8.8.8.8"] });
    expect(await publicConnectTarget("1.1.1.1")).toEqual({ connectHost: "1.1.1.1", servername: undefined });
  });
  it("the SMTP/IMAP connection test never connects to an internal address", async () => {
    const c = oauthSyncRouter.createCaller({ user: { id: 5, role: "user" }, req: { headers: {} }, res: {} } as any);
    const t0 = Date.now();
    const r: any = await c.testSmtpImapConnection({
      imapHost: "169.254.169.254", imapPort: 993, imapEncryption: "ssl", imapUsername: "u", imapPassword: "p",
      smtpHost: "127.0.0.1", smtpPort: 25, smtpEncryption: "none", smtpUsername: "u", smtpPassword: "p",
    });
    expect(r.success).toBe(false);
    expect(r.smtp.message).toMatch(/public internet/);
    expect(r.imap.message).toMatch(/public internet/);
    expect(Date.now() - t0).toBeLessThan(3000); // refused up front, no connection timeout
  });
  it("saving a mail account with an internal host is refused", async () => {
    const c = oauthSyncRouter.createCaller({ user: { id: 5, role: "user" }, req: { headers: {} }, res: {} } as any);
    await expect(c.saveSmtpImapAccount({
      email: "a@b.com", imapHost: "10.1.1.1", imapPort: 993, imapEncryption: "ssl", imapUsername: "u", imapPassword: "p",
      smtpHost: "8.8.8.8", smtpPort: 587, smtpEncryption: "tls", smtpUsername: "u", smtpPassword: "p",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("body limits (F22)", () => {
  let s: { url: string; close: () => Promise<void> };
  beforeEach(async () => {
    const app = express();
    installBodyParsers(app, async (req) => String(req.headers.cookie || "").includes("valid-session"));
    app.post("/echo", (req, res) => res.json({ n: JSON.stringify(req.body).length }));
    app.use((err: any, _req: any, res: any, _next: any) => res.status(err.status || 500).json({ error: err.type || String(err) }));
    s = await serve(app);
  });
  afterEach(async () => { await s.close(); });
  const big = JSON.stringify({ blob: "x".repeat(SMALL_BODY + 1000) });
  it("refuses a body over 1 MB from an unauthenticated caller", async () => {
    const r = await fetch(s.url + "/echo", { method: "POST", headers: { "content-type": "application/json" }, body: big });
    expect(r.status).toBe(413);
  });
  it("accepts the same body from a signed-in caller", async () => {
    const r = await fetch(s.url + "/echo", { method: "POST", headers: { "content-type": "application/json", cookie: "app_session_id=valid-session" }, body: big });
    expect(r.status).toBe(200);
    expect((await r.json()).n).toBeGreaterThan(SMALL_BODY);
  });
  it("small bodies need no session", async () => {
    const r = await fetch(s.url + "/echo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ a: 1 }) });
    expect(r.status).toBe(200);
  });
});

describe("zip-bomb caps (F22)", () => {
  it("a normal .docx passes; non-zips pass", async () => {
    const z = new JSZip();
    z.file("[Content_Types].xml", "<Types/>");
    z.file("word/document.xml", "<w:document>" + "hello ".repeat(1000) + "</w:document>");
    const buf = await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(() => assertZipWithinLimits(buf)).not.toThrow();
    expect(zipStats(buf)!.entries).toBeGreaterThanOrEqual(2);
    expect(() => assertZipWithinLimits(Buffer.from("%PDF-1.7 ..."))).not.toThrow();
  });
  it("refuses an archive that unpacks to too much or holds too many parts", async () => {
    // 700 MB declared in one entry: build a tiny zip and patch its central directory sizes.
    const z = new JSZip();
    z.file("word/document.xml", "a".repeat(5000));
    const buf = await z.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const cd = buf.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    buf.writeUInt32LE(700 * 1024 * 1024, cd + 24);
    expect(() => assertZipWithinLimits(buf)).toThrow(/too large|unpacks/);
    const many = new JSZip();
    for (let i = 0; i <= ZIP_LIMITS.MAX_ENTRIES; i++) many.file(`p/${i}.xml`, "");
    const mbuf = await many.generateAsync({ type: "nodebuffer" });
    expect(() => assertZipWithinLimits(mbuf)).toThrow(/too many parts/);
  }, 60_000);
});

describe("uploads (F35)", () => {
  const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  it("avatars must really be PNG/JPEG/WebP/GIF", async () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
    const c = userProfileRouter.createCaller({ user: { id: 3, openId: "x" } } as any);
    await expect(c.uploadAvatar({ dataUrl: "data:image/png;base64," + Buffer.from("<html><script>x</script>").toString("base64"), mimeType: "image/png" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(c.uploadAvatar({ dataUrl: "data:text/html;base64,AAAA", mimeType: "text/html" as any })).rejects.toThrow();
  });
  it("file types come from an allow-list; only images and PDFs are inline", () => {
    expect(fileTypeFor("a.PNG")).toEqual({ type: "image/png", inline: true });
    expect(fileTypeFor("doc.pdf")).toEqual({ type: "application/pdf", inline: true });
    expect(fileTypeFor("x.svg")).toEqual({ type: "application/octet-stream", inline: false });
    expect(fileTypeFor("page.html")).toEqual({ type: "application/octet-stream", inline: false });
    expect(parseFileRef("d/1AbCdEfGhIjKlMn/photo.png")).toEqual({ kind: "d", id: "1AbCdEfGhIjKlMn", name: "photo.png" });
    expect(parseFileRef("d/short/x.png")).toBeNull();
    expect(parseFileRef("s/../etc/passwd")).toBeNull();
    expect(parseFileRef("x/abc")).toBeNull();
  });
  it("GET /api/files needs a session and sends safe headers", async () => {
    const app = express();
    const { Readable } = await import("stream");
    registerFileRoutes(app, {
      authenticate: async (req) => (String(req.headers.cookie || "").includes("ok") ? { id: 1 } : null),
      open: async () => ({ kind: "stream", body: Readable.from([PNG]), length: PNG.length }),
    });
    const s = await serve(app);
    try {
      expect((await fetch(s.url + "/api/files/d/1AbCdEfGhIjKlMn/photo.png")).status).toBe(401);
      const r = await fetch(s.url + "/api/files/d/1AbCdEfGhIjKlMn/photo.png", { headers: { cookie: "s=ok" } });
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("image/png");
      expect(r.headers.get("x-content-type-options")).toBe("nosniff");
      expect(r.headers.get("content-disposition")).toMatch(/^inline;/);
      expect(r.headers.get("cache-control")).toMatch(/private/);
      expect(Buffer.from(await r.arrayBuffer()).equals(PNG)).toBe(true);
      const h = await fetch(s.url + "/api/files/d/1AbCdEfGhIjKlMn/evil.html", { headers: { cookie: "s=ok" } });
      expect(h.headers.get("content-type")).toBe("application/octet-stream");
      expect(h.headers.get("content-disposition")).toMatch(/^attachment;/);
    } finally { await s.close(); }
  });
});

describe("private Drive uploads (F35)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => { globalThis.fetch = realFetch; vi.unstubAllEnvs(); vi.resetModules(); });
  it("new uploads get no public permission and an app URL; originals stay public", async () => {
    vi.stubEnv("GOOGLE_DRIVE_CLIENT_ID", "cid"); vi.stubEnv("GOOGLE_DRIVE_CLIENT_SECRET", "sec"); vi.stubEnv("GOOGLE_DRIVE_FOLDER_ID", "folder");
    vi.stubEnv("S3_BUCKET", ""); vi.stubEnv("S3_ACCESS_KEY_ID", ""); vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
    vi.resetModules();
    const storage = await import("./storage");
    storage._setDriveRefreshLookupForTests(async () => "refresh-token");
    storage.resetDriveTokenCache();
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url); calls.push(u);
      if (u.includes("oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", expires_in: 3600 }), { status: 200 });
      if (u.includes("/upload/drive/v3/files")) return new Response(JSON.stringify({ id: "FILEID1234567890" }), { status: 200 });
      if (u.includes("/permissions")) return new Response("{}", { status: 200 });
      return new Response("", { status: 404 });
    }) as any;
    const priv = await storage.storagePut("note-imports/x-img1.png", Buffer.from("png"), "image/png");
    expect(priv.url).toMatch(/^\/api\/files\/d\/FILEID1234567890\/x-img1_[0-9a-f]{8}\.png$/);
    expect(calls.some((c) => c.includes("/permissions"))).toBe(false);
    const pub = await storage.storagePut("note-originals/doc.docx", Buffer.from("docx"), "application/octet-stream", { public: true });
    expect(pub.url).toContain("drive.google.com/uc?export=download&id=FILEID1234567890");
    expect(calls.filter((c) => c.includes("/permissions")).length).toBe(1);
    storage._setDriveRefreshLookupForTests(null);
  });
});
