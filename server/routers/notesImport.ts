/**
 * Notes Document Import Router
 *
 * Accepts a single document file (PDF, DOCX, or TXT) as base64 and extracts
 * its full text content AND embedded images, returning it as ONE complete note.
 *
 * For DOCX: uses mammoth.convertToHtml with an inline image handler to extract
 *   embedded images as data URIs, then uploads each to storage and replaces the
 *   data URI with a permanent storage URL.
 * For PDF: uses pdf-parse for text + pdfimages CLI (poppler-utils) to extract
 *   embedded raster images, uploads them to storage, and appends them to the note.
 * For TXT/RTF: decodes the buffer directly as UTF-8 (no images).
 */
import { execFile } from "child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "fs/promises";
import { createRequire } from "module";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
const execFileAsync = promisify(execFile);

const _require = createRequire(import.meta.url);
const pdfParse = _require("pdf-parse") as (buffer: Buffer) => Promise<{ text: string; numpages: number }>;
import mammoth from "mammoth";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

interface OriginalFile {
  url: string;
  name: string;
  mime: string;
  size: number;
}

interface ImportedNote {
  title: string;
  body: string;
  bodyHtml?: string;
  source: string;
  tags: string[];
  /** The untouched source file (PDF / DOCX) — shown with its real formatting by the note editor. */
  original?: OriginalFile | null;
}

/** Store the untouched source document so the note can show it exactly as
 *  imported (build -187). Returns null when the storage backend refuses —
 *  the import still succeeds with the extracted text. */
async function uploadOriginal(buffer: Buffer, fileName: string, mimeType: string): Promise<OriginalFile | null> {
  try {
    const ext = (fileName.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const base = fileName.replace(/\.[^.]+$/, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/gi, "").slice(0, 48) || "document";
    const key = `note-originals/${Date.now()}-${base}.${ext}`;
    const { url } = await storagePut(key, buffer, mimeType);
    return { url, name: fileName, mime: mimeType, size: buffer.length };
  } catch (e) {
    console.warn("[notesImport] original file upload failed:", e);
    return null;
  }
}

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
};

/** Upload a raw image buffer to storage and return its public URL */
async function uploadImage(
  imgBuffer: Buffer,
  mimeType: string,
  noteTitle: string,
  idx: number
): Promise<string> {
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const key = `note-imports/${Date.now()}-${noteTitle.replace(/\s+/g, "-").replace(/[^a-z0-9-]/gi, "").slice(0, 40)}-img${idx}.${ext}`;
  const { url } = await storagePut(key, imgBuffer, mimeType);
  return url;
}

/** Extract images from a DOCX buffer using mammoth's HTML converter.
 *  Returns { html, imageMarkdown } where imageMarkdown is a string of
 *  ![img N](url) lines to append to the plain-text body.
 */
async function extractDocxContent(
  buffer: Buffer,
  noteTitle: string
): Promise<{ plainText: string; imageMarkdown: string; html: string }> {
  const uploadedImages: string[] = [];
  let imgIdx = 0;

  // Use mammoth.convertToHtml with a custom image handler that uploads each
  // image. If storage upload fails (e.g. Forge env config missing), fall back
  // to a data: URI so the image survives instead of being silently dropped.
  const DATA_URI_LIMIT = 4 * 1024 * 1024;
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const contentType = image.contentType ?? "image/png";
        let imgBuffer: Buffer | null = null;
        try {
          imgBuffer = Buffer.from(await image.read());
        } catch {
          return { src: "" };
        }
        try {
          const url = await uploadImage(imgBuffer, contentType, noteTitle, imgIdx++);
          uploadedImages.push(url);
          return { src: url };
        } catch (e) {
          console.warn(`[notesImport] storage upload failed for image — using data URI fallback:`, e);
          if (imgBuffer.length <= DATA_URI_LIMIT) {
            return { src: `data:${contentType};base64,${imgBuffer.toString("base64")}` };
          }
          return { src: "", alt: `[Image too large to inline (${Math.round(imgBuffer.length / 1024)} KB)]` };
        }
      }),
    }
  );

  // Rich HTML — preserves bold/italic/headings/lists/tables/links/images.
  // Add a small inline style to images so they fit the note width.
  const html = result.value.replace(/<img /gi, '<img style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;display:block" ');

  // Strip HTML tags to get plain text fallback (preserve paragraph breaks)
  const plainText = result.value
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Build markdown image lines for any extracted images (plain-text fallback)
  const imageMarkdown = uploadedImages.length
    ? "\n\n---\n\n" +
      uploadedImages.map((url, i) => `![Image ${i + 1}](${url})`).join("\n\n")
    : "";

  return { plainText, imageMarkdown, html };
}

/** Extract embedded images from a PDF using pdfimages (poppler-utils).
 *  Returns markdown image lines to append to the note body.
 */
async function extractPdfImages(
  pdfBuffer: Buffer,
  noteTitle: string
): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), "note-pdf-"));
  const pdfPath = join(tmpDir, "input.pdf");
  const imgPrefix = join(tmpDir, "img");

  try {
    await writeFile(pdfPath, pdfBuffer);

    // Extract all embedded raster images as PNG
    try {
      await execFileAsync("pdfimages", ["-png", "-q", pdfPath, imgPrefix], {
        timeout: 30_000,
      });
    } catch {
      // pdfimages exits non-zero if no images found — that's fine
    }

    const files = (await readdir(tmpDir))
      .filter((f) => f.startsWith("img") && f.endsWith(".png"))
      .sort();

    if (!files.length) return "";

    const uploadedUrls: string[] = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const imgBuf = await readFile(join(tmpDir, files[i]));
        const url = await uploadImage(imgBuf, "image/png", noteTitle, i);
        uploadedUrls.push(url);
      } catch {
        // Skip images that fail to upload
      }
    }

    return uploadedUrls.length
      ? "\n\n---\n\n" + uploadedUrls.map((url, i) => `![Image ${i + 1}](${url})`).join("\n\n")
      : "";
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

export const notesImportRouter = router({
  /**
   * Import a single document (PDF, DOCX, TXT) as ONE complete note.
   * Embedded images are extracted, uploaded to storage, and appended
   * as markdown image references at the end of the note body.
   */
  importDocument: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().max(100 * 1024 * 1024), // 100 MB limit
        fileName: z.string(),
        mimeType: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileTitle = input.fileName.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ").trim();
      const mime = input.mimeType.toLowerCase();
      const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";

      let body = "";
      let bodyHtml: string | undefined;
      let source = "Document Import";
      const warnings: string[] = [];
      let original: OriginalFile | null = null;

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
        const cleanText = pdfData.text.replace(/\n{3,}/g, "\n\n").trim();
        original = await uploadOriginal(buffer, input.fileName, "application/pdf");
        if (!original) warnings.push("The original PDF could not be stored — the note keeps the extracted text only.");

        // Extract embedded images
        let imageMarkdown = "";
        try {
          imageMarkdown = await extractPdfImages(buffer, fileTitle);
        } catch {
          warnings.push("Some images could not be extracted from the PDF.");
        }

        body = cleanText + imageMarkdown;
      }

      // ── DOCX ─────────────────────────────────────────────────────────────
      else if (
        mime.includes("wordprocessingml") ||
        mime.includes("msword") ||
        ext === "docx" ||
        ext === "doc"
      ) {
        source = "Word Import";
        original = await uploadOriginal(buffer, input.fileName, MIME_BY_EXT[ext] || mime || "application/octet-stream");
        if (!original) warnings.push("The original Word file could not be stored — the note keeps the converted text only.");
        try {
          const { plainText, imageMarkdown, html } = await extractDocxContent(buffer, fileTitle);
          body = plainText + imageMarkdown;
          bodyHtml = html;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Failed to parse Word document: ${msg}`);
        }
      }

      // ── TXT / RTF / plain text ────────────────────────────────────────────
      else {
        source = "Text Import";
        body = buffer.toString("utf-8").replace(/\n{3,}/g, "\n\n").trim();
      }

      if (!body.trim()) {
        return {
          notes: [] as ImportedNote[],
          warnings: ["The document appears to be empty."],
        };
      }

      return {
        notes: [
          {
            title: fileTitle || "Imported Document",
            body,
            bodyHtml,
            source,
            tags: [source.toLowerCase().replace(/\s+/g, "-")],
            original,
          },
        ] as ImportedNote[],
        warnings,
      };
    }),

  /**
   * Store an untouched source file (used by client-side importers such as
   * the OneNote PDF export path) and return its storage record.
   */
  storeOriginal: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().max(100 * 1024 * 1024),
        fileName: z.string().min(1),
        mimeType: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
      const mime = input.mimeType || MIME_BY_EXT[ext] || "application/octet-stream";
      const original = await uploadOriginal(buffer, input.fileName, mime);
      return { original };
    }),
});
