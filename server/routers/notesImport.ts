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

interface ImportedNote {
  title: string;
  body: string;
  source: string;
  tags: string[];
}

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
): Promise<{ plainText: string; imageMarkdown: string }> {
  const uploadedImages: string[] = [];
  let imgIdx = 0;

  // Use mammoth.convertToHtml with a custom image handler that uploads each image
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        try {
          const imgBuffer = await image.read();
          const contentType = image.contentType ?? "image/png";
          const url = await uploadImage(Buffer.from(imgBuffer), contentType, noteTitle, imgIdx++);
          uploadedImages.push(url);
          return { src: url };
        } catch {
          return { src: "" };
        }
      }),
    }
  );

  // Strip HTML tags to get plain text (preserve paragraph breaks)
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

  // Build markdown image lines for any extracted images
  const imageMarkdown = uploadedImages.length
    ? "\n\n---\n\n" +
      uploadedImages.map((url, i) => `![Image ${i + 1}](${url})`).join("\n\n")
    : "";

  return { plainText, imageMarkdown };
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
      let source = "Document Import";
      const warnings: string[] = [];

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
        try {
          const { plainText, imageMarkdown } = await extractDocxContent(buffer, fileTitle);
          body = plainText + imageMarkdown;
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
            source,
            tags: [source.toLowerCase().replace(/\s+/g, "-")],
          },
        ] as ImportedNote[],
        warnings,
      };
    }),
});
