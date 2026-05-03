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
 */

import mammoth from "mammoth";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";

const DATE_RE =
  /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i;
const TIME_RE = /^\d{1,2}:\d{2}\s+(AM|PM)$/i;

interface ParsedNote {
  name: string;
  content: string;
}

interface ParseResult {
  notes: ParsedNote[];
  warnings: string[];
  skippedParagraphs: number;
}

function parseDocxParagraphs(paragraphs: string[]): ParseResult {
  const warnings: string[] = [];
  const notes: ParsedNote[] = [];

  // Filter out truly empty paragraphs for detection, but keep track of positions
  // We work on the raw list and skip blanks when looking ahead
  function nextNonEmpty(arr: string[], from: number): [string, number] | null {
    for (let i = from; i < arr.length; i++) {
      if (arr[i].trim()) return [arr[i].trim(), i];
    }
    return null;
  }

  let i = 0;
  let firstTitleIdx = -1;
  let skippedParagraphs = 0;

  // Find all title positions
  const titlePositions: number[] = [];

  while (i < paragraphs.length) {
    const p = paragraphs[i].trim();
    if (!p) { i++; continue; }

    // Look ahead for date then time
    const dateResult = nextNonEmpty(paragraphs, i + 1);
    if (!dateResult) { i++; continue; }
    const [dateStr, dateIdx] = dateResult;

    if (!DATE_RE.test(dateStr)) { i++; continue; }

    const timeResult = nextNonEmpty(paragraphs, dateIdx + 1);
    if (!timeResult) { i++; continue; }
    const [timeStr, timeIdx] = timeResult;

    if (!TIME_RE.test(timeStr)) { i++; continue; }

    // This is a valid title
    titlePositions.push(i);
    if (firstTitleIdx === -1) firstTitleIdx = i;
    i = timeIdx + 1; // advance past the time line
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

  // Count skipped paragraphs before first title
  for (let j = 0; j < firstTitleIdx; j++) {
    if (paragraphs[j].trim()) skippedParagraphs++;
  }
  if (skippedParagraphs > 0) {
    warnings.push(
      `${skippedParagraphs} paragraph${skippedParagraphs !== 1 ? "s" : ""} of content before the first note were skipped.`
    );
  }

  // Extract each note
  const titleCounts: Record<string, number> = {};

  for (let t = 0; t < titlePositions.length; t++) {
    const titleIdx = titlePositions[t];
    const nextTitleIdx =
      t + 1 < titlePositions.length ? titlePositions[t + 1] : paragraphs.length;

    const title = paragraphs[titleIdx].trim();

    // Find date and time lines
    const dateResult = nextNonEmpty(paragraphs, titleIdx + 1)!;
    const [dateStr, dateIdx] = dateResult;
    const timeResult = nextNonEmpty(paragraphs, dateIdx + 1)!;
    const [timeStr, timeIdx] = timeResult;

    // Body: everything from timeIdx+1 to nextTitleIdx
    const bodyLines: string[] = [];
    for (let b = timeIdx + 1; b < nextTitleIdx; b++) {
      bodyLines.push(paragraphs[b]);
    }
    // Trim leading/trailing blank lines from body
    while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
    while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim())
      bodyLines.pop();

    const bodyText = bodyLines.join("\n");
    const content = `${dateStr}\n${timeStr}\n\n${bodyText}`.trim();

    // Handle duplicate titles
    let finalName = title;
    if (titleCounts[title] !== undefined) {
      titleCounts[title]++;
      finalName = `${title} (${titleCounts[title]})`;
    } else {
      titleCounts[title] = 1;
    }

    notes.push({ name: finalName, content });
  }

  return { notes, warnings, skippedParagraphs };
}

export const wordImportRouter = router({
  /**
   * Parse a .docx file (provided as base64 string) and return extracted notes.
   * The client sends the file as base64 to avoid multipart form complexity.
   */
  parseDocx: protectedProcedure
    .input(
      z.object({
        fileBase64: z.string().max(20 * 1024 * 1024), // 20MB limit
        fileName: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      // Decode base64 to buffer
      const buffer = Buffer.from(input.fileBase64, "base64");

      // Extract raw text via mammoth
      let rawText: string;
      try {
        const result = await mammoth.extractRawText({ buffer });
        rawText = result.value;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to parse .docx file: ${msg}`);
      }

      // Split into paragraphs (mammoth uses \n as paragraph separator)
      const paragraphs = rawText.split("\n");

      const { notes, warnings, skippedParagraphs } =
        parseDocxParagraphs(paragraphs);

      return {
        notes,
        warnings,
        skippedParagraphs,
        totalNotes: notes.length,
      };
    }),
});
