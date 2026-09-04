/**
 * Word Document Note Import Router
 *
 * Parses a .docx file (uploaded as base64) that contains multiple notes in the
 * OneNote-export format: Title → Date → Time → Body, repeated.
 *
 * Detection rule (from spec):
 *   A paragraph is a title only when the next non-empty paragraph matches the
 *   date pattern AND the paragraph after that matches the time pattern.
 *
 * Date pattern:  ^(Sunday|Monday|…|Saturday), (January|…|December) \d{1,2}, \d{4}$
 * Time pattern:  ^\d{1,2}:\d{2} (AM|PM)$
 *
 * Formatting, images, and attachments (as of 2026-05-11):
 *   - mammoth.convertToHtml replaces extractRawText so bold/italic/headings/
 *     lists/tables/links survive.
 *   - Embedded images are uploaded to storage via the `convertImage` hook and
 *     re-emitted as <img src="…"> pointing at the permanent URL.
 *   - Non-image embeds (PDFs, .xlsx, .pptx, .docx, OLE objects in
 *     word/embeddings/*) are unzipped from the .docx, uploaded to storage,
 *     and listed as 📎 Attachments at the END of the FIRST note's bodyHtml.
 *   - The HTML is then split at block boundaries; plain text is derived per
 *     block; the title-detection algorithm runs against the plain-text list
 *     and slices the matching HTML blocks for each note's `contentHtml`.
 */

import mammoth from "mammoth";
import JSZip from "jszip";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePut } from "../storage";

const DATE_RE =
  /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i;
const TIME_RE = /^\d{1,2}:\d{2}\s+(AM|PM)$/i;

interface ParsedNote {
  name: string;
  content: string;
  contentHtml: string;
}

interface ParseResult {
  notes: ParsedNote[];
  warnings: string[];
  skippedParagraphs: number;
}

/** Upload a raw image/file buffer to storage and return its public URL. */
async function uploadBlob(
  buf: Buffer,
  mimeType: string,
  docTitle: string,
  category: "img" | "att",
  idx: number,
  ext: string
): Promise<string> {
  const safe = docTitle.replace(/\s+/g, "-").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "doc";
  const key = `note-imports/${Date.now()}-${safe}-${category}${idx}.${ext}`;
  const { url } = await storagePut(key, buf, mimeType);
  return url;
}

/** Best-guess MIME type from a filename extension. */
function mimeFromExt(ext: string): string {
  const lc = ext.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt: "application/vnd.ms-powerpoint",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    csv: "text/csv",
    txt: "text/plain",
    zip: "application/zip",
    bin: "application/octet-stream",
    emf: "image/emf",
    wmf: "image/wmf",
  };
  return map[lc] ?? "application/octet-stream";
}

/** Strip HTML to plain text, preserving paragraph breaks. */
function htmlToPlain(html: string): string {
  return html
    .replace(/<\/p>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(h[1-6]|li|tr|div|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/** Split mammoth's HTML into top-level block elements. */
function splitHtmlIntoBlocks(html: string): string[] {
  const blocks: string[] = [];
  const regex = /<(p|h[1-6]|ul|ol|table|blockquote|figure)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] as string));
}

/**
 * Unzip the .docx and pull anything in `word/embeddings/` (OLE-embedded
 * PDFs / spreadsheets / decks / etc.). Mammoth handles `word/media/`
 * (images) on its own — we don't double-extract those.
 *
 * Returns a list of { name, url, mimeType } for each attachment that
 * was successfully uploaded.
 */
/**
 * Bypass-mode helper: list every embedded filename without uploading or
 * encoding anything. Lets the user import the doc instantly + see what
 * binaries were dropped, with no impact on prefs blob size.
 */
async function listAttachmentNames(
  buffer: Buffer
): Promise<{ uploaded: never[]; tooLarge: never[]; skippedNames: string[] }> {
  const names: string[] = [];
  try {
    const zip = await JSZip.loadAsync(buffer);
    zip.forEach((relPath, file) => {
      if (file.dir) return;
      if (!relPath.startsWith("word/embeddings/")) return;
      names.push(relPath.replace(/^word\/embeddings\//, ""));
    });
  } catch (e) {
    console.warn("[wordImport] could not unzip for skipped-names listing:", e);
  }
  return { uploaded: [], tooLarge: [], skippedNames: names };
}

function renderSkippedAttachmentsBlock(names: string[]): string {
  if (!names.length) return "";
  const rows = names
    .map(n => `<li style="margin:4px 0;opacity:.7">📎 ${escHtml(n)} <span style="font-size:10px;color:#94a3b8">— skipped (re-import with binaries enabled once storage is configured)</span></li>`)
    .join("");
  return `<div style="margin-top:18px;padding:10px 14px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:0 6px 6px 0">
  <div style="font-size:11px;font-weight:700;color:#92400e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">📎 Skipped attachments (bypass mode)</div>
  <ul style="margin:0;padding-left:18px;font-size:12px;color:#78350f">${rows}</ul>
</div>`;
}

async function extractAttachments(
  buffer: Buffer,
  docTitle: string
): Promise<{
  uploaded: Array<{ name: string; url: string; mimeType: string; viaDataUri?: boolean }>;
  tooLarge: Array<{ name: string; sizeKB: number; mimeType: string }>;
}> {
  const uploaded: Array<{ name: string; url: string; mimeType: string; viaDataUri?: boolean }> = [];
  const tooLarge: Array<{ name: string; sizeKB: number; mimeType: string }> = [];
  // PDFs / spreadsheets / docs can comfortably go up to ~10 MB as data URIs
  // (≈ 13 MB base64) without choking the prefs blob. Larger files surface
  // with a "too big to inline" message.
  const DATA_URI_LIMIT = 10 * 1024 * 1024;

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    console.warn("[wordImport] could not unzip .docx for attachment extraction:", e);
    return { uploaded, tooLarge };
  }

  let idx = 0;
  const tasks: Promise<void>[] = [];
  zip.forEach((relPath, file) => {
    if (file.dir) return;
    if (!relPath.startsWith("word/embeddings/")) return;
    const fname = relPath.replace(/^word\/embeddings\//, "");
    const ext = fname.includes(".") ? fname.split(".").pop()!.toLowerCase() : "bin";
    const mime = mimeFromExt(ext);
    tasks.push((async () => {
      let data: Buffer;
      try {
        data = await file.async("nodebuffer");
      } catch {
        return;
      }
      // Try storage upload first — permanent URL is preferred
      try {
        const url = await uploadBlob(data, mime, docTitle, "att", idx++, ext);
        uploaded.push({ name: fname, url, mimeType: mime });
        return;
      } catch (e) {
        console.warn(`[wordImport] storage upload failed for attachment ${fname} (${data.length} bytes) — falling back to data URI:`, e);
      }
      // Storage failed → data-URI fallback if small enough
      if (data.length <= DATA_URI_LIMIT) {
        const dataUri = `data:${mime};base64,${data.toString("base64")}`;
        uploaded.push({ name: fname, url: dataUri, mimeType: mime, viaDataUri: true });
      } else {
        tooLarge.push({ name: fname, sizeKB: Math.round(data.length / 1024), mimeType: mime });
      }
    })());
  });
  await Promise.all(tasks);
  return { uploaded, tooLarge };
}

/**
 * Build the HTML block that lists the attachments. Returned as a single
 * `<div>` so it can be appended to a note's contentHtml.
 */
function renderAttachmentsBlock(
  atts: Array<{ name: string; url: string; mimeType: string; viaDataUri?: boolean }>,
  tooLarge: Array<{ name: string; sizeKB: number; mimeType: string }>
): string {
  if (!atts.length && !tooLarge.length) return "";
  const iconFor = (mime: string) => {
    if (mime.includes("pdf")) return "📄";
    if (mime.includes("spreadsheet") || mime.includes("excel") || mime.includes("csv")) return "📊";
    if (mime.includes("presentation") || mime.includes("powerpoint")) return "📈";
    if (mime.includes("word") || mime.includes("wordprocessing")) return "📝";
    if (mime.includes("zip")) return "🗜";
    return "📎";
  };
  const rows = atts
    .map(a => {
      // For data URIs, add a download attribute so right-click → save works
      // (browsers won't navigate to a multi-MB data URI cleanly otherwise).
      const downloadAttr = a.viaDataUri ? ` download="${escHtml(a.name)}"` : "";
      return `<li style="margin:4px 0">${iconFor(a.mimeType)} <a href="${escHtml(a.url)}"${downloadAttr} target="_blank" rel="noopener" style="color:#3b82f6;text-decoration:underline">${escHtml(a.name)}</a>${a.viaDataUri ? ' <span style="font-size:10px;color:#94a3b8">(inline)</span>' : ""}</li>`;
    })
    .join("");
  const tooLargeRows = tooLarge
    .map(a => `<li style="margin:4px 0;opacity:.65">${iconFor(a.mimeType)} ${escHtml(a.name)} <span style="font-size:10px;color:#dc2626">— ${a.sizeKB} KB, too large to inline (configure server storage to import)</span></li>`)
    .join("");
  return `<div style="margin-top:18px;padding:10px 14px;background:#f8fafc;border-left:3px solid #3b82f6;border-radius:0 6px 6px 0">
  <div style="font-size:11px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">📎 Attachments from this document</div>
  <ul style="margin:0;padding-left:18px;font-size:12px;color:#334155">${rows}${tooLargeRows}</ul>
</div>`;
}

function parseDocxBlocks(paragraphs: string[], blocks: string[]): ParseResult {
  const warnings: string[] = [];
  const notes: ParsedNote[] = [];

  function nextNonEmpty(arr: string[], from: number): [string, number] | null {
    for (let i = from; i < arr.length; i++) {
      if (arr[i].trim()) return [arr[i].trim(), i];
    }
    return null;
  }

  const titlePositions: number[] = [];
  let firstTitleIdx = -1;
  let i = 0;

  while (i < paragraphs.length) {
    const p = paragraphs[i].trim();
    if (!p) { i++; continue; }

    const dateResult = nextNonEmpty(paragraphs, i + 1);
    if (!dateResult) { i++; continue; }
    const [dateStr, dateIdx] = dateResult;
    if (!DATE_RE.test(dateStr)) { i++; continue; }

    const timeResult = nextNonEmpty(paragraphs, dateIdx + 1);
    if (!timeResult) { i++; continue; }
    const [timeStr, timeIdx] = timeResult;
    if (!TIME_RE.test(timeStr)) { i++; continue; }

    titlePositions.push(i);
    if (firstTitleIdx === -1) firstTitleIdx = i;
    i = timeIdx + 1;
  }

  if (titlePositions.length === 0) {
    return {
      notes: [],
      warnings: [
        "No notes detected. Expected each note to begin with a title, followed by a date line and a time line.",
      ],
      skippedParagraphs: 0,
    };
  }

  let skippedParagraphs = 0;
  for (let j = 0; j < firstTitleIdx; j++) {
    if (paragraphs[j].trim()) skippedParagraphs++;
  }
  if (skippedParagraphs > 0) {
    warnings.push(
      `${skippedParagraphs} paragraph${skippedParagraphs !== 1 ? "s" : ""} of content before the first note were skipped.`
    );
  }

  const titleCounts: Record<string, number> = {};

  for (let t = 0; t < titlePositions.length; t++) {
    const titleIdx = titlePositions[t];
    const nextTitleIdx =
      t + 1 < titlePositions.length ? titlePositions[t + 1] : paragraphs.length;

    const title = paragraphs[titleIdx].trim();
    const dateResult = nextNonEmpty(paragraphs, titleIdx + 1)!;
    const [dateStr, dateIdx] = dateResult;
    const timeResult = nextNonEmpty(paragraphs, dateIdx + 1)!;
    const [timeStr, timeIdx] = timeResult;

    const bodyLines: string[] = [];
    for (let b = timeIdx + 1; b < nextTitleIdx; b++) {
      bodyLines.push(paragraphs[b]);
    }
    while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
    while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
    const bodyText = bodyLines.join("\n");
    const content = `${dateStr}\n${timeStr}\n\n${bodyText}`.trim();

    const htmlChunks: string[] = [];
    for (let b = timeIdx + 1; b < nextTitleIdx && b < blocks.length; b++) {
      htmlChunks.push(blocks[b]);
    }
    const contentHtml =
      `<p style="font-size:11px;color:#94a3b8;margin-bottom:4px">${escHtml(dateStr)} · ${escHtml(timeStr)}</p>` +
      htmlChunks.join("");

    let finalName = title;
    if (titleCounts[title] !== undefined) {
      titleCounts[title]++;
      finalName = `${title} (${titleCounts[title]})`;
    } else {
      titleCounts[title] = 1;
    }

    notes.push({ name: finalName, content, contentHtml });
  }

  return { notes, warnings, skippedParagraphs };
}

export const wordImportRouter = router({
  /**
   * Parse a .docx file (provided as base64 string) and return extracted notes
   * with both plain-text and rich-HTML bodies. Embedded images are uploaded
   * to storage and inlined in the HTML. Non-image embeds (PDFs / .xlsx /
   * .pptx / OLE objects) are uploaded and listed as 📎 Attachments at the
   * end of the FIRST note (we can't tell which note an OLE embed belonged
   * to once the doc has been split).
   */
  parseDocx: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().max(100 * 1024 * 1024), // 100MB limit
        fileName: z.string().optional(),
        // When true, skips ALL image + attachment extraction. Use this when
        // storage is unconfigured and you don't want the data-URI fallback
        // to bloat the prefs blob. Images get replaced with a placeholder
        // line; embedded files are listed by filename only (no link).
        skipBinaries: z.boolean().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const docTitle = (input.fileName ?? "doc").replace(/\.[^.]+$/, "");
      const skipBinaries = input.skipBinaries === true;

      // 0. Store the untouched .docx once (build -187) so every note split
      //    from it can show the original with its real formatting. Skipped in
      //    bypass mode (storage is presumed unavailable there).
      let original: { url: string; name: string; mime: string; size: number } | null = null;
      const originalWarnings: string[] = [];
      if (!skipBinaries) {
        try {
          const safe = docTitle.replace(/\s+/g, "-").replace(/[^a-z0-9-]/gi, "").slice(0, 48) || "document";
          const mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
          const { url } = await storagePut(`note-originals/${Date.now()}-${safe}.docx`, buffer, mime);
          original = { url, name: input.fileName ?? `${docTitle}.docx`, mime, size: buffer.length };
        } catch (e) {
          console.warn("[wordImport] original .docx upload failed:", e);
          originalWarnings.push("The original .docx could not be stored — notes keep the converted text only.");
        }
      }

      // 1. Convert the doc to HTML, uploading every embedded image as we go.
      //    If storage upload fails (e.g. Forge config missing on this env),
      //    fall back to a data: URI so the image still renders in the note
      //    rather than being stripped. We cap data-URI fallback at 4 MB per
      //    image to keep the JSON blob size sane.
      let html: string;
      let imgIdx = 0;
      let imgUploadFailures = 0;
      const DATA_URI_LIMIT = 4 * 1024 * 1024;
      let imgSkipped = 0;
      try {
        const result = await mammoth.convertToHtml(
          { buffer },
          {
            convertImage: mammoth.images.imgElement(async (image) => {
              const contentType = image.contentType ?? "image/png";
              const ext = (contentType.split("/")[1] ?? "png").replace("jpeg", "jpg");
              // Bypass mode: drop image, leave a labeled placeholder so the
              // user can see WHERE images were without bloating the blob.
              if (skipBinaries) {
                imgSkipped++;
                return { src: "", alt: `[Image ${imgSkipped} skipped]` };
              }
              let imgBuffer: Buffer | null = null;
              try {
                imgBuffer = Buffer.from(await image.read());
              } catch {
                return { src: "" };
              }
              try {
                const url = await uploadBlob(imgBuffer, contentType, docTitle, "img", imgIdx++, ext);
                return { src: url };
              } catch (e) {
                imgUploadFailures++;
                console.warn(`[wordImport] storage upload failed for image ${imgIdx} — falling back to data URI:`, e);
                if (imgBuffer.length <= DATA_URI_LIMIT) {
                  return { src: `data:${contentType};base64,${imgBuffer.toString("base64")}` };
                }
                return { src: "", alt: `[Image ${imgIdx} — too large to inline (${Math.round(imgBuffer.length / 1024)} KB)]` };
              }
            }),
          }
        );
        html = result.value.replace(/<img /gi, '<img style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;display:block" ');
        // In bypass mode the placeholder text becomes visible-only if the img
        // src is empty; render it as styled text instead of a broken-image icon.
        if (skipBinaries) {
          html = html.replace(/<img[^>]*src=""[^>]*alt="([^"]*)"[^>]*>/gi, '<span style="display:inline-block;padding:2px 8px;background:#eef2ff;color:#6366f1;border:1px dashed #c7d2fe;border-radius:4px;font-size:11px;font-style:italic">$1</span>');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse .docx file: ${msg}`);
      }
      if (imgUploadFailures > 0) {
        console.warn(`[wordImport] ${imgUploadFailures} image(s) used data-URI fallback because storage upload failed.`);
      }

      // 2. Extract non-image embeds (PDFs / .xlsx / .pptx / OLE bins).
      //    Skip entirely in bypass mode — we just list the filenames so the
      //    user knows what's there but no data is captured.
      const { uploaded: attachments, tooLarge: attTooLarge, skippedNames } = skipBinaries
        ? await listAttachmentNames(buffer)
        : await extractAttachments(buffer, docTitle).then(r => ({ ...r, skippedNames: [] as string[] }));
      const attachmentsBlock = skipBinaries
        ? renderSkippedAttachmentsBlock(skippedNames)
        : renderAttachmentsBlock(attachments, attTooLarge);
      const inlinedAttachments = attachments.filter(a => a.viaDataUri).length;
      const storedAttachments = attachments.length - inlinedAttachments;

      // 3. Split the HTML into block-level chunks + derive plain text per block.
      const blocks = splitHtmlIntoBlocks(html);
      const paragraphs = blocks.map(htmlToPlain);

      // 4. Run the existing title-detection algorithm.
      const { notes, warnings, skippedParagraphs } = parseDocxBlocks(paragraphs, blocks);

      // 5. Append the attachments block to the FIRST note's contentHtml so
      //    the user can see + click them from the imported note.
      if (notes.length && attachmentsBlock) {
        notes[0].contentHtml += attachmentsBlock;
        // Also reflect the attachment names in the plain-text fallback.
        const attTextLines = attachments.map(a => `📎 ${a.name} — ${a.url}`).join("\n");
        notes[0].content += `\n\n--- Attachments ---\n${attTextLines}`;
      }

      if (skipBinaries) {
        if (imgSkipped > 0) {
          warnings.push(`Bypass mode: ${imgSkipped} image${imgSkipped !== 1 ? "s" : ""} skipped (placeholders inserted).`);
        }
        if (skippedNames.length > 0) {
          warnings.push(`Bypass mode: ${skippedNames.length} attachment${skippedNames.length !== 1 ? "s" : ""} skipped — listed in the first note.`);
        }
      }
      if (storedAttachments > 0) {
        warnings.push(
          `${storedAttachments} attachment${storedAttachments !== 1 ? "s" : ""} uploaded to storage and linked in the first note.`
        );
      }
      if (inlinedAttachments > 0) {
        warnings.push(
          `${inlinedAttachments} attachment${inlinedAttachments !== 1 ? "s" : ""} inlined as data URIs (server storage unavailable — click them in the note to download).`
        );
      }
      if (attTooLarge.length > 0) {
        warnings.push(
          `${attTooLarge.length} attachment${attTooLarge.length !== 1 ? "s" : ""} too large to inline (>10 MB each): ${attTooLarge.map(a => `${a.name} (${a.sizeKB} KB)`).join(", ")}. Configure server storage to import these.`
        );
      }
      if (imgUploadFailures > 0) {
        warnings.push(
          `${imgUploadFailures} image${imgUploadFailures !== 1 ? "s" : ""} inlined as data URIs because the storage backend rejected the upload.`
        );
      }

      warnings.push(...originalWarnings);
      return {
        notes,
        warnings,
        skippedParagraphs,
        totalNotes: notes.length,
        attachmentsCount: attachments.length,
        original,
      };
    }),
});
