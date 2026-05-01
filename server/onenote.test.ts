/**
 * Tests for the OneNote import router and HTML-to-Markdown converter.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { onenoteHtmlToMarkdown } from "./routers/onenote";

// ─── HTML → Markdown converter tests ─────────────────────────────────────────

describe("onenoteHtmlToMarkdown", () => {
  it("converts headings", () => {
    const html = "<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("# Title");
    expect(md).toContain("## Subtitle");
    expect(md).toContain("### Section");
  });

  it("converts bold and italic", () => {
    const html = "<p><strong>bold</strong> and <em>italic</em></p>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("**bold**");
    expect(md).toContain("_italic_");
  });

  it("converts unordered lists", () => {
    const html = "<ul><li>Item A</li><li>Item B</li></ul>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("- Item A");
    expect(md).toContain("- Item B");
  });

  it("converts ordered lists", () => {
    const html = "<ol><li>First</li><li>Second</li></ol>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("1. First");
    expect(md).toContain("2. Second");
  });

  it("converts hyperlinks", () => {
    const html = '<a href="https://example.com">Click here</a>';
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("[Click here](https://example.com)");
  });

  it("converts inline code", () => {
    const html = "<p>Use <code>npm install</code> to install</p>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("`npm install`");
  });

  it("converts code blocks", () => {
    const html = "<pre>const x = 1;\nconst y = 2;</pre>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("```");
    expect(md).toContain("const x = 1;");
  });

  it("converts strikethrough", () => {
    const html = "<s>deleted text</s>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("~~deleted text~~");
  });

  it("converts horizontal rules", () => {
    const html = "<p>Before</p><hr/><p>After</p>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("---");
  });

  it("decodes HTML entities", () => {
    const html = "<p>5 &amp; 3 &lt; 10 &gt; 2 &quot;quoted&quot; &nbsp;space</p>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("5 & 3 < 10 > 2");
    expect(md).toContain('"quoted"');
  });

  it("strips XML declarations and html/head/body wrappers", () => {
    const html = `<?xml version="1.0"?><!DOCTYPE html><html><head><title>Test</title></head><body><p>Content</p></body></html>`;
    const md = onenoteHtmlToMarkdown(html);
    expect(md).not.toContain("<?xml");
    expect(md).not.toContain("<html");
    expect(md).not.toContain("<head");
    expect(md).not.toContain("<body");
    expect(md).toContain("Content");
  });

  it("converts a basic table", () => {
    const html = `<table><tr><th>Name</th><th>Age</th></tr><tr><td>Alice</td><td>30</td></tr></table>`;
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("| Name | Age |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| Alice | 30 |");
  });

  it("removes remaining HTML tags", () => {
    const html = "<div><span>Hello</span> <span>World</span></div>";
    const md = onenoteHtmlToMarkdown(html);
    expect(md).not.toMatch(/<[^>]+>/);
    expect(md).toContain("Hello");
    expect(md).toContain("World");
  });

  it("collapses excessive blank lines", () => {
    const html = "<p>A</p><p></p><p></p><p></p><p>B</p>";
    const md = onenoteHtmlToMarkdown(html);
    // Should not have more than 2 consecutive newlines
    expect(md).not.toMatch(/\n{3,}/);
  });

  it("handles empty input gracefully", () => {
    expect(onenoteHtmlToMarkdown("")).toBe("");
    expect(onenoteHtmlToMarkdown("   ")).toBe("");
  });

  it("handles plain text without HTML tags", () => {
    const text = "Just plain text with no tags";
    const md = onenoteHtmlToMarkdown(text);
    expect(md).toBe(text);
  });

  it("converts images with alt text", () => {
    const html = '<img alt="diagram" src="https://example.com/img.png"/>';
    const md = onenoteHtmlToMarkdown(html);
    expect(md).toContain("![diagram](https://example.com/img.png)");
  });
});

// ─── Router procedure tests ───────────────────────────────────────────────────

// Mock the database module
vi.mock("../server/db", () => ({
  getOAuthToken: vi.fn(),
  upsertOAuthToken: vi.fn(),
  deleteOAuthToken: vi.fn(),
  getDb: vi.fn(() => null),
}));

import * as dbMod from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createCtx(userId?: number): TrpcContext {
  return {
    req: {} as any,
    res: {} as any,
    user: userId
      ? { id: userId, openId: "test-open-id", name: "Test User", email: "test@example.com", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(), loginMethod: null }
      : null,
  };
}

describe("onenote.status", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns connected=false when no token stored", async () => {
    vi.mocked(dbMod.getOAuthToken).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createCtx(1));
    const result = await caller.onenote.status();
    expect(result.connected).toBe(false);
    expect(result.latestJob).toBeNull();
  });

  it("returns connected=true when token exists", async () => {
    vi.mocked(dbMod.getOAuthToken).mockResolvedValue({
      id: 1,
      userId: 1,
      provider: "microsoft",
      accessToken: "tok_abc",
      refreshToken: "ref_abc",
      expiresAt: new Date(Date.now() + 3600 * 1000),
      scope: "offline_access User.Read Notes.Read Notes.ReadWrite",
      email: "idris@example.com",
      displayName: "Idris Grant",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const caller = appRouter.createCaller(createCtx(1));
    const result = await caller.onenote.status();
    expect(result.connected).toBe(true);
    expect(result.email).toBe("idris@example.com");
    expect(result.hasNotesScope).toBe(true);
  });

  it("throws UNAUTHORIZED when called without a user session", async () => {
    const caller = appRouter.createCaller(createCtx());
    await expect(caller.onenote.status()).rejects.toThrow();
  });
});

describe("onenote.getAuthUrl", () => {
  it("returns a Microsoft OAuth URL with Notes scope", async () => {
    vi.mocked(dbMod.getOAuthToken).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createCtx(1));
    const result = await caller.onenote.getAuthUrl({ origin: "https://example.com" });
    expect(result.url).toContain("login.microsoftonline.com");
    expect(result.url).toContain("Notes.Read");
    expect(result.url).toContain("example.com");
  });
});

describe("onenote.listNotebooks", () => {
  it("throws UNAUTHORIZED when Microsoft token is missing", async () => {
    vi.mocked(dbMod.getOAuthToken).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createCtx(1));
    await expect(caller.onenote.listNotebooks()).rejects.toThrow("Microsoft account not connected");
  });
});
