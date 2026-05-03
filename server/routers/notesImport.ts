/**
 * Notes Document Import Router
 *
 * Accepts a single document file (PDF, DOCX, or TXT) as base64 and extracts
 * its full text content, returning it as ONE complete note.
 *
 * For PDF: uses pdf-parse to extract text.
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

export const notesImportRouter = router({
  /**
   * Import a single document (PDF, DOCX, TXT) and return it as ONE note
   * containing the full document text. No splitting is performed.
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

      // Always return the full document as a single note
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
