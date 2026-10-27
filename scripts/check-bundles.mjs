#!/usr/bin/env node
/**
 * Guard for the client's plain-script bundles (build -234, after app-part1.js
 * was split into app-1 … app-7). Fails when:
 *   1. client/index.html's loader array differs from scripts/lib/bundles.mjs;
 *   2. a bundle is missing or does not parse;
 *   3. the NUL-placeholder file lost or gained a NUL byte;
 *   4. two bundles declare the same top-level name (a let/const/class clash is
 *      a SyntaxError that stops the later file loading at all; a function or
 *      var clash silently replaces the earlier one);
 *   5. code that runs while a bundle LOADS — its top-level statements, IIFEs,
 *      and the bodies of functions those call — uses a function / var / class
 *      declared in a LATER bundle. Inside one file that worked (declarations
 *      are hoisted); across files it is a ReferenceError that stops the boot.
 * Callbacks registered at load (listeners, timers) are listed for review but
 * do not fail: they run after loading, apart from the moments between files.
 *
 * usage: node scripts/check-bundles.mjs [jsDir] [indexHtml]
 *   defaults: client/public/js  client/index.html   (dist: dist/public/js dist/public/index.html)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { BUNDLES, VENDOR, NUL_FILE, NUL_COUNT } from './lib/bundles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.resolve(ROOT, process.argv[2] || 'client/public/js');
const html = path.resolve(ROOT, process.argv[3] || 'client/index.html');
let failures = 0;
const fail = (m) => { failures++; console.log('FAIL  ' + m); };
const pass = (m) => console.log('PASS  ' + m);

// 1. loader order
const page = fs.readFileSync(html, 'utf8');
const m = page.match(/\[\s*('\/js\/[^\]]+)\]\s*\.forEach\(\s*function\s*\(\s*src\s*\)/);
const loader = m ? [...m[1].matchAll(/'\/js\/([^']+)'/g)].map((x) => x[1]) : [];
const want = [...VENDOR, ...BUNDLES];
if (JSON.stringify(loader) === JSON.stringify(want)) pass(`loader loads ${want.length} files in bundles.mjs order`);
else fail(`index.html loader ${JSON.stringify(loader)} != bundles.mjs ${JSON.stringify(want)}`);

// 2 + 3. present, parse, NUL bytes
const parsed = [];
for (const f of BUNDLES) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { fail(`${f} missing`); continue; }
  const src = fs.readFileSync(p).toString('latin1');
  try {
    parsed.push({ f, ast: acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', locations: true }) });
  } catch (e) { fail(`${f} does not parse: ${e.message}`); }
  if (f === NUL_FILE) {
    const n = (src.match(/\0/g) || []).length;
    if (n === NUL_COUNT) pass(`${f} keeps its ${NUL_COUNT} NUL placeholders`); else fail(`${f} has ${n} NUL bytes, expected ${NUL_COUNT}`);
  }
}
if (parsed.length === BUNDLES.length) pass(`all ${BUNDLES.length} bundles parse`);

// 4. top-level declarations
const ids = (p, out) => {
  if (!p) return out;
  if (p.type === 'Identifier') out.push(p.name);
  else if (p.type === 'ObjectPattern') p.properties.forEach((q) => ids(q.value || q.argument, out));
  else if (p.type === 'ArrayPattern') p.elements.forEach((e) => ids(e, out));
  else if (p.type === 'RestElement') ids(p.argument, out);
  else if (p.type === 'AssignmentPattern') ids(p.left, out);
  return out;
};
const decl = new Map(); // name -> {file, idx, kind, line}
const fnNode = new Map();
const clashes = [];
parsed.forEach(({ f, ast }, idx) => {
  for (const s of ast.body) {
    const add = (name, kind) => {
      const prev = decl.get(name);
      if (prev && prev.file !== f) clashes.push(`${name}: ${prev.kind} in ${prev.file}:${prev.line} and ${kind} in ${f}:${s.loc.start.line}`);
      decl.set(name, { file: f, idx, kind, line: s.loc.start.line });
    };
    if (s.type === 'FunctionDeclaration') { add(s.id.name, 'function'); fnNode.set(s.id.name, s); }
    else if (s.type === 'ClassDeclaration') add(s.id.name, 'class');
    else if (s.type === 'VariableDeclaration') s.declarations.forEach((d) => ids(d.id, []).forEach((n) => add(n, s.kind)));
  }
});
if (clashes.length) clashes.forEach((c) => fail('declared in two bundles — ' + c)); else pass('no top-level name is declared in two bundles');

// 5. load-time references to later bundles
const hoist = (body, set) => {
  for (const st of body.body || []) {
    if (st.type === 'FunctionDeclaration') set.add(st.id.name);
    if (st.type === 'VariableDeclaration') st.declarations.forEach((d) => ids(d.id, []).forEach((x) => set.add(x)));
  }
  return set;
};
const forward = [], deferred = [];
function walk(n, idx, scope, mode, root, seen) {
  if (!n || typeof n.type !== 'string') return;
  const into = (fn, sink) => {
    const local = new Set(scope);
    fn.params.forEach((p) => ids(p, []).forEach((x) => local.add(x)));
    if (fn.body.type === 'BlockStatement') { hoist(fn.body, local); fn.body.body.forEach((st) => walk(st, idx, local, sink, root, seen)); }
    else walk(fn.body, idx, local, sink, root, seen);
  };
  switch (n.type) {
    case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': return;
    case 'CallExpression': case 'NewExpression': {
      const c = n.callee;
      if (c && (c.type === 'FunctionExpression' || c.type === 'ArrowFunctionExpression')) { into(c, mode); n.arguments.forEach((a) => walk(a, idx, scope, mode, root, seen)); return; }
      if (c && c.type === 'Identifier' && !scope.has(c.name)) {
        const d = decl.get(c.name), key = c.name + '@' + idx + '@' + mode;
        if (d && d.kind === 'function' && d.idx <= idx && !seen.has(key)) {
          seen.add(key);
          const fn = fnNode.get(c.name);
          const local = hoist(fn.body, new Set());
          fn.params.forEach((p) => ids(p, []).forEach((x) => local.add(x)));
          fn.body.body.forEach((st) => walk(st, idx, local, mode, root, seen));
        }
      }
      for (const a of n.arguments) if (a && (a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression')) into(a, 'deferred');
      break;
    }
    case 'UnaryExpression': if (n.operator === 'typeof' && n.argument.type === 'Identifier') return; break;
    case 'Identifier': {
      if (scope.has(n.name)) return;
      const d = decl.get(n.name);
      if (d && d.idx > idx) (mode === 'now' ? forward : deferred).push(`${parsed[idx].f}:${n.loc.start.line} uses ${n.name} (${d.kind} in ${d.file}:${d.line}) — loaded from ${parsed[idx].f}:${root}`);
      return;
    }
    case 'MemberExpression': walk(n.object, idx, scope, mode, root, seen); if (n.computed) walk(n.property, idx, scope, mode, root, seen); return;
    case 'Property': if (n.computed) walk(n.key, idx, scope, mode, root, seen); walk(n.value, idx, scope, mode, root, seen); return;
    case 'MethodDefinition': case 'PropertyDefinition': case 'BreakStatement': case 'ContinueStatement': return;
    case 'LabeledStatement': walk(n.body, idx, scope, mode, root, seen); return;
  }
  for (const k of Object.keys(n)) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach((x) => x && typeof x.type === 'string' && walk(x, idx, scope, mode, root, seen));
    else if (v && typeof v.type === 'string') walk(v, idx, scope, mode, root, seen);
  }
}
parsed.forEach(({ ast }, idx) => {
  for (const s of ast.body) if (s.type !== 'FunctionDeclaration') walk(s, idx, new Set(), 'now', s.loc.start.line, new Set());
});
const uniq = (a) => [...new Set(a)];
if (forward.length) uniq(forward).forEach((x) => fail('load-time call into a later bundle — ' + x));
else pass('no code that runs at load uses a later bundle');
const roots = uniq(deferred.map((x) => x.replace(/^.* — loaded from /, '')));
if (roots.length) console.log(`note  ${roots.length} load-time callback setup(s) reach later bundles (run after loading; review if the setup can fire early): ${roots.join(', ')}`);

console.log(failures ? `\n${failures} check(s) failed` : '\nbundles OK');
process.exit(failures ? 1 : 0);
