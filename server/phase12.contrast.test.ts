/**
 * Build -272: colours people read pass WCAG AA in every theme. check:a11y scans the
 * default dark and light themes on every screen; this covers what it can't reach:
 * all the bundled presets, any custom colour, and the exports that must not change.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";

const dir = path.join(__dirname, "../client/public/js");
const core = fs.readFileSync(path.join(dir, "app-1-core.js"), "latin1");

function between(a: string, b: string) {
  const i = core.indexOf(a), j = core.indexOf(b, i);
  if (i < 0 || j < 0) throw new Error("not found: " + a);
  return core.slice(i, j);
}
const ctx = vm.createContext({});
vm.runInContext(
  between("const THEME_DEFAULTS_DARK={", "// â\u0094\u0080â\u0094\u0080 Chromatic Bento") +
    between("const DAYBREAK_LIGHT={", "// â\u0094\u0080â\u0094\u0080 Electric Ink") +
    between("const ELECTRIC_DARK={", "// Page-accent map") +
    between("const THEME_PRESETS=[", "// Determine if any scheduled") .split("function _getEffectiveTheme")[0] +
    between("function _luRgb(c){", "function applyTheme(opts){") +
    ";var __={THEME_DEFAULTS_DARK,THEME_DEFAULTS_LIGHT,DAYBREAK_LIGHT,ELECTRIC_DARK,THEME_PRESETS,_luReadableTheme,_luFillSafe,_luTextSafe,_luRgb,_luContrast,_luThemeGrounds,_luThemeIsDark,_luAccentText,_luTextOnDark,_luHeroStop};" +
    "function _getEffectiveTheme(){return __.THEME_DEFAULTS_DARK;}",
  ctx,
);
const L = (ctx as any).__;
const WHITE = [255, 255, 255];

function assertReadable(name: string, t: any) {
  const r = L._luReadableTheme(t, t.ac);
  const g = L._luThemeGrounds(t);
  const merged = { ...t, ...r };
  for (const k of ["t1", "t2", "t3", "red", "warn", "ok", "purp", "ach"]) {
    const c = L._luRgb(merged[k]);
    if (!c) continue;
    for (const s of g) expect(L._luContrast(c, s), `${name} ${k} ${merged[k]}`).toBeGreaterThanOrEqual(4.5);
  }
  const ac = L._luRgb(merged.ac);
  if (ac) expect(L._luContrast(WHITE, ac), `${name} white on ac ${merged.ac}`).toBeGreaterThanOrEqual(4.5);
}

describe("every theme is readable", () => {
  it("the default dark, light, Daybreak and Electric themes", () => {
    assertReadable("dark", L.THEME_DEFAULTS_DARK);
    assertReadable("light", L.THEME_DEFAULTS_LIGHT);
    assertReadable("daybreak", { ...L.THEME_DEFAULTS_LIGHT, ...L.DAYBREAK_LIGHT });
    assertReadable("electric", { ...L.THEME_DEFAULTS_DARK, ...L.ELECTRIC_DARK });
  });
  it("every bundled preset, on either mode's defaults", () => {
    expect(L.THEME_PRESETS.length).toBeGreaterThan(10);
    for (const p of L.THEME_PRESETS) {
      assertReadable(p.name + " (dark)", { ...L.THEME_DEFAULTS_DARK, ...p.theme });
      assertReadable(p.name + " (light)", { ...L.THEME_DEFAULTS_LIGHT, ...p.theme });
    }
  });
  it("t3 stays dimmer than t2 in the defaults, so the hierarchy survives", () => {
    const lum = (c: string) => L._luContrast(L._luRgb(c), [0, 0, 0]);
    expect(lum(L.THEME_DEFAULTS_DARK.t3)).toBeLessThan(lum(L.THEME_DEFAULTS_DARK.t2));
    expect(lum(L.THEME_DEFAULTS_LIGHT.t3)).toBeGreaterThan(lum(L.THEME_DEFAULTS_LIGHT.t2));
  });
  it("any custom accent: white stays readable on it and it stays readable as text", () => {
    const g = L._luThemeGrounds(L.THEME_DEFAULTS_DARK);
    for (let i = 0; i < 400; i++) {
      const hex = "#" + ((i * 2654435761) >>> 8 & 0xffffff).toString(16).padStart(6, "0");
      expect(L._luContrast(WHITE, L._luRgb(L._luFillSafe(hex))), hex).toBeGreaterThanOrEqual(4.5);
      const t = L._luRgb(L._luTextSafe(hex, g, true));
      for (const s of g) expect(L._luContrast(t, s), hex).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the helpers only move what has to move", () => {
  it("a colour that already passes comes back unchanged", () => {
    expect(L._luFillSafe("#1e40af")).toBe("#1e40af");
    expect(L._luTextOnDark("#f8fafc")).toBe("#f8fafc");
  });
  it("anything that is not a plain hex colour passes through", () => {
    for (const v of ["var(--ok)", "transparent", "hsl(10,50%,50%)", "", undefined]) {
      expect(L._luFillSafe(v)).toBe(v);
      expect(L._luAccentText(v)).toBe(v);
    }
    expect(L._luAccentText("var(--ac)")).toBe("var(--ach)");
  });
  it("the Home banner's stops leave white text headroom for the orbs over them", () => {
    for (const c of ["#fb923c", "#0ea5e9", "#a855f7", "#7c3aed", "#3B82F6"]) {
      expect(L._luContrast(WHITE, L._luRgb(L._luHeroStop(c))), c).toBeGreaterThanOrEqual(6);
    }
  });
});

describe("exports keep their own colours", () => {
  const review = fs.readFileSync(path.join(dir, "app-6-review.js"), "utf8");
  const part2 = fs.readFileSync(path.join(dir, "app-part2.js"), "utf8");
  const pm = fs.readFileSync(path.join(dir, "app-pm.js"), "utf8");
  // a PDF, print window or email has no theme: a CSS variable there paints nothing
  const body = (src: string, name: string) => {
    const a = src.search(new RegExp("^(?:async )?function " + name + "\\b", "m"));
    expect(a, name).toBeGreaterThan(-1);
    const rest = src.slice(a + 10);
    const b = rest.search(/^(?:async )?function \w+/m);
    return rest.slice(0, b < 0 ? undefined : b);
  };
  it.each([
    ["exportIdeaPDF", review],
    ["exportJournalPDF", review],
    ["exportNotePDF", part2],
    ["pmReportHtml", pm],
  ])("%s has no theme tokens in its text colours", (name, src) => {
    const text = body(src as string, name as string);
    expect(text).not.toMatch(/(?<![-\w])color:var\(--(ach|red|warn|ok|purp)\)/);
    expect(text).not.toContain("_luAccentText");
  });
});

describe("stored records keep their fields", () => {
  it("built-in sample events are unchanged, so removed samples stay removed", () => {
    // _luCalStripSeeds compares untouched samples to this list by exact JSON
    const life = fs.readFileSync(path.join(dir, "app-5-life.js"), "utf8");
    expect(life).toMatch(/title:'Daily Standup',time:'9:00 AM',end:'9:15 AM',day:0,hour:9,endHour:10,color:'var\(--ac\)'/);
    expect(life).not.toMatch(/endHour:10,color:'var\(--ach\)'/);
  });
  it("events the assistant creates store the fill colour", () => {
    const agent = fs.readFileSync(path.join(dir, "app-agent.js"), "utf8");
    expect(agent).not.toMatch(/color:'var\(--ach\)',(dateStr|desc):/);
  });
});
