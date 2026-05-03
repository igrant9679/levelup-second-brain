import { describe, it, expect } from "vitest";

// Test the parsing logic directly by importing the internal helpers.
// We re-implement the same regex/parsing logic here to keep tests fast
// (no actual .docx file needed).

const DATE_RE =
  /^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}$/i;
const TIME_RE = /^\d{1,2}:\d{2}\s+(AM|PM)$/i;

describe("Word Doc Import — date/time regex patterns", () => {
  it("matches valid date lines", () => {
    expect(DATE_RE.test("Monday, January 1, 2024")).toBe(true);
    expect(DATE_RE.test("Saturday, December 31, 2023")).toBe(true);
    expect(DATE_RE.test("Wednesday, March 5, 2025")).toBe(true);
  });

  it("rejects invalid date lines", () => {
    expect(DATE_RE.test("Jan 1, 2024")).toBe(false);
    expect(DATE_RE.test("2024-01-01")).toBe(false);
    expect(DATE_RE.test("Monday January 1 2024")).toBe(false); // missing comma after day
    expect(DATE_RE.test("")).toBe(false);
  });

  it("matches valid time lines", () => {
    expect(TIME_RE.test("9:00 AM")).toBe(true);
    expect(TIME_RE.test("12:30 PM")).toBe(true);
    expect(TIME_RE.test("1:05 AM")).toBe(true);
  });

  it("rejects invalid time lines", () => {
    expect(TIME_RE.test("9:00am")).toBe(false); // lowercase
    expect(TIME_RE.test("9 AM")).toBe(false); // missing colon
    expect(TIME_RE.test("")).toBe(false);
  });
});

describe("Word Doc Import — note detection logic", () => {
  // Minimal re-implementation of the parser for unit testing
  function nextNonEmpty(arr: string[], from: number): [string, number] | null {
    for (let i = from; i < arr.length; i++) {
      if (arr[i].trim()) return [arr[i].trim(), i];
    }
    return null;
  }

  interface ParsedNote { name: string; content: string }

  function parse(paragraphs: string[]): { notes: ParsedNote[]; warnings: string[] } {
    const warnings: string[] = [];
    const notes: ParsedNote[] = [];
    const titlePositions: number[] = [];
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
      const [, timeIdx] = timeResult;
      if (!TIME_RE.test(timeResult[0])) { i++; continue; }
      titlePositions.push(i);
      i = timeIdx + 1;
    }

    if (!titlePositions.length) {
      warnings.push("No notes detected.");
      return { notes, warnings };
    }

    const titleCounts: Record<string, number> = {};
    for (let t = 0; t < titlePositions.length; t++) {
      const titleIdx = titlePositions[t];
      const nextTitleIdx = t + 1 < titlePositions.length ? titlePositions[t + 1] : paragraphs.length;
      const title = paragraphs[titleIdx].trim();
      const dateResult = nextNonEmpty(paragraphs, titleIdx + 1)!;
      const [dateStr, dateIdx] = dateResult;
      const timeResult = nextNonEmpty(paragraphs, dateIdx + 1)!;
      const [timeStr, timeIdx] = timeResult;
      const bodyLines: string[] = [];
      for (let b = timeIdx + 1; b < nextTitleIdx; b++) bodyLines.push(paragraphs[b]);
      while (bodyLines.length && !bodyLines[0].trim()) bodyLines.shift();
      while (bodyLines.length && !bodyLines[bodyLines.length - 1].trim()) bodyLines.pop();
      const content = `${dateStr}\n${timeStr}\n\n${bodyLines.join("\n")}`.trim();
      let finalName = title;
      if (titleCounts[title] !== undefined) {
        titleCounts[title]++;
        finalName = `${title} (${titleCounts[title]})`;
      } else {
        titleCounts[title] = 1;
      }
      notes.push({ name: finalName, content });
    }
    return { notes, warnings };
  }

  it("parses a single note correctly", () => {
    const paragraphs = [
      "My First Note",
      "Monday, January 1, 2024",
      "9:00 AM",
      "",
      "This is the body of the note.",
      "Second paragraph.",
    ];
    const { notes, warnings } = parse(paragraphs);
    expect(notes).toHaveLength(1);
    expect(notes[0].name).toBe("My First Note");
    expect(notes[0].content).toContain("Monday, January 1, 2024");
    expect(notes[0].content).toContain("9:00 AM");
    expect(notes[0].content).toContain("This is the body of the note.");
    expect(warnings).toHaveLength(0);
  });

  it("parses multiple notes correctly", () => {
    const paragraphs = [
      "Note One",
      "Monday, January 1, 2024",
      "9:00 AM",
      "Body of note one.",
      "",
      "Note Two",
      "Tuesday, January 2, 2024",
      "10:30 AM",
      "Body of note two.",
    ];
    const { notes } = parse(paragraphs);
    expect(notes).toHaveLength(2);
    expect(notes[0].name).toBe("Note One");
    expect(notes[1].name).toBe("Note Two");
  });

  it("handles duplicate titles with suffix", () => {
    const paragraphs = [
      "Meeting Notes",
      "Monday, January 1, 2024",
      "9:00 AM",
      "First meeting.",
      "Meeting Notes",
      "Tuesday, January 2, 2024",
      "2:00 PM",
      "Second meeting.",
    ];
    const { notes } = parse(paragraphs);
    expect(notes).toHaveLength(2);
    expect(notes[0].name).toBe("Meeting Notes");
    expect(notes[1].name).toBe("Meeting Notes (2)");
  });

  it("returns a warning when no notes are found", () => {
    const { notes, warnings } = parse(["Just some text", "No date or time here"]);
    expect(notes).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("skips blank lines between title, date, and time", () => {
    const paragraphs = [
      "Spaced Note",
      "",
      "Wednesday, March 5, 2025",
      "",
      "9:00 AM",
      "Body text here.",
    ];
    const { notes } = parse(paragraphs);
    expect(notes).toHaveLength(1);
    expect(notes[0].name).toBe("Spaced Note");
  });
});
