#!/usr/bin/env node
/**
 * Mobile navigation guard — protects the phone slide-in sidebar.
 *
 * WHY THIS EXISTS
 * Build -145 (Aurora Glass) added
 *     body.aurora .mn, body.aurora .rr, body.aurora .sb{position:relative;z-index:1}
 * which is specificity (0,2,1). The phone sidebar rule is
 *     @media (max-width:900px){ .sb{position:fixed;z-index:9995} }
 * which is (0,1,0). MEDIA QUERIES ADD NO SPECIFICITY, so Aurora won: on phones
 * the sidebar dropped out of its fixed overlay to z-index 1 — BELOW the
 * z-index 9994 backdrop. Every tap on a nav row then hit .sb-backdrop, whose
 * handler is toggleMobileSidebar(false), so the menu just closed and nothing
 * navigated. Mobile nav was dead for a week (-145 → -155) because every change
 * in between was verified at desktop width.
 *
 * This resolves the CSS cascade statically — no browser, no dependencies — and
 * asserts the invariants that must hold for the phone menu to be usable.
 *
 *   node scripts/check-mobile-nav.mjs                      # local source
 *   node scripts/check-mobile-nav.mjs https://levelupnow.tools   # LIVE prod
 *
 * The URL form matters: this repo has twice shipped index.html CSS that looked
 * fine locally and was broken on prod (-132/-134), so "it passes on disk" is
 * not the same claim as "it is correct on the deployed site".
 *
 * Exits non-zero on failure. Run it before any push that touches CSS for
 * .sb / .mn / .rr / .sb-backdrop / .menu-toggle.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARG = process.argv[2];
const SOURCE = ARG || resolve(ROOT, 'client/index.html');
const PHONE_WIDTH = 390; // iPhone 14/15 logical width

async function loadHtml(src) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`fetch ${src} -> HTTP ${res.status}`);
    return { html: await res.text(), label: src };
  }
  return { html: readFileSync(src, 'utf8'), label: src.replace(ROOT + '\\', '').replace(ROOT + '/', '') };
}

// ── extract every <style> block, strip comments ──────────────────────────────
function styleBlocks(html) {
  const out = [];
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.map(css => css.replace(/\/\*[\s\S]*?\*\//g, ''));
}

// ── flatten to rules, keeping media condition + source order ─────────────────
function parseRules(css) {
  const rules = [];
  let i = 0, order = 0;
  const walk = (text, media) => {
    let buf = '';
    for (let p = 0; p < text.length; p++) {
      const ch = text[p];
      if (ch === '{') {
        // find matching close brace
        let depth = 1, q = p + 1;
        while (q < text.length && depth > 0) {
          if (text[q] === '{') depth++;
          else if (text[q] === '}') depth--;
          q++;
        }
        const head = buf.trim();
        const body = text.slice(p + 1, q - 1);
        if (head.startsWith('@media')) {
          walk(body, media ? `${media} and ${head.slice(6).trim()}` : head.slice(6).trim());
        } else if (head.startsWith('@')) {
          // @keyframes / @supports / @font-face — @supports bodies still hold rules
          if (head.startsWith('@supports')) walk(body, media);
        } else if (head) {
          rules.push({ selectors: head.split(',').map(s => s.trim()).filter(Boolean), body, media, order: order++ });
        }
        buf = '';
        p = q - 1;
      } else buf += ch;
    }
  };
  walk(css, null);
  return rules;
}

// ── does a media condition apply at PHONE_WIDTH? ─────────────────────────────
function mediaApplies(cond) {
  if (!cond) return true;
  const c = cond.toLowerCase();
  // A comma in a media query is OR — applies if any branch applies.
  if (c.includes(',')) return c.split(',').some(part => mediaApplies(part));
  let ok = true;
  for (const m of c.matchAll(/\(\s*(max|min)-width\s*:\s*(\d+)px\s*\)/g)) {
    const [, kind, px] = m;
    const n = Number(px);
    if (kind === 'max' && !(PHONE_WIDTH <= n)) ok = false;
    if (kind === 'min' && !(PHONE_WIDTH >= n)) ok = false;
  }
  if (/\(\s*pointer\s*:\s*coarse\s*\)/.test(c)) return ok; // phones are coarse-pointer
  if (/\(\s*hover\s*:\s*hover\s*\)/.test(c)) return false; // phones are not hover-capable
  if (/prefers-reduced-motion|print/.test(c)) return false;
  return ok;
}

// ── specificity (ids, classes/attrs/pseudo-classes, types/pseudo-elements) ───
function specificity(sel) {
  let s = sel.replace(/::[a-z-]+/gi, ' TYPE ').replace(/:not\(([^)]*)\)/gi, ' $1 ');
  const ids = (s.match(/#[\w-]+/g) || []).length;
  const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:[a-z-]+(\([^)]*\))?/gi) || []).length;
  const types = (s.match(/(^|[\s>+~])([a-z][\w-]*)/gi) || []).filter(t => !/[.#\[:]/.test(t)).length;
  return [ids, classes, types];
}
const cmpSpec = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

// ── does this selector target the phone sidebar in the given body context? ───
// Conservative: the LAST compound must be the .sb element itself, and every
// ancestor compound must be satisfiable from the known ancestor token pool.
// Anything containing tokens we don't recognise is reported, never silently
// assumed to match or not match.
const SIDEBAR_TOKENS = new Set(['nav', '.sb']);
function ancestorPool(bodyClasses) {
  return new Set(['html', 'body', '.app', '.scr', '.on', '.bg', '.wr', ...bodyClasses.map(c => '.' + c)]);
}
function compounds(sel) {
  return sel.split(/\s*[>+~]\s*|\s+/).filter(Boolean);
}
function tokens(compound) {
  return compound.match(/^[a-z][\w-]*|\.[\w-]+|#[\w-]+|\[[^\]]+\]|:{1,2}[a-z-]+(\([^)]*\))?/gi) || [];
}
function targetsSidebar(sel, bodyClasses, unknown) {
  const parts = compounds(sel);
  if (!parts.length) return false;
  const last = parts[parts.length - 1];
  const lastToks = tokens(last);
  if (!lastToks.some(t => t === '.sb')) return false;
  for (const t of lastToks) {
    if (!SIDEBAR_TOKENS.has(t.toLowerCase()) && !/^:{1,2}/.test(t)) { unknown.add(sel); return false; }
  }
  const pool = ancestorPool(bodyClasses);
  for (const anc of parts.slice(0, -1)) {
    for (const t of tokens(anc)) {
      if (/^:{1,2}/.test(t)) continue;
      if (!pool.has(t.toLowerCase())) return false; // e.g. body.aurora when aurora is off
    }
  }
  return true;
}

// ── resolve one property for .sb under a given body-class context ────────────
function declFor(body, prop) {
  // last declaration of the property wins within a block; capture !important
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, 'gi');
  let val = null, m;
  while ((m = re.exec(body))) val = m[1].trim();
  if (val == null) return null;
  const important = /!important/i.test(val);
  return { value: val.replace(/\s*!important\s*/i, '').trim(), important };
}

function resolve_(rules, prop, bodyClasses, unknown) {
  let winner = null;
  for (const r of rules) {
    if (!mediaApplies(r.media)) continue;
    const d = declFor(r.body, prop);
    if (!d) continue;
    for (const sel of r.selectors) {
      if (!targetsSidebar(sel, bodyClasses, unknown)) continue;
      const cand = { ...d, sel, media: r.media || '(none)', spec: specificity(sel), order: r.order };
      if (!winner) { winner = cand; continue; }
      if (cand.important !== winner.important) { if (cand.important) winner = cand; continue; }
      const c = cmpSpec(cand.spec, winner.spec);
      if (c > 0 || (c === 0 && cand.order >= winner.order)) winner = cand;
    }
  }
  return winner;
}

// generic resolver for a non-.sb selector (backdrop, hamburger)
function resolveSimple(rules, prop, selectorTest) {
  let winner = null;
  for (const r of rules) {
    if (!mediaApplies(r.media)) continue;
    const d = declFor(r.body, prop);
    if (!d) continue;
    for (const sel of r.selectors) {
      if (!selectorTest(sel)) continue;
      const cand = { ...d, sel, spec: specificity(sel), order: r.order };
      if (!winner) { winner = cand; continue; }
      if (cand.important !== winner.important) { if (cand.important) winner = cand; continue; }
      const c = cmpSpec(cand.spec, winner.spec);
      if (c > 0 || (c === 0 && cand.order >= winner.order)) winner = cand;
    }
  }
  return winner;
}

// ── run ──────────────────────────────────────────────────────────────────────
const { html, label } = await loadHtml(SOURCE);
const rules = styleBlocks(html).flatMap(parseRules);
const build = (html.match(/APP_BUILD\s*=\s*'([^']+)'/) || [])[1] || '(unknown)';
if (!rules.length) {
  console.log(`No CSS rules parsed from ${label} — refusing to report a pass.`);
  process.exit(1);
}
const unknown = new Set();
const failures = [];
const notes = [];

// The owner's real defaults: Aurora + Daybreak + Bento are all ON.
const OPEN = ['aurora', 'daybreak', 'bento', 'sb-open'];
const CLOSED = ['aurora', 'daybreak', 'bento'];
const NO_THEME = ['sb-open'];

const pos = resolve_(rules, 'position', OPEN, unknown);
const z = resolve_(rules, 'z-index', OPEN, unknown);
const tf = resolve_(rules, 'transform', OPEN, unknown);
const tfClosed = resolve_(rules, 'transform', CLOSED, unknown);
const posPlain = resolve_(rules, 'position', NO_THEME, unknown);
const zPlain = resolve_(rules, 'z-index', NO_THEME, unknown);
const bdZ = resolveSimple(rules, 'z-index', s => /(^|\s)\.sb-backdrop$/.test(s.trim()));
const mt = resolveSimple(rules, 'display', s => /\.menu-toggle$/.test(s.trim()));

const check = (ok, label, detail) => { (ok ? notes : failures).push(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`); };

check(pos?.value === 'fixed', 'sidebar is a fixed overlay on phones',
  `resolved position:${pos?.value ?? '(none)'} via \`${pos?.sel ?? '-'}\` @${pos?.media ?? '-'}`);

const zNum = Number(z?.value), bdNum = Number(bdZ?.value);
check(Number.isFinite(zNum) && Number.isFinite(bdNum) && zNum > bdNum,
  'sidebar stacks ABOVE the backdrop',
  `sidebar z-index:${z?.value ?? '(none)'} vs .sb-backdrop z-index:${bdZ?.value ?? '(none)'}` +
  (Number.isFinite(zNum) && Number.isFinite(bdNum) && zNum <= bdNum
    ? '  << taps would hit the backdrop, which closes the menu' : ''));

check(/translateX\(\s*0/.test(tf?.value ?? ''), 'open state slides the sidebar into view',
  `body.sb-open resolves transform:${tf?.value ?? '(none)'} via \`${tf?.sel ?? '-'}\``);

check(/-1\d\d%|-\d+px/.test(tfClosed?.value ?? '') || /translateX\(\s*-/.test(tfClosed?.value ?? ''),
  'closed state keeps the sidebar off-screen',
  `transform:${tfClosed?.value ?? '(none)'}`);

check(posPlain?.value === 'fixed' && Number(zPlain?.value) === zNum,
  'themes do not change the phone sidebar contract',
  `with no theme classes: position:${posPlain?.value ?? '(none)'} z-index:${zPlain?.value ?? '(none)'}; ` +
  `with aurora+daybreak+bento: position:${pos?.value ?? '(none)'} z-index:${z?.value ?? '(none)'}`);

check(mt && mt.value !== 'none', 'hamburger is visible on phones',
  `.menu-toggle display:${mt?.value ?? '(none)'}`);

console.log(`Mobile nav guard — resolving CSS at ${PHONE_WIDTH}px`);
console.log(`  source: ${label}`);
console.log(`  build:  ${build}\n`);
for (const n of notes) console.log('  ' + n);
for (const f of failures) console.log('  ' + f);
if (unknown.size) {
  console.log('\n  NOTE: selectors targeting .sb with tokens this checker does not model:');
  for (const u of unknown) console.log('    ' + u);
  console.log('  They were treated as NON-matching. Extend SIDEBAR_TOKENS if one is real.');
}
if (failures.length) {
  console.log(`\n${failures.length} FAILURE(S) — the phone menu is broken. See the header of this file for the -145 case.`);
  process.exit(1);
}
console.log(`\nAll ${notes.length} mobile-nav invariants hold.`);
