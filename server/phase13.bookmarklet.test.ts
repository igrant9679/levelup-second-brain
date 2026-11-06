/**
 * Audit F2 (build -273): the bookmarklet never saves on a GET, and a POST
 * needs both the session and a same-origin Origin/Referer.
 */
import { describe, expect, it, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { AddressInfo } from "net";

const created: any[] = [];
vi.mock("./db", () => ({
  getBookmarkByUrl: vi.fn(async () => null),
  createBookmark: vi.fn(async (b: any) => { created.push(b); }),
}));
vi.mock("./routers/bookmarks", () => ({
  extractPageMetadata: vi.fn(async () => ({ title: "Example <b>page</b>", description: null, favicon: null, ogImage: null, siteName: null })),
}));

import { registerBookmarkletRoutes } from "./_core/bookmarklet";

let base = "";
let server: any;
let signedIn = true;
beforeAll(async () => {
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  registerBookmarkletRoutes(app as any, { authenticateRequest: async () => (signedIn ? { id: 7 } : null) });
  await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());
beforeEach(() => { created.length = 0; signedIn = true; });

const form = (o: Record<string, string>) => new URLSearchParams(o).toString();
const post = (headers: Record<string, string>, body: Record<string, string>) =>
  fetch(base + "/api/bookmarklet/save", { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: form(body) });

describe("bookmarklet (F2)", () => {
  it("GET only shows a confirm page with an escaped, posting form — nothing saved", async () => {
    const r = await fetch(base + "/api/bookmarklet/save?url=" + encodeURIComponent("https://example.com/?q=<x>") + "&title=" + encodeURIComponent('A "quoted" <script>'));
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(created.length).toBe(0);
    expect(html).toContain('method="post"');
    expect(html).not.toContain("<script>alert");
    expect(html).not.toMatch(/<script>[^<]*quoted/);
    expect(html).toContain("&lt;script&gt;");
    expect(r.headers.get("content-security-policy")).toContain("form-action 'self'");
  });
  it("refuses a cross-site POST, and one with no Origin/Referer", async () => {
    expect((await post({ origin: "https://evil.test" }, { url: "https://example.com" })).status).toBe(403);
    expect((await post({}, { url: "https://example.com" })).status).toBe(403);
    expect((await post({ referer: "https://evil.test/page" }, { url: "https://example.com" })).status).toBe(403);
    expect(created.length).toBe(0);
  });
  it("refuses a same-origin POST without a session", async () => {
    signedIn = false;
    expect((await post({ origin: base }, { url: "https://example.com" })).status).toBe(401);
    expect(created.length).toBe(0);
  });
  it("saves on a same-origin signed-in POST, http(s) only", async () => {
    const r = await post({ origin: base }, { url: "https://example.com/a", title: "Hello" });
    expect(r.status).toBe(200);
    expect(created).toEqual([expect.objectContaining({ userId: 7, url: "https://example.com/a", title: "Hello" })]);
    expect(await r.text()).toContain("Example &lt;b&gt;page&lt;/b&gt;");
    expect((await post({ origin: base }, { url: "javascript:alert(1)" })).status).toBe(400);
    expect(created.length).toBe(1);
  });
});
