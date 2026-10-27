#!/usr/bin/env node
/**
 * Guard for inline event handlers built from template text (build -235).
 *
 * onclick="fn('${value}')" is parsed by the browser twice — as an HTML
 * attribute, then as JavaScript — so a value holding a quote breaks the
 * handler (a tag named John's, a title with an apostrophe) or runs as code.
 * Fails when, inside a ${…} of an on*="…" attribute:
 *   • esc( is used — it HTML-escapes, but the attribute is decoded before the
 *     JS runs, so a ' still ends the JS string. Use _jsAttr() inside '…', or
 *     _tidLit() for an id, or _jsArg() for a whole JSON value;
 *   • JSON.stringify( is used — its " ends the attribute. Use _jsArg();
 *   • a bare '${name}' sits inside quotes unescaped — use _jsAttr();
 *   • window.open( gets an interpolated URL — use _luOpenUrl(), which only
 *     opens http(s)/mailto links.
 * And a ratchet: the number of inline handlers that interpolate anything may
 * not grow past scripts/lib/handlers-baseline.json. New markup should use
 * _act() (app-1-core.js): data- attributes + one delegated listener.
 *
 * usage: node scripts/check-handlers.mjs [jsDir] [--update-baseline]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLES } from './lib/bundles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dir = path.resolve(ROOT, args.find((a) => !a.startsWith('--')) || 'client/public/js');
const BASE = path.join(ROOT, 'scripts/lib/handlers-baseline.json');
const ATTR = /\bon(?:click|change|input|keydown|keyup|blur|focus|submit|mousedown|dblclick|contextmenu)="([^"]*)"/g;

function spans(s) {
  const out = [];
  let i = 0;
  while ((i = s.indexOf('${', i)) >= 0) {
    let depth = 0, k = i + 1;
    for (; k < s.length; k++) { if (s[k] === '{') depth++; else if (s[k] === '}') { depth--; if (depth === 0) break; } }
    out.push(s.slice(i, k + 1));
    i = k + 1;
  }
  return out;
}
const bad = [];
let interpolating = 0, bareQuoted = 0;
for (const f of BUNDLES) {
  const src = fs.readFileSync(path.join(dir, f)).toString('latin1');
  const lineOf = (pos) => src.slice(0, pos).split('\n').length;
  // Handler strings are also built in variables (clickHandler=`window.open('${…}')`),
  // which the attribute scan below can't see: no interpolated window.open anywhere
  // (the bookmarklet's own javascript: code excepted).
  for (const w of src.matchAll(/window\.open\(\s*'\$\{/g)) {
    const line = src.slice(src.lastIndexOf('\n', w.index) + 1, src.indexOf('\n', w.index));
    if (!/javascript:\(function/.test(line)) bad.push(`${f}:${lineOf(w.index)}  window.open('\${…}') in built markup — use _luOpenUrl('\${_jsAttr(…)}')`);
  }
  for (const m of src.matchAll(ATTR)) {
    const body = m[1];
    const sp = spans(body);
    if (!sp.length) continue;
    interpolating++;
    const where = `${f}:${lineOf(m.index)}`;
    for (const s of sp) {
      if (/(^|[^\w.$])esc\(/.test(s)) bad.push(`${where}  esc() inside a handler — use _jsAttr()/_tidLit(): ${s.slice(0, 90)}`);
      if (/JSON\.stringify\(/.test(s)) bad.push(`${where}  JSON.stringify() inside a handler — use _jsArg(): ${s.slice(0, 90)}`);
    }
    if (/window\.open\(\s*['`]\$\{/.test(body)) bad.push(`${where}  window.open() with an interpolated URL — use _luOpenUrl(): ${body.slice(0, 90)}`);
    for (const q of body.match(/'\$\{[A-Za-z_$][\w$.]*\}'/g) || []) { bareQuoted++; bad.push(`${where}  unescaped ${q} inside a handler — use '\${_jsAttr(…)}' (or _tidLit for an id): ${body.slice(0, 90)}`); }
  }
}
let failures = 0;
if (bad.length) { failures += bad.length; bad.forEach((b) => console.log('FAIL  ' + b)); }
else console.log('PASS  no esc() / JSON.stringify() / raw window.open URL inside inline handlers');

let baseline = null;
try { baseline = JSON.parse(fs.readFileSync(BASE, 'utf8')).interpolatingHandlers; } catch {}
if (args.includes('--update-baseline') || baseline == null) {
  fs.writeFileSync(BASE, JSON.stringify({ interpolatingHandlers: interpolating, note: 'Inline on*= handlers that interpolate ${…}. May only go down — new markup uses _act(). node scripts/check-handlers.mjs --update-baseline after lowering it.' }, null, 2) + '\n');
  console.log(`PASS  baseline set to ${interpolating} interpolating inline handlers`);
} else if (interpolating > baseline) {
  failures++;
  console.log(`FAIL  ${interpolating} inline handlers interpolate values (baseline ${baseline}). Build new handlers with _act('fn',[args]) instead of onclick="fn('\${…}')".`);
} else {
  console.log(`PASS  ${interpolating} interpolating inline handlers (baseline ${baseline})` + (interpolating < baseline ? ` — lower it: node scripts/check-handlers.mjs --update-baseline` : ''));
}
console.log(failures ? `\n${failures} problem(s)` : '\nhandlers OK');
process.exit(failures ? 1 : 0);
