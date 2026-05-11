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
 * Formatting & images: as of 2026-05-11, we run mammoth.convertToHtml (instead
 * of extractRawText) so the original .docx formatting survives. Embedded images
 * are uploaded to storage via the same `convertImage` hook used by
 * notesImport.ts and rewritten to permanent URLs. The HTML is then split at
 * block boundaries, plain-text-stripped, and the existing title-detection
 * algorithm runs against the plain-text paragraph list. Each output note gets
 * both `content` (plain) and `contentHtml` (rich) so the client can save it
 * to `n.bodyHtml`.
 */

import mammoth from "mammoth";
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

/** Upload a raw image buffer to storage and return its public URL. */
async function uploadImage(
  imgBuffer: Buffer,
  mimeType: string,
  docTitle: string,
  idx: number
): Promise<string> {
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  const safe = docTitle.replace(/\s+/g, "-").replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "doc";
  const key = `note-imports/${Date.now()}-${safe}-img${idx}.${ext}`;
  const { url } = await storagePut(key, imgBuffer, mimeType);
  return url;
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

/**
 * Split mammoth's HTML output into top-level block chunks. Mammoth always
 * emits each .docx paragraph as one block-level element (<p>, <h1-6>, <ul>,
 * <ol>, <table>, <blockquote>, or <figure> for standalone images), so a
 * non-greedy match on those is reliable.
 */
function splitHtmlIntoBlocks(html: string): string[] {
  const blocks: string[] = [];
  const regex = /<(p|h[1-6]|ul|ol|table|blockquote|figure)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(html)) !== null) {
    blocks.push(m[0]);
  }
  return blocks;
}

/**
 * Walk the (plain-text, block-html) pair list, find title positions using
 * the same algorithm as before, and slice both arrays to produce per-note
 * { name, content, contentHtml } records.
 */
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

    // Plain-text body
    const bodyLines: string[] = [];
    for (let b = timeIdx + 1; b < nextTitleIdx; b++) {
      bodyLines.push(paragraphs[b]);
    }
    while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
    while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
    const bodyText = bodyLines.join("\n");
    const content = `${dateStr}\n${timeStr}\n\n${bodyText}`.trim();

    // Rich-HTML body — concat the HTML blocks from timeIdx+1 to nextTitleIdx.
    // Block array length should match paragraphs length 1:1 (one mammoth block
    // per docx paragraph) but we clamp defensively in case of mismatches.
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

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c] as string));
}

export const wordImportRouter = router({
  /**
   * Parse a .docx file (provided as base64 string) and return extracted notes
   * with both plain-text and rich-HTML bodies.
   */
  parseDocx: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().max(100 * 1024 * 1024), // 100MB limit
        fileName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const buffer = Buffer.from(input.fileBase64, "base64");
      const docTitle = (input.fileName ?? "doc").replace(/\.[^.]+$/, "");

      // Convert to HTML once, with images uploaded to storage on the fly.
      let html: string;
      let imgIdx = 0;
      try {
        const result = await mammoth.convertToHtml(
          { buffer },
          {
            convertImage: mammoth.images.imgElement(async (image) => {
              try {
                const imgBuffer = await image.read();
                const contentType = image.contentType ?? "image/png";
                const url = await uploadImage(Buffer.from(imgBuffer), contentType, docTitle, imgIdx++);
                return { src: url };
              } catch {
                return { src: "" };
              }
            }),
          }
        );
        // Add inline style so images fit the note width when re-rendered later.
        html = result.value.replace(/<img /gi, '<img style="max-width:100%;height:auto;border-radius:6px;margin:8px 0;display:block" ');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse .docx file: ${msg}`);
      }

      const blocks = splitHtmlIntoBlocks(html);
      const paragraphs = blocks.map(htmlToPlain);

      const { notes, warnings, skippedParagraphs } = parseDocxBlocks(paragraphs, blocks);

      return {
        notes,
        warnings,
        skippedParagraphs,
        totalNotes: notes.length,
      };
    }),
});
