#!/usr/bin/env node
/**
 * Tenancy guard (multi-workspace, build -278).
 *
 * Every signed-in person is a MEMBER ROW (users.id) that belongs to exactly one
 * workspace (users.workspaceId) — see docs/multi-tenant-plan.md. So a query
 * that is keyed by a user id is inside one workspace by construction, and the
 * only way data can cross workspaces is a query on a per-user table that is
 * NOT keyed by a user id (a "cross-user" query: team lists, shared-item scans,
 * background passes over everyone).
 *
 * This script finds every drizzle select / update / delete on a per-user table
 * (and on `users`) in server/ (tests excluded) and fails when one has no
 * user-id condition, unless it carries a reviewed marker on the statement or
 * within the 3 lines above it:
 *
 *     // tenancy: <why this is safe — e.g. "scoped by wsMemberIds", "operator">
 *
 * It is a finder, not a prover: the two-workspace harness
 * (server/tenancy.*.test.ts) is what proves isolation.
 *
 *   node scripts/check-tenancy.mjs          # fail on unreviewed cross-user queries
 *   node scripts/check-tenancy.mjs --list   # print every finding, reviewed or not
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');

// ── tables: schema export name → the columns that key a row to a member ──────
const schemaSrc = fs.readFileSync(path.join(ROOT, 'drizzle/schema.ts'), 'utf8');
const tables = new Map(); // exportName → { sql, keys:[col…] }
{
  const re = /export const (\w+) = mysqlTable\(\s*["'](\w+)["']\s*,\s*\{/g;
  let m;
  while ((m = re.exec(schemaSrc))) {
    // body = up to the matching close of the column object
    let i = re.lastIndex, depth = 1;
    while (i < schemaSrc.length && depth) { const c = schemaSrc[i++]; if (c === '{') depth++; else if (c === '}') depth--; }
    const body = schemaSrc.slice(re.lastIndex, i);
    const keys = [];
    for (const k of ['userId', 'ownerUserId', 'ownerId', 'createdBy', 'invitedBy', 'actorUserId', 'sharedWithUserId', 'workspaceId']) {
      if (new RegExp(String.raw`\b${k}\s*:`).test(body)) keys.push(k);
    }
    tables.set(m[1], { sql: m[2], keys });
  }
}
// Tables with no member data at all (shared reference content, operator logs,
// throttles). Queries on them are never a tenancy question.
const GLOBAL_TABLES = new Set([
  'helpCategories', 'helpArticles', 'tours', 'tourSteps', 'rateLimits', 'errorLog', 'systemSettings', 'workspaces',
]);
// users: keyed by its own id / openId / workspace.
tables.set('users', { sql: 'users', keys: ['id', 'openId', 'workspaceId', 'accountId'] });

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out); }
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** The statement around index i: back to the previous `;`/`{`/`}` at depth 0, forward to the `;` at depth 0. */
function statementAt(src, i) {
  let s = i, depth = 0;
  while (s > 0) {
    const c = src[s - 1];
    if (c === ')' || c === ']' || c === '}') depth++;
    else if (c === '(' || c === '[' || c === '{') { if (depth === 0) break; depth--; }
    else if (c === ';' && depth === 0) break;
    s--;
  }
  let e = i; depth = 0;
  while (e < src.length) {
    const c = src[e];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { if (depth === 0) break; depth--; }
    else if (c === ';' && depth === 0) break;
    e++;
  }
  return { start: s, end: e, text: src.slice(s, e) };
}

const findings = [];
let byKeyCount = 0;
for (const file of walk(path.join(ROOT, 'server'))) {
  const src = fs.readFileSync(file, 'utf8');
  // local aliases: `import { tasksTable as tt }` is not used in this codebase; names are direct.
  // Joins are not scanned on their own: a joined table is limited by the join
  // to the rows of the table the query starts from, which is the one checked.
  const re = /\.(from|update|delete)\(\s*(\w+)\s*[,)]/g;
  let m;
  while ((m = re.exec(src))) {
    const op = m[1], name = m[2];
    const t = tables.get(name);
    if (!t || GLOBAL_TABLES.has(name)) continue;
    if (!t.keys.length) continue;
    const st = statementAt(src, m.index);
    // Keyed = an eq()/inArray() on one of the table's member columns whose
    // OTHER side is a value. A comparison with another table's column is a
    // join condition, not a scope ("users.id = smtp_accounts.userId").
    // THIS query only: from the call to the end of its method chain
    // (.from(t).where(…).limit(…)). A statement can hold two queries — a
    // ternary with a scoped and an unscoped branch — and each is judged alone.
    let ce = m.index;
    {
      const skipCall = (i) => { // i at '(' → index after the matching ')'
        let d = 0;
        for (; i < src.length; i++) { const c = src[i]; if (c === '(') d++; else if (c === ')') { d--; if (d === 0) return i + 1; } }
        return i;
      };
      ce = skipCall(src.indexOf('(', m.index));
      for (;;) {
        const mm2 = /^\s*\.\s*[A-Za-z_$][\w$]*\s*\(/.exec(src.slice(ce, ce + 200));
        if (!mm2) break;
        ce = skipCall(ce + mm2[0].length - 1);
      }
    }
    const chain = src.slice(m.index, ce);
    // `.where(conditions)` / `.where(and(...conditions))`: the conditions were
    // built in a variable — look at the text from its declaration onwards.
    let scopeText = chain;
    const wv = /\.where\(\s*(?:and\(\s*\.\.\.\s*)?([A-Za-z_$][\w$]*)\s*\)?\s*\)/.exec(chain);
    if (wv) {
      const before = src.slice(Math.max(0, st.start - 6000), st.start);
      const decl = before.lastIndexOf('const ' + wv[1]);
      const decl2 = before.lastIndexOf('let ' + wv[1]);
      const at = Math.max(decl, decl2);
      if (at >= 0) scopeText = before.slice(at) + chain;
    }
    // Helpers that build the workspace scope themselves.
    if (/\b_othersCond\(/.test(chain)) continue;
    const keyed = t.keys.some(k => {
      const re = new RegExp(String.raw`\b(?:eq|inArray)\(\s*${name}\.${k}\s*,\s*([A-Za-z_$][\w$]*)?`, 'g');
      let mm;
      while ((mm = re.exec(scopeText))) {
        const other = mm[1];
        if (!other || !tables.has(other)) return true;
      }
      return false;
    });
    // A follow-up on ONE row by its primary key or by an unguessable token —
    // "update the row I just read" — is not a cross-user read, provided the
    // key is a value the server already holds. A key taken straight from the
    // request (input.…) is never accepted here: it must come with a member
    // column, or be checked first.
    let byKey = false;
    if (!keyed) {
      const km = new RegExp(String.raw`\b(?:eq|inArray)\(\s*${name}\.(?:id|token)\s*,\s*([A-Za-z_$][\w$]*)`).exec(chain);
      if (km && !/^(input|req|body|query|params)$/.test(km[1])) byKey = true;
    }
    const line = src.slice(0, m.index).split('\n').length;
    const lines = src.split('\n');
    const stStartLine = src.slice(0, st.start).split('\n').length;
    const ctxLines = lines.slice(Math.max(0, stStartLine - 4), line).join('\n');
    const mark = /\/\/\s*tenancy:\s*(.+)/.exec(ctxLines);
    if (keyed) continue;
    if (byKey) { byKeyCount++; continue; }
    findings.push({
      file: path.relative(ROOT, file).split(path.sep).join('/'), line, op, table: name,
      reviewed: mark ? mark[1].trim() : null,
      snippet: st.text.replace(/\s+/g, ' ').trim().slice(0, 150),
    });
  }
}

const open = findings.filter(f => !f.reviewed);
if (LIST) {
  for (const f of findings) console.log(`${f.reviewed ? 'ok  ' : 'OPEN'} ${f.file}:${f.line} ${f.op}(${f.table})${f.reviewed ? '  — ' + f.reviewed : ''}\n       ${f.snippet}`);
}
console.log(`check:tenancy — ${findings.length} cross-user queries on per-user tables: ${findings.length - open.length} reviewed, ${open.length} unreviewed. (${byKeyCount} single-row follow-ups by key not counted.)`);
if (open.length) {
  if (!LIST) for (const f of open) console.log(`  ${f.file}:${f.line}  ${f.op}(${f.table})  ${f.snippet}`);
  console.log('\nFAIL: scope each one to the workspace (wsMemberIds / users.workspaceId), or mark it `// tenancy: <reason>` after review.');
  process.exit(1);
}
console.log('PASS');
