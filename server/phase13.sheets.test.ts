/**
 * F125 — Sheet formulas address cells by POSITION (A1 notation). Sorting,
 * inserting or deleting rows/columns used to reorder the data while every
 * formula kept the same positions, so formulas silently read other cells; and
 * the cycle check was "recursion deeper than 25" → a running total longer than
 * ~26 rows showed #CYCLE.
 *
 * This loads the SHIPPED client code from app-part2.js (the formula engine and
 * the column & row operations) into a vm and drives the real menu actions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";
import { sanitizeSheetRows } from "./_core/deckSheetSanitize";

const src = readFileSync(resolve(__dirname, "../client/public/js/app-part2.js"), "utf8");
function block(start: string, end: string) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error("block not found: " + start);
  return src.slice(a, b);
}
const engine = block("// ─── Formula engine", "// ─── Display / formatting");
const ops = block("// ─── Column & row operations", "// ─── Design / theme");
const sanitizer = block("var _LU_DS_COLOR_KEY", "// ─── Canvas + element rendering");

let menu: any[] = [];
const ctx: any = {
  _sheetCurrent: null,
  SHEET_PALETTE: ["#3b82f6"],
  SHEET_COL_TYPES: [],
  saveSheets() {},
  renderSheetGrid() {},
  _shSnap() {},
  toast() {},
  _shPopMenu(_ev: any, items: any[]) { menu = items; },
  _shColorMenu() {},
  prompt: () => null,
  esc: (s: any) => String(s),
};
vm.createContext(ctx);
vm.runInContext(engine + "\n" + ops + "\n" + sanitizer + "\n;this._shEval=_shEval;this._shPass=_shPass;this._luSanSheetRow=_luSanSheetRow;", ctx);
const C: any = ctx;

// Sheet helpers: columns get ids 1..n, rows ids 1..n; grid[r][c] = cell value
function sheet(grid: any[][], ncols?: number) {
  const n = ncols || Math.max(...grid.map((r) => r.length));
  const columns = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: "C" + (i + 1), type: "text" }));
  const rows = grid.map((r, ri) => {
    const cells: any = {};
    r.forEach((v, ci) => { if (v !== undefined && v !== null && v !== "") cells[columns[ci].id] = v; });
    return { id: ri + 1, cells, color: "" };
  });
  const s = { id: 1, title: "t", columns, rows };
  C._sheetCurrent = s;
  return s;
}
// the formula/value stored in the cell currently at (row index, column index)
const raw = (s: any, r: number, c: number) => (s.rows[r].cells || {})[s.columns[c].id];
// evaluate whatever is in that cell, as the grid shows it
function val(s: any, r: number, c: number) {
  const v = raw(s, r, c);
  return typeof v === "string" && v.charAt(0) === "=" ? C._shEval(s, v, 0) : v;
}
// find the cell holding a given row id / column id (cells move with their row)
const at = (s: any, rowId: number, colId: number) => {
  const r = s.rows.findIndex((x: any) => x.id === rowId);
  const c = s.columns.findIndex((x: any) => x.id === colId);
  return { r, c };
};
function rowMenu(s: any, rowIdx: number, label: string) {
  menu = [];
  C.shRowMenu({ stopPropagation() {} }, s.rows[rowIdx].id);
  const item = menu.find((m) => m.html.includes(label));
  if (!item) throw new Error("menu item not found: " + label);
  item.onClick();
}

describe("formulas keep their cells through structural edits", () => {
  it("SUM(A1:A3) sums the same values after sorting", () => {
    // B1 holds the total; A4 (5) is outside the range
    const s = sheet([[30, "=SUM(A1:A3)"], [10], [20], [5]]);
    expect(val(s, 0, 1)).toBe(60);
    C.shSortByCol(1, 1); // A ascending: 5, 10, 20, 30
    expect(s.rows.map((r: any) => r.cells[1])).toEqual([5, 10, 20, 30]);
    const p = at(s, 1, 2);
    expect(raw(s, p.r, p.c)).toBe("=SUM(A2:A4)");
    expect(val(s, p.r, p.c)).toBe(60); // was 35 (5+10+20) before the fix
  });

  it("a range scattered by a sort keeps exactly its cells", () => {
    const s = sheet([[1, "=SUM(A1:A2)", "=A2"], [3], [2]]);
    expect(val(s, 0, 1)).toBe(4);
    C.shSortByCol(1, 1); // 1, 2, 3 — the old row 2 (3) is now row 3
    expect(raw(s, 0, 1)).toBe("=SUM(A1,A3)");
    expect(val(s, 0, 1)).toBe(4);
    expect(raw(s, 0, 2)).toBe("=A3");
    expect(val(s, 0, 2)).toBe(3);
    C.shSortByCol(1, -1); // descending: 3, 2, 1
    const p = at(s, 1, 2);
    expect(val(s, p.r, p.c)).toBe(4);
    expect(val(s, p.r, p.c + 1)).toBe(3);
  });

  it("SUM(A1:A3) is unchanged after inserting a column before A", () => {
    const s = sheet([[1, null, "=SUM(A1:A3)"], [2], [3]]);
    expect(val(s, 0, 2)).toBe(6);
    C.shInsertCol(1, 0); // insert left of A
    expect(s.columns.length).toBe(4);
    expect(raw(s, 0, 3)).toBe("=SUM(B1:B3)");
    expect(val(s, 0, 3)).toBe(6);
  });

  it("SUM(A1:A3) is unchanged after inserting a row above (and grows when inserted inside)", () => {
    const s = sheet([[1, "=SUM(A1:A3)"], [2], [3]]);
    rowMenu(s, 0, "Insert above");
    expect(s.rows.length).toBe(4);
    expect(raw(s, 1, 1)).toBe("=SUM(A2:A4)");
    expect(val(s, 1, 1)).toBe(6);
    rowMenu(s, 2, "Insert above"); // inside the range (above the "2")
    expect(raw(s, 1, 1)).toBe("=SUM(A2:A5)");
    s.rows[2].cells[1] = 10; // the new row is inside the sum
    expect(val(s, 1, 1)).toBe(16);
  });

  it("deleting a referenced column gives #REF!", () => {
    const s = sheet([[1, 2, "=SUM(A1:A2)", "=B1*2", "=C1+1"], [4]]);
    expect(val(s, 0, 2)).toBe(5);
    C.shDeleteCol(1); // delete A
    expect(raw(s, 0, 1)).toBe("=SUM(#REF!)");
    expect(val(s, 0, 1)).toBe("#REF!");
    expect(raw(s, 0, 2)).toBe("=A1*2"); // B → A, still the 2
    expect(val(s, 0, 2)).toBe(4);
    expect(raw(s, 0, 3)).toBe("=B1+1"); // refers to the #REF! cell → #REF! too
    expect(val(s, 0, 3)).toBe("#REF!");
  });

  it("deleting part of a range shrinks it; deleting a referenced row gives #REF!", () => {
    const s = sheet([[1, "=SUM(A1:A3)", "=A2"], [2], [3]]);
    C.shDeleteRow(2);
    expect(raw(s, 0, 1)).toBe("=SUM(A1:A2)");
    expect(val(s, 0, 1)).toBe(4);
    expect(raw(s, 0, 2)).toBe("=#REF!");
    expect(val(s, 0, 2)).toBe("#REF!");
    const t = sheet([[1, "=SUM(A1:B2)"], [2, 5]]);
    C.shDeleteCol(2); // the column holding the formula AND part of the range
    expect(t.rows[0].cells[2]).toBeUndefined();
    const u = sheet([[1, 7, "=SUM(A1:B2)"], [2, 5]]);
    C.shDeleteCol(2); // B removed from inside the rectangle
    expect(raw(u, 0, 1)).toBe("=SUM(A1:A2)");
    expect(val(u, 0, 1)).toBe(3);
  });

  it("move up / down and duplicate keep refs on their cells", () => {
    const s = sheet([[1, "=A3*10"], [2], [3]]);
    rowMenu(s, 2, "Move up"); // the 3 moves to row 2
    expect(raw(s, 0, 1)).toBe("=A2*10");
    expect(val(s, 0, 1)).toBe(30);
    rowMenu(s, 0, "Duplicate"); // copy of row 1 at row 2; refs below shift
    expect(raw(s, 0, 1)).toBe("=A3*10");
    expect(raw(s, 1, 1)).toBe("=A3*10");
    expect(val(s, 1, 1)).toBe(30);
    rowMenu(s, 2, "Move down");
    expect(val(s, 0, 1)).toBe(30);
  });

  it("text inside string literals is never rewritten; $ markers are kept", () => {
    const s = sheet([[1, '=CONCAT("A1 is ",A1)', "=$A$1+A$1*2", '=IF(A1>0,"B2",A2)']]);
    expect(val(s, 0, 1)).toBe("A1 is 1");
    expect(val(s, 0, 2)).toBe(3);
    C.shInsertCol(1, 0);
    expect(raw(s, 0, 2)).toBe('=CONCAT("A1 is ",B1)');
    expect(val(s, 0, 2)).toBe("A1 is 1");
    expect(raw(s, 0, 3)).toBe("=$B$1+B$1*2");
    expect(val(s, 0, 3)).toBe(3);
    expect(raw(s, 0, 4)).toBe('=IF(B1>0,"B2",B2)');
  });

  it("insert/delete that touch nothing referenced leave formulas byte-identical", () => {
    const s = sheet([[1, "=sum( a1 : a1 )+a1"], [2]]);
    const before = raw(s, 0, 1);
    C.shInsertCol(2, 1); // right of B
    rowMenu(s, 1, "Insert below");
    expect(raw(s, 0, 1)).toBe(before);
  });
});

describe("cycle detection", () => {
  it("a 100-row running total (B2 = B1 + A2 …) evaluates without #CYCLE", () => {
    const grid: any[][] = [];
    for (let i = 1; i <= 100; i++) grid.push([i, i === 1 ? "=A1" : `=B${i - 1}+A${i}`]);
    const s = sheet(grid);
    expect(val(s, 99, 1)).toBe(5050);
    expect(val(s, 25, 1)).toBe(351);
    // and still right after sorting it descending (refs follow their cells)
    C.shSortByCol(1, -1);
    expect(val(s, 0, 1)).toBe(5050);
  });

  it("a 1,000-row chain still evaluates", () => {
    const grid: any[][] = [];
    for (let i = 1; i <= 1000; i++) grid.push([1, i === 1 ? "=A1" : `=B${i - 1}+A${i}`]);
    const s = sheet(grid);
    expect(val(s, 999, 1)).toBe(1000);
  });

  it("a whole-grid pass over a 1,000-row running total is linear, and its memo never outlives the pass", () => {
    const grid: any[][] = [];
    for (let i = 1; i <= 1000; i++) grid.push([1, i === 1 ? "=A1" : `=B${i - 1}+A${i}`]);
    const s = sheet(grid);
    const t = Date.now();
    const all = C._shPass(s, () => s.rows.map((_: any, r: number) => val(s, r, 1)));
    expect(Date.now() - t).toBeLessThan(3000);
    expect(all[999]).toBe(1000);
    expect(all.every((v: number, i: number) => v === i + 1)).toBe(true);
    s.rows[0].cells[1] = 101; // an edit after the pass is seen at once
    expect(val(s, 999, 1)).toBe(1100);
  });

  it("A1 = B1, B1 = A1 gives #CYCLE; so does a self reference and anything reading them", () => {
    const s = sheet([["=B1", "=A1", "=A1+1", "=C2"], [1, 2, "=C2*2", "=SUM(A2:C2)"]]);
    expect(val(s, 0, 0)).toBe("#CYCLE");
    expect(val(s, 0, 1)).toBe("#CYCLE");
    expect(val(s, 0, 2)).toBe("#CYCLE");
    expect(val(s, 1, 2)).toBe("#CYCLE"); // C2 = C2*2
    expect(val(s, 1, 3)).toBe("#CYCLE"); // D2 sums over C2
    // the same cell read twice is NOT a cycle
    const t = sheet([[2, "=A1*A1+A1", "=B1+B1"]]);
    expect(val(t, 0, 1)).toBe(6);
    expect(val(t, 0, 2)).toBe(12);
  });
});

describe("rewritten formulas survive the shared-sheet sanitizers unchanged", () => {
  it("server sanitizeSheetRows and client _luSanSheetRow keep the cells as they are", () => {
    const s = sheet([[1, 2, "=SUM(A1:B1)", "=$B$1"], [3, 4, '=CONCAT("A1",A2)']]);
    C.shDeleteCol(1);
    rowMenu(s, 0, "Insert above");
    C.shSortByCol(1, -1);
    const rows = JSON.parse(JSON.stringify(s.rows));
    expect(rows.some((r: any) => Object.values(r.cells).some((v: any) => /#REF!/.test(String(v))))).toBe(true);
    expect(sanitizeSheetRows(rows).map((r: any) => r.cells)).toEqual(rows.map((r: any) => r.cells));
    for (const r of rows) expect(JSON.parse(JSON.stringify(C._luSanSheetRow(r))).cells).toEqual(r.cells);
  });
});
