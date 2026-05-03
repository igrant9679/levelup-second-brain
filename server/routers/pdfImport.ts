/**
 * PDF Import Router
 *
 * Accepts a PDF file as a base64 string, extracts text using pdf-parse,
 * and splits it into logical notes using one of two strategies:
 *
 * 1. Heading-based split: detects section headings (short lines ≤60 chars
 *    that are followed by body text) and creates one note per section.
 * 2. Page-based split: one note per page (fallback when no headings found).
 *
 * Returns an array of { name, content } objects for the client to preview
 * and selectively import.
 */

// pdf-parse v1 uses CommonJS exports; use createRequire for ESM compatibility
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse") as (buffer: Buffer, options?: Record<string, unknown>) => Promise<{ text: string; numpages: number; info: Record<string, unknown> }>;
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

interface ParsedNote {
  name: string;
  content: string;
  pageRange?: string;
}

interface ParseResult {
  notes: ParsedNote[];
  warnings: string[];
  strategy: "heading" | "page" | "single";
  totalPages: number;
}

/** Heuristic: is this line likely a section heading? */
function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  // All-caps line (≥3 chars)
  if (t === t.toUpperCase() && /[A-Z]{3,}/.test(t)) return true;
  // Title-case short line (≥3 words, each word starts with capital)
  const words = t.split(/\s+/);
  if (
    words.length >= 2 &&
    words.length <= 10 &&
    words.every((w) => /^[A-Z0-9"'(]/.test(w))
  )
    return true;
  // Numbered section: "1.", "1.1", "Chapter 1", "Section 2"
  if (/^(\d+\.[\d.]*\s+\S|Chapter\s+\d|Section\s+\d)/i.test(t)) return true;
  return false;
}

function splitByHeadings(pages: string[]): ParsedNote[] | null {
  const allLines = pages.join("\n").split("\n");
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;
  let headingCount = 0;

  for (const line of allLines) {
    if (isHeading(line)) {
      headingCount++;
      if (current) sections.push(current);
      current = { heading: line.trim(), lines: [] };
    } else {
      if (current) current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  // Need at least 2 headings to use heading-based split
  if (headingCount < 2) return null;

  return sections
    .filter((s) => s.lines.some((l) => l.trim()))
    .map((s, i) => {
      const body = s.lines
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      return {
        name: s.heading || `Section ${i + 1}`,
        content: body,
      };
    });
}

function splitByPages(pages: string[]): ParsedNote[] {
  return pages
    .map((pageText, i) => ({
      name: `Page ${i + 1}`,
      content: pageText.replace(/\n{3,}/g, "\n\n").trim(),
    }))
    .filter((n) => n.content.length > 0);
}

function deduplicateNames(notes: ParsedNote[]): ParsedNote[] {
  const counts: Record<string, number> = {};
  return notes.map((n) => {
    if (counts[n.name] === undefined) {
      counts[n.name] = 1;
      return n;
    }
    counts[n.name]++;
    return { ...n, name: `${n.name} (${counts[n.name]})` };
  });
}

export const pdfImportRouter = router({
  /**
   * Parse a PDF file (provided as base64 string) and return extracted notes.
   */
  parsePdf: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().max(30 * 1024 * 1024), // 30MB limit
        fileName: z.string().optional(),
        strategy: z.enum(["auto", "heading", "page"]).default("auto"),
      })
    )
    .mutation(async ({ input }) => {
      // Decode base64 to buffer
      const buffer = Buffer.from(input.fileBase64, "base64");

      // Extract text via pdf-parse
      let pdfData: { text: string; numpages: number };
      try {
        pdfData = await pdfParse(buffer);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse PDF: ${msg}`);
      }

      const warnings: string[] = [];
      const totalPages = pdfData.numpages;

      if (!pdfData.text || !pdfData.text.trim()) {
        return {
          notes: [] as ParsedNote[],
          warnings: [
            "No text could be extracted from this PDF. It may be a scanned image PDF. Try converting it to text first.",
          ],
          strategy: "single" as const,
          totalPages,
        };
      }

      // Split text into per-page chunks using the form-feed character pdf-parse inserts
      const rawPages = pdfData.text
        .split(/\f/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      const pages = rawPages.length > 0 ? rawPages : [pdfData.text.trim()];

      let notes: ParsedNote[];
      let strategy: ParseResult["strategy"];

      if (input.strategy === "heading" || input.strategy === "auto") {
        const headingNotes = splitByHeadings(pages);
        if (headingNotes && headingNotes.length >= 2) {
          notes = headingNotes;
          strategy = "heading";
        } else {
          if (input.strategy === "heading") {
            warnings.push(
              "Not enough headings detected to split by heading. Falling back to page-based split."
            );
          }
          if (pages.length === 1) {
            // Single-page or no form-feed separators — treat as one note
            const fileName = input.fileName?.replace(/\.pdf$/i, "") || "PDF Import";
            notes = [{ name: fileName, content: pages[0] }];
            strategy = "single";
          } else {
            notes = splitByPages(pages);
            strategy = "page";
          }
        }
      } else {
        // Explicit page strategy
        notes = splitByPages(pages);
        strategy = "page";
      }

      if (notes.length === 0) {
        warnings.push("No content could be extracted from this PDF.");
      }

      const deduplicated = deduplicateNames(notes);

      return {
        notes: deduplicated,
        warnings,
        strategy,
        totalPages,
      } satisfies ParseResult;
    }),
});
