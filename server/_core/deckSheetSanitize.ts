/**
 * Shared Slides decks and Sheets are free-form JSON, and the client writes some
 * of their fields straight into markup (positions, sizes, colours, ids,
 * alignment). A co-editor's crafted value could break out of that markup and
 * run in the owner's browser (audit 2, 2026-10-27). Every shared write goes
 * through these, so stored decks/sheets only ever hold:
 *   - ids: finite numbers (missing/invalid ones get a fresh number);
 *   - geometry (x, y, w, h, width, height, fontSize, size, stroke, radius, …):
 *     finite numbers, clamped;
 *   - colours (any key that names a colour/fill/stroke/background/accent):
 *     hex, rgb()/hsl(), var(--token) or a plain colour word — else dropped;
 *   - alignment / fit / shape / chart kind / column type: values from fixed
 *     lists — else dropped;
 *   - text: strings (escaped when rendered), capped in length.
 * The client mirror is `_luSanitizeDeck` / `_luSanitizeSheet` in app-part2.js
 * (block "Deck & sheet sanitizer (build -254)") — change both together;
 * server/phase7.decksheet.test.ts runs both on the same input.
 */

const COLOR_KEY = /(colou?rs?|fill|stroke2|bg|background|accent)$/i;
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|(rgb|hsl)a?\(\s*[-\d.%\s,/]+\)|var\(--[\w-]{1,40}\)|[a-z]{3,20})$/i;
const NUM_KEYS: Record<string, [number, number]> = {
  x: [-100, 200], y: [-100, 200], w: [0, 300], h: [0, 300], width: [20, 2000], height: [10, 2000],
  fontSize: [4, 400], size: [4, 400], stroke: [0, 100], radius: [0, 500], value: [-1e12, 1e12],
};
const ENUMS: Record<string, string[]> = {
  align: ["left", "center", "right", "justify"],
  fit: ["contain", "cover", "fill", "none", "scale-down"],
  shape: ["rect", "ellipse", "line"],
};
const STR_MAX = 20000;
const LIMITS = { slides: 300, elements: 300, columns: 200, rows: 5000, items: 500, depth: 8 };

export function safeColor(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length <= 64 && SAFE_COLOR.test(s) ? s : undefined;
}

function num(v: unknown, lo: number, hi: number): number | undefined {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return undefined;
  return Math.min(hi, Math.max(lo, n));
}

/** Walk any value; colour/number/enum keys are checked, strings capped, depth limited. */
function clean(v: any, key: string, depth: number): any {
  if (depth > LIMITS.depth) return undefined;
  if (Array.isArray(v)) {
    const out: any[] = [];
    for (const x of v.slice(0, LIMITS.items)) { const c = clean(x, key, depth + 1); if (c !== undefined) out.push(c); }
    return out;
  }
  if (v && typeof v === "object") {
    const out: any = {};
    for (const k of Object.keys(v).slice(0, 200)) {
      if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
      const c = clean(v[k], k, depth + 1);
      if (c !== undefined) out[k] = c;
    }
    return out;
  }
  if (COLOR_KEY.test(key) && typeof v === "string") return safeColor(v);
  if (NUM_KEYS[key]) { if (key === "value" && typeof v === "string") return v.slice(0, 200); const [lo, hi] = NUM_KEYS[key]; return num(v, lo, hi); }
  if (ENUMS[key]) return typeof v === "string" && ENUMS[key].includes(v) ? v : undefined;
  if (key === "data" || key === "id") { const n = num(v, -1e15, 1e15); return n; }
  if (typeof v === "string") return v.slice(0, STR_MAX);
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "boolean" || v === null) return v;
  return undefined;
}

/** Give every object in `list` a numeric id, keeping valid unique ones. */
function fixIds(list: any[]): void {
  const seen = new Set<number>();
  let next = list.reduce((m, x) => (x && Number.isFinite(x.id) ? Math.max(m, x.id) : m), 0) + 1;
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    if (!Number.isFinite(x.id) || seen.has(x.id)) x.id = next++;
    seen.add(x.id);
  }
}

export function sanitizeSlides(slides: unknown): any[] {
  if (!Array.isArray(slides)) return [];
  const out = (clean(slides.slice(0, LIMITS.slides), "slides", 0) as any[]).filter((s) => s && typeof s === "object");
  fixIds(out);
  for (const s of out) {
    s.elements = Array.isArray(s.elements) ? s.elements.filter((e: any) => e && typeof e === "object").slice(0, LIMITS.elements) : [];
    fixIds(s.elements);
    for (const e of s.elements) {
      for (const k of ["x", "y", "w", "h"]) if (e[k] === undefined) e[k] = k === "x" || k === "y" ? 10 : 20;
      if (typeof e.type !== "string" || !/^[a-z]{2,20}$/.test(e.type)) e.type = "text";
    }
  }
  return out;
}

export function sanitizeSheetColumns(cols: unknown): any[] {
  if (!Array.isArray(cols)) return [];
  const out = (clean(cols.slice(0, LIMITS.columns), "columns", 0) as any[]).filter((c) => c && typeof c === "object");
  fixIds(out);
  for (const c of out) if (typeof c.type !== "string" || !/^[a-z]{2,20}$/.test(c.type)) c.type = "text";
  return out;
}

export function sanitizeSheetRows(rows: unknown): any[] {
  if (!Array.isArray(rows)) return [];
  const out: any[] = [];
  for (const r of rows.slice(0, LIMITS.rows)) {
    if (!r || typeof r !== "object") continue;
    // cells are {columnId: value}: keys must be numeric ids, values plain text/number/boolean
    const cells: any = {};
    const src = (r as any).cells && typeof (r as any).cells === "object" ? (r as any).cells : {};
    for (const k of Object.keys(src).slice(0, LIMITS.columns)) {
      if (!/^\d{1,15}$/.test(k)) continue;
      const v = src[k];
      if (typeof v === "string") cells[k] = v.slice(0, STR_MAX);
      else if (typeof v === "number" && Number.isFinite(v)) cells[k] = v;
      else if (typeof v === "boolean") cells[k] = v;
    }
    const rest = clean({ ...(r as any), cells: undefined }, "row", 1) || {};
    delete rest.cells;
    out.push({ ...rest, cells });
  }
  fixIds(out);
  return out;
}

export function sanitizeTheme(theme: unknown): any {
  if (!theme || typeof theme !== "object" || Array.isArray(theme)) return undefined;
  return clean(theme, "theme", 0);
}
