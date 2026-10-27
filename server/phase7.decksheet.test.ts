/**
 * Audit 2, Phase 0 (build -254) — shared Slides decks and Sheets. Their
 * positions, sizes, colours, ids and alignment go into markup, so the server
 * cleans shared writes and the client cleans every render. This runs the
 * server module and the SHIPPED client block (app-part2.js, "Deck & sheet
 * sanitizer") on the same inputs: real content passes unchanged, crafted values
 * are neutralised, and both sides agree.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";
import { sanitizeSlides, sanitizeSheetColumns, sanitizeSheetRows, sanitizeTheme, safeColor } from "./_core/deckSheetSanitize";

const src = readFileSync(resolve(__dirname, "../client/public/js/app-part2.js"), "utf8");
const a = src.indexOf("var _LU_DS_COLOR_KEY");
const b = src.indexOf("// ─── Canvas + element rendering", a);
const client: any = {};
vm.runInNewContext(src.slice(a, b) + "\n;this._luSanDeckEl=_luSanDeckEl;this._luSanSheetCol=_luSanSheetCol;this._luSanSheetRow=_luSanSheetRow;this._luSafeColor=_luSafeColor;", client);

const LEGIT_ELEMENTS = [
  { id: 1, type: "text", x: 6, y: 8, w: 88, h: 14, text: "Quarterly review", fontSize: 40, bold: true, align: "center", color: "#0f172a" },
  { id: 2, type: "shape", x: 5, y: 30, w: 20, h: 20, shape: "ellipse", fill: "rgba(59,130,246,.8)", stroke2: "var(--ac)" },
  { id: 3, type: "image", x: 50, y: 30, w: 40, h: 40, src: "https://example.com/a.png", fit: "cover" },
  { id: 4, type: "chart", x: 5, y: 55, w: 45, h: 40, chart: "bar", title: "Revenue", labels: ["Q1", "Q2"], series: [{ name: "2026", data: [10, 12.5], color: "#16a34a" }] },
  { id: 5, type: "metric", x: 55, y: 75, w: 20, h: 20, value: "$1.2M", label: "ARR", size: 52, color: "hsl(220, 80%, 50%)" },
  { id: 6, type: "progress", x: 55, y: 60, w: 40, h: 8, value: 64, label: "Build", color: "darkorange" },
  { id: 7, type: "bullets", x: 5, y: 10, w: 50, h: 40, title: "Next", items: ["Hire", "Ship"], color: "#3b82f6" },
  { id: 8, type: "table", x: 5, y: 10, w: 90, h: 40, header: true, rows: [["A", "B"], ["1", "2"]] },
  { id: 9, type: "kanban", x: 5, y: 10, w: 90, h: 60, cols: [{ title: "To do", color: "#94a3b8", cards: ["One"] }] },
];

const EVIL = '#fff" onmouseover="alert(1)';
const EVIL_ELEMENT = { id: '1" onclick="x()', type: "text", x: '10%;background:url(x)"><img src=x onerror=alert(1)>', y: 5, w: 50, h: 10, color: EVIL, align: 'left;"><script>', fit: "x", text: '<b>hi</b>', series: [{ color: "red;}</style><script>" }], __proto__: { polluted: true } };

describe("deck elements", () => {
  it("real content passes unchanged through the server and the client", () => {
    const out = sanitizeSlides([{ id: 1, bg: "#ffffff", elements: LEGIT_ELEMENTS }]);
    expect(out[0].elements).toEqual(LEGIT_ELEMENTS);
    expect(out[0].bg).toBe("#ffffff");
    for (const el of LEGIT_ELEMENTS) expect(JSON.parse(JSON.stringify(client._luSanDeckEl(el)))).toEqual(el);
  });
  it("crafted values are neutralised, and both sides agree", () => {
    const srv = sanitizeSlides([{ id: 2, elements: [EVIL_ELEMENT] }])[0].elements[0];
    const cli = JSON.parse(JSON.stringify(client._luSanDeckEl(EVIL_ELEMENT)));
    const flat = JSON.stringify(srv);
    expect(typeof srv.id).toBe("number");
    expect(srv.x).toBe(10); // the default for a non-number position
    expect(srv.color).toBeUndefined();
    expect(srv.align).toBeUndefined();
    expect(srv.fit).toBeUndefined();
    expect(srv.series[0].color).toBeUndefined();
    expect(srv.text).toBe("<b>hi</b>"); // text is kept — it is escaped where shown
    expect(flat).not.toMatch(/onmouseover|onclick|onerror|<script/);
    // the client keeps id 0 for an invalid id (render only); otherwise identical
    expect({ ...cli, id: srv.id }).toEqual(srv);
  });
  it("caps sizes and drops prototype keys", () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ id: i + 1, elements: [] }));
    expect(sanitizeSlides(many).length).toBe(300);
    const s = sanitizeSlides([{ id: 1, elements: [{ id: 1, type: "text", x: 1, y: 1, w: 1, h: 1, constructor: { prototype: { bad: 1 } } }] }]);
    expect(Object.keys(s[0].elements[0])).not.toContain("constructor");
    expect(({} as any).polluted).toBeUndefined();
  });
  it("gives duplicate or missing ids fresh numbers", () => {
    const s = sanitizeSlides([{ elements: [{ id: 3, type: "text" }, { id: 3, type: "text" }, { type: "text" }] }]);
    const ids = s[0].elements.map((e: any) => e.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids.every((n: any) => Number.isFinite(n))).toBe(true);
  });
});

describe("sheets", () => {
  const COLS = [
    { id: 1, name: "Task", type: "text", width: 220 },
    { id: 2, name: "Status", type: "select", width: 140, color: "#3b82f6", align: "center", options: [{ label: "Done", color: "#16a34a" }], summary: "count" },
  ];
  const ROWS = [{ id: 1, height: 40, color: "#fef3c7", cells: { "1": "Write plan", "2": "Done" } }];
  it("real columns and rows pass unchanged on both sides", () => {
    expect(sanitizeSheetColumns(COLS)).toEqual(COLS);
    expect(sanitizeSheetRows(ROWS)).toEqual(ROWS);
    for (const c of COLS) expect(JSON.parse(JSON.stringify(client._luSanSheetCol(c)))).toEqual(c);
    expect(JSON.parse(JSON.stringify(client._luSanSheetRow(ROWS[0])))).toEqual(ROWS[0]);
  });
  it("crafted column and row fields are neutralised", () => {
    const col = sanitizeSheetColumns([{ id: "1)\" onmouseover=\"x", name: "x", type: "text\"><svg>", width: "150px;}", color: EVIL, options: [{ label: "a", color: EVIL }] }])[0];
    expect(typeof col.id).toBe("number");
    expect(col.type).toBe("text");
    expect(col.width).toBeUndefined();
    expect(col.color).toBeUndefined();
    expect(col.options[0].color).toBeUndefined();
    const row = sanitizeSheetRows([{ id: 1, height: "40\"><img>", color: EVIL, cells: { "1": "ok", "x\"": "bad", "2": { evil: true } } }])[0];
    expect(row.height).toBeUndefined();
    expect(row.color).toBeUndefined();
    expect(row.cells).toEqual({ "1": "ok" });
    const ccol = client._luSanSheetCol({ id: 2, type: "text", color: EVIL, width: "1;x" });
    expect(ccol.color).toBeUndefined();
    expect(ccol.width).toBeUndefined();
  });
  it("themes keep known settings and lose unsafe colours", () => {
    expect(sanitizeTheme({ density: "compact", striped: true, headerStyle: "accent", bg: "#fff", accent: EVIL })).toEqual({ density: "compact", striped: true, headerStyle: "accent", bg: "#fff" });
  });
});

describe("colours", () => {
  it("accepts the forms the app uses and nothing else", () => {
    for (const ok of ["#fff", "#3b82f6", "#3b82f680", "rgb(1, 2, 3)", "rgba(59,130,246,.8)", "hsl(220, 80%, 50%)", "var(--ac)", "transparent", "darkorange"])
      expect([safeColor(ok), client._luSafeColor(ok)]).toEqual([ok, ok]);
    for (const bad of [EVIL, "red;x:1", "url(javascript:1)", "expression(alert(1))", "#fff\"", "var(--a);x", ""])
      expect([safeColor(bad), client._luSafeColor(bad)]).toEqual([undefined, undefined]);
  });
});
