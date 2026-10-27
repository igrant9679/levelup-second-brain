/**
 * Builds -243/-244: note links, checklists, tables and full-text search.
 * Runs the SHIPPED converters (app-1-core.js) and search helpers
 * (app-3-notes.js) in a vm: a link chip reads back as [[Title]] in the
 * derived body (so backlinks keep working), checklists and tables survive
 * the round trip, imported tables are left alone, and search finds, ranks,
 * excludes and marks the right notes.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

const JS = path.join(__dirname, "../client/public/js");
const CORE = fs.readFileSync(path.join(JS, "app-1-core.js"), "latin1").replace(/\r\n/g, "\n");
const NOTES = fs.readFileSync(path.join(JS, "app-3-notes.js"), "utf8").replace(/\r\n/g, "\n");
function grabFrom(src: string, name: string): string {
  const i = src.indexOf(`function ${name}(`);
  if (i < 0) throw new Error("missing " + name);
  const rest = src.slice(i + 1);
  const m = rest.match(/\n(?=(?:async )?function |const |let |var |\/\/|\/\*|try\{|\(function|if\()/);
  return src.slice(i, m ? i + 1 + (m.index as number) : src.length);
}
function line(src: string, prefix: string): string {
  const i = src.indexOf(prefix);
  if (i < 0) throw new Error("missing " + prefix);
  return src.slice(i, src.indexOf("\n", i));
}
const CLIENT = [
  ...["luSanitizeHtml", "_luRTE_isHtml", "renderMd", "_renderMdRaw", "luRTE_htmlToMd"].map((n) => grabFrom(CORE, n)),
  "function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');}",
  line(NOTES, "const _noteSearchCache="),
  ...["_noteFold", "_noteSearchText", "_noteParseQuery", "_noteSearchScore", "_noteSearchSnippet", "_noteMark"].map((n) => grabFrom(NOTES, n)),
].join("\n");
function ctx() {
  const c: any = { console, window: {} };
  vm.createContext(c);
  vm.runInContext(CLIENT, c);
  return c;
}

describe("note links, checklists and tables in the derived body", () => {
  const c = ctx();
  it("a link chip reads back as [[Title]]", () => {
    const md = c.luRTE_htmlToMd('<p>See <span class="lu-wiki" data-nid="4" contenteditable="false">Vendor review</span> today.</p>');
    expect(md).toContain("See [[Vendor review]] today.");
  });
  it("a checklist reads back as - [ ] / - [x] and renders back to a checklist", () => {
    const md = c.luRTE_htmlToMd('<ul class="lu-check"><li data-checked="true">Book flights</li><li data-checked="false">Pack</li></ul>');
    expect(md).toBe("- [x] Book flights\n- [ ] Pack");
    const html = c.renderMd(md);
    expect(html).toContain('class="lu-check"');
    expect(html).toContain('<li data-checked="true">Book flights</li>');
    expect(html).toContain('<li data-checked="false">Pack</li>');
  });
  it("a plain bullet list is unchanged", () => {
    expect(c.renderMd("- a\n- b")).not.toContain("lu-check");
  });
  it("tables made in a note read back as rows; imported tables are left alone", () => {
    const mine = c.luRTE_htmlToMd('<table class="lu-table"><tbody><tr><td>A</td><td>B</td></tr><tr><td>1</td><td>2</td></tr></tbody></table>');
    expect(mine).toContain("A | B |");
    expect(mine).toContain("1 | 2 |");
    const imported = c.luRTE_htmlToMd("<table><tr><td>A</td><td>B</td></tr></table>");
    expect(imported).toBe("AB");
  });
});

describe("full-text search", () => {
  const c = ctx();
  const notes = [
    { id: 1, title: "Budget review", tags: ["finance"], body: "We cut the travel budget by 10%. Café meeting next week." },
    { id: 2, title: "Travel plans", tags: ["personal"], body: "Flights to Lisbon. Budget: tight." },
    { id: 3, title: "Hiring", tags: ["team"], body: "Interview loop for the designer role.\n- [ ] Schedule [[Budget review]]" },
  ];
  const run = (q: string) => {
    const p = c._noteParseQuery(q);
    return notes.map((n) => ({ id: n.id, s: c._noteSearchScore(n, p) })).filter((r) => r.s > 0).sort((a, b) => b.s - a.s).map((r) => r.id);
  };
  it("every word must appear, anywhere in the note", () => {
    expect(run("budget travel")).toEqual([1, 2]);
    expect(run("designer interview")).toEqual([3]);
  });
  it("a title match ranks first", () => {
    expect(run("budget")[0]).toBe(1);
  });
  it("phrases, exclusions, tags and title: work", () => {
    expect(run('"travel budget"')).toEqual([1]);
    expect(run("budget -lisbon")).toEqual([1, 3]);
    expect(run("#fin")).toEqual([1]);
    expect(run("tag:team")).toEqual([3]);
    expect(run("title:plans budget")).toEqual([2]);
  });
  it("accents and case are ignored; link text counts", () => {
    expect(run("CAFE")).toEqual([1]);
    expect(run("schedule budget review")).toEqual([3]);
  });
  it("the snippet is the matching passage, escaped and marked", () => {
    const s = c._noteSearchSnippet({ id: 9, body: "x".repeat(300) + " the <b>Lisbon</b> trip & more" }, c._noteParseQuery("lisbon"));
    expect(s.startsWith("…")).toBe(true);
    expect(s).toContain('&lt;b&gt;<mark class="lu-mark">Lisbon</mark>&lt;/b&gt;');
    expect(s).toContain("&amp; more");
  });
  it("search text drops markdown but keeps words", () => {
    const t = c._noteSearchText({ body: "## Plan\n- [x] **Ship** the [site](https://x.io) ![img](a.png)" }).text;
    expect(t).toBe("Plan Ship the site");
  });
});
