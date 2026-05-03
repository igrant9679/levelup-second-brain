/**
 * Notes Document Import Router
 *
 * Accepts a single document file (PDF, DOCX, or TXT) as base64 and extracts
 * its text content, returning it as a single note ready to be saved.
 *
 * For PDF: uses pdf-parse to extract text, then tries heading-based splitting.
 * For DOCX: uses mammoth to extract plain text.
 * For TXT/RTF: decodes the buffer directly as UTF-8.
 */
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import mammoth from "mammoth";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

interface ImportedNote {
  title: string;
  body: string;
  source: string;
  tags: string[];
}

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 80) return false;
  if (t === t.toUpperCase() && /[A-Z]{3,}/.test(t)) return true;
  const words = t.split(/\s+/);
  if (words.length >= 2 && words.length <= 10 && words.every((w) => /^[A-Z0-9"'(]/.test(w))) return true;
  if (/^(\d+\.[\d.]*\s+\S|Chapter\s+\d|Section\s+\d)/i.test(t)) return true;
  return false;
}

function splitByHeadings(text: string, fileTitle: string): ImportedNote[] | null {
  const lines = text.split("\n");
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current: { heading: string; lines: string[] } | null = null;
  let headingCount = 0;

  for (const line of lines) {
    if (isHeading(line)) {
      headingCount++;
      if (current) sections.push(current);
      current = { heading: line.trim(), lines: [] };
    } else {
      if (current) current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  if (headingCount < 2) return null;

  return sections
    .filter((s) => s.lines.some((l) => l.trim()))
    .map((s) => ({
      title: s.heading,
      body: s.lines.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
      source: "Document Import",
      tags: [fileTitle.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")],
    }));
}

export const notesImportRouter = router({
  /**
   * Import a single document (PDF, DOCX, TXT) and return extracted note(s).
   * The caller decides how many notes to create from the returned array.
   */
  importDocument: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().max(20 * 1024 * 1024), // 20 MB limit
        fileName: z.string(),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileTitle = input.fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
      const mime = input.mimeType.toLowerCase();
      const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";

      let rawText = "";
      let source = "Document Import";

      // ── PDF ──────────────────────────────────────────────────────────────
      if (mime.includes("pdf") || ext === "pdf") {
        source = "PDF Import";
        let pdfData: { text: string; numpages: number };
        try {
          pdfData = await pdfParse(buffer);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to parse PDF: ${msg}`);
        }
        if (!pdfData.text?.trim()) {
          return {
            notes: [] as ImportedNote[],
            warnings: ["No text could be extracted. This PDF may be a scanned image. Try an OCR tool first."],
          };
        }
        rawText = pdfData.text;
      }

      // ── DOCX ─────────────────────────────────────────────────────────────
      else if (
        mime.includes("wordprocessingml") ||
        mime.includes("msword") ||
        ext === "docx" ||
        ext === "doc"
      ) {
        source = "Word Import";
        let result: { value: string };
        try {
          result = await mammoth.extractRawText({ buffer });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to parse Word document: ${msg}`);
        }
        rawText = result.value;
      }

      // ── TXT / RTF / plain text ────────────────────────────────────────────
      else {
        source = "Text Import";
        rawText = buffer.toString("utf-8");
      }

      if (!rawText.trim()) {
        return {
          notes: [] as ImportedNote[],
          warnings: ["The document appears to be empty."],
        };
      }

      // Try heading-based splitting first
      const headingNotes = splitByHeadings(rawText, fileTitle);
      if (headingNotes && headingNotes.length >= 2) {
        // Update source on all notes
        return {
          notes: headingNotes.map((n) => ({ ...n, source })),
          warnings: [] as string[],
        };
      }

      // Fall back to single note
      const cleanText = rawText.replace(/\n{3,}/g, "\n\n").trim();
      return {
        notes: [
          {
            title: fileTitle || "Imported Document",
            body: cleanText,
            source,
            tags: [source.toLowerCase().replace(/\s+/g, "-")],
          },
        ] as ImportedNote[],
        warnings: [] as string[],
      };
    }),
});
