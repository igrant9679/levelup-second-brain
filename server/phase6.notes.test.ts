/**
 * Build -240: one note body. Runs the SHIPPED client helpers (app-3-notes.js
 * + the converters in app-1-core.js) in a vm: bodyHtml is the note, body is
 * derived from it, text that only the old body held is recovered into the
 * visible body, and two devices running the update produce the same note.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

const JS = path.join(__dirname, "../client/public/js");
const CORE = fs.readFileSync(path.join(JS, "app-1-core.js"), "latin1").replace(/\r\n/g, "\n");
const NOTES = fs.readFileSync(path.join(JS, "app-3-notes.js"), "utf8").replace(/\r\n/g, "\n");
const P2 = fs.readFileSync(path.join(JS, "app-part2.js"), "utf8").replace(/\r\n/g, "\n");
function grabFrom(src: string, name: string): string {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing " + name);
  const rest = src.slice(i + 1);
  const m = rest.match(/\n(?=(?:async )?function |const |let |var |\/\/|\/\*|try\{)/);
  return src.slice(i, m ? i + 1 + (m.index as number) : src.length);
}
function line(src: string, prefix: string): string {
  const i = src.indexOf(prefix);
  if (i < 0) throw new Error("missing " + prefix);
  return src.slice(i, src.indexOf("\n", i));
}
const CLIENT = [
  ...["luSanitizeHtml", "_luRTE_isHtml", "renderMd", "_renderMdRaw", "luRTE_htmlToMd", "fmtNoteDate"].map((n) => grabFrom(CORE, n)),
  line(NOTES, "const _noteBodySeen="),
  ...["_noteHasHtml", "_noteMdToHtml", "_noteHtml", "_noteTouch", "_noteSetHtml", "_noteSetMd", "_noteWords",
    "_noteHiddenLines", "_noteNormalize", "_noteFixRelTime", "_noteNormalizeAll"].map((n) => grabFrom(NOTES, n)),
  grabFrom(P2, "_luResolveConflict"),
].join("\n");

function device(notes: any[]) {
  const ctx: any = { console, window: {}, D: { notes: JSON.parse(JSON.stringify(notes)) } };
  vm.createContext(ctx);
  vm.runInContext(CLIENT, ctx);
  return ctx;
}

const RICH_WITH_HIDDEN = {
  id: 11, title: "Vendor review", createdAt: "2026-09-01T10:00:00.000Z", updated: "Just now",
  bodyHtml: "<p>Met with Acme about the renewal.</p><ul><li>Price up 8%</li><li>Support tier unchanged</li></ul>",
  // Written by the old AI Summary tool after the note became rich: nothing showed it.
  body: "## ✨ AI Summary\n\n- Negotiate multiyear discount before December\n- Escalate onboarding delays with their account director\n\n---\n\nMet with Acme about the renewal.\n- Price up 8%\n- Support tier unchanged",
};
const RICH_CLEAN = {
  id: 12, title: "Clean", updatedAt: "2026-10-01T09:00:00.000Z",
  bodyHtml: "<h2>Plan</h2><p>Ship the <strong>beta</strong> on Friday.</p>",
  body: "## Plan\nShip the **beta** on Friday.",
};
const WORD_IMPORT = {
  id: 13, title: "Policy",
  bodyHtml: "<h1>Travel policy</h1><p>Book flights 14 days ahead.</p><p>Economy for trips under six hours.</p>",
  body: "Travel policy\n\nBook flights 14 days ahead.\n\nEconomy for trips under six hours.",
};
const MD_ONLY = { id: 14, title: "Clip", body: "> Clipped from [Example](https://example.com)\n\nSee ![chart](https://img.example.com/c.png) and [[Vendor review]]." };

describe("one note body", () => {
  it("recovers text only the old body held, into the visible body", () => {
    const d = device([RICH_WITH_HIDDEN]);
    expect(d._noteNormalizeAll()).toBe(1);
    const n = d.D.notes[0];
    expect(n.bodyHtml).toContain("wasn’t showing until now");
    expect(n.bodyHtml).toContain("Negotiate multiyear discount");
    expect(n.bodyHtml).toContain("Escalate onboarding delays");
    // the text that was already visible is not duplicated
    expect(n.bodyHtml.split("Met with Acme").length - 1).toBe(1);
    expect(n.body).toContain("Negotiate multiyear discount");
    expect(n.body).toBe(d.luRTE_htmlToMd(n.bodyHtml));
    // "Just now" became a real time
    expect(n.updated).toBe("2026-09-01T10:00:00.000Z");
  });
  it("is idempotent and the same on two devices", () => {
    const a = device([RICH_WITH_HIDDEN, RICH_CLEAN, WORD_IMPORT]);
    const b = device([RICH_WITH_HIDDEN, RICH_CLEAN, WORD_IMPORT]);
    a._noteNormalizeAll(); b._noteNormalizeAll();
    expect(JSON.stringify(a.D.notes)).toBe(JSON.stringify(b.D.notes));
    // a fresh session on the updated notes changes nothing
    const c = device(a.D.notes);
    expect(c._noteNormalizeAll()).toBe(0);
  });
  it("does not add a recovery block when the two bodies say the same thing", () => {
    const d = device([RICH_CLEAN, WORD_IMPORT]);
    d._noteNormalizeAll();
    for (const n of d.D.notes) expect(n.bodyHtml).not.toContain("wasn’t showing");
    expect(d.D.notes[0].bodyHtml).toBe(RICH_CLEAN.bodyHtml);
    expect(d.D.notes[1].body).toBe(d.luRTE_htmlToMd(WORD_IMPORT.bodyHtml));
  });
  it("leaves markdown-only notes alone until edited, and keeps links and images when converting", () => {
    const d = device([MD_ONLY]);
    expect(d._noteNormalizeAll()).toBe(0);
    const n = d.D.notes[0];
    expect(n.bodyHtml).toBeUndefined();
    const html = d._noteHtml(n);
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('src="https://img.example.com/c.png"');
    expect(html).toContain("[[Vendor review]]");
    d._noteSetHtml(n, html);
    expect(n.bodyHtml).toContain("<img");
    expect(n.body).toContain("[Example](https://example.com)");
    expect(n.body).toContain("[[Vendor review]]");
    expect(n.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  it("_noteSetMd and _noteSetHtml keep body derived from bodyHtml", () => {
    const d = device([]);
    const n: any = { id: 1 };
    d._noteSetMd(n, "# Title\n\n- one\n- two");
    expect(n.bodyHtml).toContain("<h1");
    expect(n.bodyHtml).toContain("<li");
    expect(n.body).toBe(d.luRTE_htmlToMd(n.bodyHtml));
    d._noteSetHtml(n, "<p>x</p><script>alert(1)</script>");
    expect(n.bodyHtml).not.toContain("script");
  });
  it("formats ISO update times", () => {
    const d = device([]);
    expect(d.fmtNoteDate("2026-10-27T15:00:00.000Z")).toMatch(/Oct 2[67], 2026/);
  });
  it("a conflict with identical text adds nothing to the history", () => {
    const d = device([]);
    const sx = { id: 1, title: "A", body: "x", bodyHtml: "<p>x</p>", versions: [] };
    expect(d._luResolveConflict("notes", sx, { ...sx, updated: "other" })).toBe(sx);
    const kept = d._luResolveConflict("notes", sx, { ...sx, body: "y", bodyHtml: "<p>y</p>" });
    expect(kept.versions.length).toBe(1);
    expect(kept.versions[0].conflict).toBe(true);
  });
});
