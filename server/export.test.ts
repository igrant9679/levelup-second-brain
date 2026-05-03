import { describe, it, expect } from "vitest";

// ──────────────────────────────────────────────────────────────────────────────
// Shared HTML-to-Markdown helper (mirrors the _htmlToMd function in index.html)
// ──────────────────────────────────────────────────────────────────────────────
function htmlToMd(html: string): string {
  if (!html) return "";
  return html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*")
    .replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*")
    .replace(/<u[^>]*>(.*?)<\/u>/gi, "_$1_")
    .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)")
    .replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
    .replace(/<div[^>]*>(.*?)<\/div>/gi, "$1\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .trim();
}

// ──────────────────────────────────────────────────────────────────────────────
// HTML → Markdown conversion tests
// ──────────────────────────────────────────────────────────────────────────────
describe("_htmlToMd — HTML to Markdown conversion", () => {
  it("converts headings", () => {
    expect(htmlToMd("<h1>Title</h1>")).toContain("# Title");
    expect(htmlToMd("<h2>Section</h2>")).toContain("## Section");
    expect(htmlToMd("<h3>Sub</h3>")).toContain("### Sub");
  });

  it("converts bold and italic", () => {
    expect(htmlToMd("<strong>bold</strong>")).toBe("**bold**");
    expect(htmlToMd("<b>bold</b>")).toBe("**bold**");
    expect(htmlToMd("<em>italic</em>")).toBe("*italic*");
    expect(htmlToMd("<i>italic</i>")).toBe("*italic*");
  });

  it("converts links", () => {
    expect(htmlToMd('<a href="https://example.com">click</a>')).toBe(
      "[click](https://example.com)"
    );
  });

  it("converts list items", () => {
    const result = htmlToMd("<li>Item one</li><li>Item two</li>");
    expect(result).toContain("- Item one");
    expect(result).toContain("- Item two");
  });

  it("strips unknown tags", () => {
    expect(htmlToMd("<span>plain text</span>")).toBe("plain text");
  });

  it("decodes HTML entities", () => {
    // &nbsp; becomes a regular space, then .trim() removes trailing whitespace
    expect(htmlToMd("&amp; &lt; &gt;")).toBe("& < >");
    expect(htmlToMd("&nbsp;")).toBe(""); // lone &nbsp; trims to empty
    const withNbsp = htmlToMd("hello&nbsp;world");
    expect(withNbsp).toContain("hello");
    expect(withNbsp).toContain("world");
  });

  it("returns empty string for empty input", () => {
    expect(htmlToMd("")).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Journal MD export logic tests
// ──────────────────────────────────────────────────────────────────────────────
interface JournalEntry {
  id: number;
  title: string;
  date: string;
  body?: string;
  diaryBody?: string;
  mood?: string;
  energy?: string;
  type?: string;
  gratitude?: string[];
  wins?: string[];
  improvements?: string[];
}

function buildJournalMD(entries: JournalEntry[]): string {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  let md = `# Journal Export\n\nExported — ${sorted.length} entr${sorted.length === 1 ? "y" : "ies"}\n\n---\n\n`;
  sorted.forEach((j) => {
    md += `## ${j.title || "Untitled Entry"}\n\n`;
    md += `**Date:** ${j.date || ""}  \n`;
    if (j.mood) md += `**Mood:** ${j.mood}  \n`;
    if (j.energy) md += `**Energy:** ${j.energy}  \n`;
    if (j.type) md += `**Type:** ${j.type}  \n`;
    md += `\n`;
    if (j.body) md += `${j.body}\n\n`;
    if (j.diaryBody) {
      const bodyMd = htmlToMd(j.diaryBody);
      if (bodyMd) md += `### Diary Entry\n\n${bodyMd}\n\n`;
    }
    if (j.gratitude?.filter(Boolean).length) {
      md += `### Gratitude\n\n${j.gratitude!.filter(Boolean).map((g) => `- ${g}`).join("\n")}\n\n`;
    }
    if (j.wins?.filter(Boolean).length) {
      md += `### Wins\n\n${j.wins!.filter(Boolean).map((w) => `- ${w}`).join("\n")}\n\n`;
    }
    if (j.improvements?.filter(Boolean).length) {
      md += `### Improvements\n\n${j.improvements!.filter(Boolean).map((i) => `- ${i}`).join("\n")}\n\n`;
    }
    md += `---\n\n`;
  });
  return md;
}

describe("exportJournalMD — Markdown export logic", () => {
  it("includes entry title and date", () => {
    const md = buildJournalMD([
      { id: 1, title: "My Entry", date: "2024-01-15", body: "Hello world" },
    ]);
    expect(md).toContain("## My Entry");
    expect(md).toContain("**Date:** 2024-01-15");
    expect(md).toContain("Hello world");
  });

  it("includes diaryBody rich text converted to markdown", () => {
    const md = buildJournalMD([
      {
        id: 1,
        title: "Rich Entry",
        date: "2024-01-15",
        diaryBody: "<strong>Bold thought</strong><p>A paragraph.</p>",
      },
    ]);
    expect(md).toContain("### Diary Entry");
    expect(md).toContain("**Bold thought**");
    expect(md).toContain("A paragraph.");
  });

  it("includes gratitude, wins, improvements", () => {
    const md = buildJournalMD([
      {
        id: 1,
        title: "Full Entry",
        date: "2024-01-15",
        gratitude: ["Family", "Health"],
        wins: ["Shipped feature"],
        improvements: ["Sleep earlier"],
      },
    ]);
    expect(md).toContain("### Gratitude");
    expect(md).toContain("- Family");
    expect(md).toContain("### Wins");
    expect(md).toContain("- Shipped feature");
    expect(md).toContain("### Improvements");
    expect(md).toContain("- Sleep earlier");
  });

  it("sorts entries newest first", () => {
    const md = buildJournalMD([
      { id: 1, title: "Older", date: "2024-01-01" },
      { id: 2, title: "Newer", date: "2024-06-15" },
    ]);
    const olderIdx = md.indexOf("## Older");
    const newerIdx = md.indexOf("## Newer");
    expect(newerIdx).toBeLessThan(olderIdx);
  });

  it("handles entries with no body or diaryBody gracefully", () => {
    const md = buildJournalMD([{ id: 1, title: "Empty", date: "2024-01-01" }]);
    expect(md).toContain("## Empty");
    expect(md).not.toContain("undefined");
    expect(md).not.toContain("null");
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Notes bulk MD export with bodyHtml tests
// ──────────────────────────────────────────────────────────────────────────────
interface Note {
  title: string;
  tags?: string[];
  source?: string;
  updated?: string;
  body?: string;
  bodyHtml?: string;
}

function buildNotesMD(notes: Note[]): string {
  return notes
    .map((n) => {
      const lines = [
        `# ${n.title}`,
        `> **Tags:** ${(n.tags || []).map((t) => "#" + t).join(" ")} | **Source:** ${n.source || ""} | **Updated:** ${n.updated || ""}`,
        "",
        n.body || "",
      ];
      if (n.bodyHtml) {
        const bodyMd = htmlToMd(n.bodyHtml);
        if (bodyMd) {
          lines.push("");
          lines.push("## Rich Text Body");
          lines.push("");
          lines.push(bodyMd);
        }
      }
      lines.push("");
      lines.push("---");
      return lines.join("\n");
    })
    .join("\n\n");
}

describe("exportNotesMarkdown — bodyHtml inclusion", () => {
  it("includes bodyHtml as a Rich Text Body section", () => {
    const md = buildNotesMD([
      {
        title: "My Note",
        body: "Short summary.",
        bodyHtml: "<h2>Details</h2><p>Full description here.</p>",
      },
    ]);
    expect(md).toContain("## Rich Text Body");
    expect(md).toContain("## Details");
    expect(md).toContain("Full description here.");
  });

  it("does not add Rich Text Body section when bodyHtml is absent", () => {
    const md = buildNotesMD([{ title: "Plain Note", body: "Just text." }]);
    expect(md).not.toContain("## Rich Text Body");
    expect(md).toContain("# Plain Note");
    expect(md).toContain("Just text.");
  });

  it("does not add Rich Text Body section when bodyHtml is empty", () => {
    const md = buildNotesMD([
      { title: "Empty RTE", body: "Body only.", bodyHtml: "" },
    ]);
    expect(md).not.toContain("## Rich Text Body");
  });

  it("includes tags and metadata in the header line", () => {
    const md = buildNotesMD([
      {
        title: "Tagged Note",
        tags: ["work", "ai"],
        source: "Manual",
        updated: "2024-06-01",
        body: "Content.",
      },
    ]);
    expect(md).toContain("#work");
    expect(md).toContain("#ai");
    expect(md).toContain("Manual");
    expect(md).toContain("2024-06-01");
  });

  it("handles multiple notes correctly", () => {
    const md = buildNotesMD([
      { title: "Note A", body: "A body." },
      { title: "Note B", body: "B body.", bodyHtml: "<p>B rich text.</p>" },
    ]);
    expect(md).toContain("# Note A");
    expect(md).toContain("# Note B");
    expect(md).toContain("B rich text.");
    // Note A should not have Rich Text Body
    const noteASection = md.substring(md.indexOf("# Note A"), md.indexOf("# Note B"));
    expect(noteASection).not.toContain("## Rich Text Body");
  });
});
