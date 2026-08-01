#!/usr/bin/env node
/**
 * Electric Ink contrast check.
 *
 * The pitch flagged that --t2/--t3 were tuned for the #0B0F1A ground, not
 * Electric Ink's darker #08080D, and asked for them to be re-checked at >=4.5:1.
 *
 * This computes WCAG ratios from the TOKEN VALUES in plain JS. It deliberately
 * does NOT read getComputedStyle: this codebase has twice produced bogus
 * contrast numbers that way (a 1.01 ratio from a stale text colour), and a
 * check that can be fooled by a stale read is worse than no check.
 *
 *   node scripts/check-electric-contrast.mjs
 *
 * Exits non-zero if any text token fails AA (4.5:1) on any surface it can
 * actually sit on.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'client/public/js/app-part1.js');

// Pull ELECTRIC_DARK straight out of the shipped bundle so this can never
// drift from what actually ships.
const src = readFileSync(SRC, 'latin1');
const m = src.match(/const ELECTRIC_DARK=\{([\s\S]*?)\n\};/);
if (!m) { console.error('ELECTRIC_DARK not found in app-part1.js'); process.exit(1); }
const tokens = {};
for (const hit of m[1].matchAll(/(\w+)\s*:\s*'([^']+)'/g)) tokens[hit[1]] = hit[2];

const hex = h => {
  const s = h.replace('#', '');
  const f = s.length === 3 ? s.split('').map(c => c + c).join('') : s;
  return [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16));
};
const lum = rgb => {
  const [r, g, b] = rgb.map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const l1 = lum(hex(a)), l2 = lum(hex(b)); const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]; return (hi + 0.05) / (lo + 0.05); };

// Text tokens vs every ground/surface they can land on.
const SURFACES = ['bg', 's1', 's2', 's3', 's4'];
const TEXT = ['t1', 't2', 't3'];          // t4 is a disabled/hairline tone, not body text
const ACCENTS = ['ok', 'warn', 'purp'];   // lime / amber / magenta, used for numerals + pills
const VOLT = '#5B8CFF';                   // from the injected stylesheet, used for nav + card titles

console.log('Electric Ink — WCAG contrast, computed from token values\n');
console.log('  ground/surfaces: ' + SURFACES.map(s => `${s} ${tokens[s]}`).join('  '));
console.log('');

let fails = 0, worst = { r: Infinity };
const row = (label, fg, bgKey, min) => {
  const r = ratio(fg, tokens[bgKey]);
  const ok = r >= min;
  if (!ok) fails++;
  if (r < worst.r) worst = { r, label: `${label} on ${bgKey}` };
  return `${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(16)} on ${bgKey.padEnd(3)} ${tokens[bgKey].padEnd(9)} = ${r.toFixed(2)}:1  (min ${min})`;
};

for (const t of TEXT) {
  for (const s of SURFACES) console.log('  ' + row(`${t} ${tokens[t]}`, tokens[t], s, 4.5));
  console.log('');
}
console.log('  Accent tones — these carry numerals and pills, so AA still applies:');
for (const a of ACCENTS) for (const s of ['bg', 's1', 's2']) console.log('  ' + row(`${a} ${tokens[a]}`, tokens[a], s, 4.5));
console.log('');
console.log('  Volt blue (nav + card titles, from #lu-electric-css):');
for (const s of ['bg', 's1', 's2']) console.log('  ' + row(`volt ${VOLT}`, VOLT, s, 4.5));

console.log(`\n  worst: ${worst.label} at ${worst.r.toFixed(2)}:1`);
if (fails) { console.log(`\n${fails} FAILURE(S) — below WCAG AA.`); process.exit(1); }
console.log('\nAll Electric Ink text/accent pairs meet WCAG AA (4.5:1).');
