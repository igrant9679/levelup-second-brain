/**
 * Build -282 — the original workspace's company names ("CF", "LSI",
 * "CommunityForce", "LSI Media") must not show in the fixed texts of any other
 * workspace: Help articles, report presets and report sources.
 *
 * Runs the SHIPPED functions and the SHIPPED Help articles / presets (lifted
 * out of the bundles with acorn) in a vm, once per kind of workspace.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import vm from "vm";
import * as acorn from "acorn";

const JS = resolve(__dirname, "../client/public/js");
const cache: Record<string, Map<string, string>> = {};
function decls(file: string) {
  if (cache[file]) return cache[file];
  const src = readFileSync(resolve(JS, file), "utf8");
  const ast: any = acorn.parse(src, { ecmaVersion: "latest", sourceType: "script" });
  const m = new Map<string, string>();
  for (const n of ast.body) {
    if (n.type === "FunctionDeclaration" && n.id) m.set(n.id.name, src.slice(n.start, n.end));
    if (n.type === "VariableDeclaration") for (const d of n.declarations) if (d.id && d.id.name) m.set(d.id.name, src.slice(n.start, n.end));
  }
  return (cache[file] = m);
}
const PARTS: [string, string[]][] = [
  ["app-1-core.js", ["_luCfOn", "_luCF", "_luLSI", "_luCFLong", "_luLSILong", "_luWsText", "_DEFAULT_TASK_CONTEXTS", "_luDefaultTaskContexts"]],
  ["app-6-review.js", ["WIDGET_TEMPLATES", "WIDGET_SOURCES"]],
  ["app-7-team-help.js", ["HC_ARTICLES"]],
  ["app-workspace.js", ["_wsMe", "luWsFeature", "_wsNeutralWording"]],
];
/** A page of the given workspace, after sign-in (features as auth.me returns them; null = not answered yet). */
function page(features: Record<string, boolean> | null) {
  const win: any = { _luMe: features ? { workspace: { features } } : null };
  const ctx: any = { window: win, D: {}, console };
  vm.createContext(ctx);
  let code = "";
  const names: string[] = [];
  for (const [file, list] of PARTS) for (const nm of list) {
    const s = decls(file).get(nm);
    if (!s) throw new Error(`${nm} not found in ${file}`);
    code += s + "\n"; names.push(nm);
  }
  code += names.map((n) => `try{this.${n}=${n};}catch(_){}`).join("\n");
  vm.runInContext(code, ctx);
  // what wsBoot does before the rewording: articles about switched-off features go
  const drop: string[] = [];
  if (features && !features.atlas) drop.push("atlas-communityforce");
  if (features && !features.cfLabels) drop.push("smartsheet-integration", "pipeline-smartsheet-sync");
  ctx.HC_ARTICLES = ctx.HC_ARTICLES.filter((a: any) => !drop.includes(a.slug));
  vm.runInContext("HC_ARTICLES=this.HC_ARTICLES;", ctx);
  return ctx;
}
const texts = (C: any): string[] => [
  ...C.HC_ARTICLES.flatMap((a: any) => [a.title, a.summary, a.body]),
  ...C.WIDGET_TEMPLATES.flatMap((t: any) => [t.label, t.w && t.w.title]),
  ...Object.values(C.WIDGET_SOURCES).map((s: any) => s.label),
].filter(Boolean).map(String);
const OWN = /\bCF\b|\bLSI\b|CommunityForce|LSI[ -]Media/;

describe("company wording per workspace (-282)", () => {
  it("the original workspace reads every text exactly as written", () => {
    const C = page({ atlas: true, cfLabels: true });
    const before = JSON.stringify(texts(C));
    C._wsNeutralWording();
    expect(JSON.stringify(texts(C))).toBe(before);
    expect(texts(C).some((t) => OWN.test(t))).toBe(true);
    expect(C._luWsText("Today across CF / LSI / Personal")).toBe("Today across CF / LSI / Personal");
    expect(C._luDefaultTaskContexts().slice(0, 2)).toEqual(["LSI Business", "CF Business"]);
  });

  it("before sign-in has answered, nothing is reworded (no flicker for the original workspace)", () => {
    const C = page(null);
    const before = JSON.stringify(texts(C));
    C._wsNeutralWording();
    expect(JSON.stringify(texts(C))).toBe(before);
  });

  it("another workspace sees none of those names in Help, report presets or report sources", () => {
    const C = page({});
    C._wsNeutralWording();
    const left = texts(C).filter((t) => OWN.test(t)).map((t) => (t.match(new RegExp(".{0,60}(?:" + OWN.source + ").{0,60}")) || [t.slice(0, 120)])[0]);
    expect(left).toEqual([]);
    // and the rewording leaves no stutter behind
    const odd = texts(C).filter((t) => /Smartsheet \(Smartsheet\)|Smartsheet Smartsheet|Nifty(PM)? \(Nifty(PM)?\)|Nifty Nifty|Smartsheet deals from Atlas/.test(t));
    expect(odd.map((t) => t.slice(0, 120))).toEqual([]);
    // running it again changes nothing
    const once = JSON.stringify(texts(C));
    C._wsNeutralWording();
    expect(JSON.stringify(texts(C))).toBe(once);
  });

  it("rewords the phrases the app really uses", () => {
    const C = page({});
    const t = C._luWsText;
    expect(t("🎯 Today across CF / LSI / Personal")).toBe("🎯 Today across Smartsheet / Nifty / Personal");
    expect(t("External Work — CF vs LSI")).toBe("External Work — Smartsheet vs Nifty");
    expect(t("Source (Personal/CF/LSI)")).toBe("Source (Personal/Smartsheet/Nifty)");
    expect(t("CommunityForce · Smartsheet")).toBe("Smartsheet");
    expect(t("LSI Media · NiftyPM")).toBe("NiftyPM");
    expect(t("CF · Smartsheet")).toBe("Smartsheet");
    expect(t("LSI · NiftyPM")).toBe("NiftyPM");
    expect(t("Smartsheet (CommunityForce) and NiftyPM (LSI Media)")).toBe("Smartsheet and NiftyPM");
    expect(t("Personal vs CF (Smartsheet) vs LSI (Nifty)")).toBe("Personal vs Smartsheet vs Nifty");
    expect(t("NiftyPM integration (LSI / LSI Media)")).toBe("NiftyPM integration");
    expect(t("All tasks (Personal + CF (Atlas) + LSI)")).toBe("All tasks (Personal + Smartsheet (Atlas) + Nifty)");
    expect(t("**Atlas (CommunityForce)** projects")).toBe("**Atlas** projects");
    expect(t("A CFO and an LSIX stay as they are")).toBe("A CFO and an LSIX stay as they are");
    expect(t(null)).toBe(null);
    expect(C._luDefaultTaskContexts().slice(0, 3)).toEqual(["Business", "Client Work", "Financial Personal"]);
  });

  it("a workspace without Atlas loses the Help section about Atlas deals; one with Atlas keeps it and its owner's name", () => {
    const none = page({});
    none._wsNeutralWording();
    const p1 = none.HC_ARTICLES.find((a: any) => a.slug === "pipeline-overview");
    expect(p1 && /deals from Atlas|Every Atlas opportunity/.test(p1.body)).toBe(false);
    expect(p1.body).toMatch(/### Moving deals/);
    expect(p1.body).toMatch(/Sales Pipeline|pipeline/i);

    const withAtlas = page({ atlas: true });
    withAtlas._wsNeutralWording();
    const p2 = withAtlas.HC_ARTICLES.find((a: any) => a.slug === "pipeline-overview");
    expect(p2.body).toMatch(/CommunityForce deals from Atlas/);
    const a67 = withAtlas.HC_ARTICLES.find((a: any) => a.slug === "atlas-communityforce");
    expect(a67.title).toBe("Atlas (CommunityForce work)");
  });
});
