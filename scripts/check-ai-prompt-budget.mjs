// Extract the REAL prompt budgeter from app-part2.js and prove it stays under
// the server's zod cap for conversations of every shape — including the one
// that actually broke (a long chat with verbose assistant turns).
//
// Uses new Function rather than eval so the block gets its own clean scope and
// its stubs are passed in as parameters — no scope collisions to fight.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = resolve(ROOT, 'client/public/js/app-part2.js');
const src = readFileSync(P, 'utf8')  // app-part2 has no NUL bytes (that is app-part1); latin1 would turn '…' into 3 chars;

const a = src.indexOf('const AI_SYS_MAX=');
const b = src.indexOf('function _aiChatHistory()', a);
if (a < 0 || b < 0) { console.error('prompt-budget block not found in app-part2.js'); process.exit(1); }
const block = src.slice(a, b);

// A deliberately OVERSIZED workspace snapshot, so the context path is exercised
// at its worst rather than at a convenient size.
const makeApi = new Function('D', 'curScreen', '_buildAIContext',
  block + '\nreturn {AI_SYS_MAX,AI_USER_MAX,AI_TURN_MAX,_aiClampStr,_aiChatSystemPrompt};');
const api = makeApi(
  { creds: { userName: 'Idris' } },
  'home',
  () => 'WORKSPACE CONTEXT\n' + 'x'.repeat(6000)
);
const { AI_SYS_MAX: SYS_MAX, AI_USER_MAX: USER_MAX, _aiClampStr: clampStr, _aiChatSystemPrompt: buildSys } = api;

const turn = (role, n) => ({ role, content: (role === 'user' ? 'Q' : 'A').repeat(n) });
const cases = [
  ['no history',                 []],
  ['1 short turn',               [turn('user', 20)]],
  ['9 short turns',              Array.from({length: 9}, (_, i) => turn(i % 2 ? 'assistant' : 'user', 40))],
  ['9 VERBOSE turns (the bug)',  Array.from({length: 9}, (_, i) => turn(i % 2 ? 'assistant' : 'user', 1200))],
  ['9 huge turns',               Array.from({length: 9}, (_, i) => turn(i % 2 ? 'assistant' : 'user', 9000))],
  ['50 turns',                   Array.from({length: 50}, (_, i) => turn(i % 2 ? 'assistant' : 'user', 500))],
];

let fail = 0;
console.log(`server cap: systemPrompt <= 4000   ·   our budget: ${SYS_MAX}\n`);
for (const [label, hist] of cases) {
  const s = buildSys(hist);
  const ok = s.length <= 4000 && s.length <= SYS_MAX;
  if (!ok) fail++;
  const keptTurns = (s.match(/(^|\n)(USER|ASSISTANT): /g) || []).length;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(26)} systemPrompt=${String(s.length).padStart(4)} chars, turns kept=${keptTurns}`);
}

const starved = buildSys(Array.from({length: 30}, () => turn('assistant', 5000)));
const keepsRules = /You are the LevelUp AI assistant/.test(starved) && /Be concise/.test(starved);
console.log(`${keepsRules ? 'PASS' : 'FAIL'}  rules boilerplate survives a starved budget (${starved.length} chars)`);
if (!keepsRules) fail++;

const marked = [turn('user', 300), turn('assistant', 300), { role: 'user', content: 'NEWEST_MARKER' }];
const keepsNewest = buildSys(marked).includes('NEWEST_MARKER');
console.log(`${keepsNewest ? 'PASS' : 'FAIL'}  newest turn retained (oldest dropped first)`);
if (!keepsNewest) fail++;

const clamped = clampStr('z'.repeat(50000), USER_MAX);
const userOk = clamped.length <= 8000 && clamped.length <= USER_MAX;
console.log(`${userOk ? 'PASS' : 'FAIL'}  userContent clamp: 50000 -> ${clamped.length} (cap 8000)`);
if (!userOk) fail++;

// Control: the OLD unbudgeted prompt must actually exceed 4000, or this whole
// check is proving nothing.
const oldStyle = 'RULES'.repeat(180) + '\n\n' + ('x'.repeat(6000)) + '\n\n' +
  Array.from({length: 9}, (_, i) => `${i % 2 ? 'ASSISTANT' : 'USER'}: ${'A'.repeat(1200)}`).join('\n\n');
console.log(`\ncontrol — unbudgeted prompt of the same conversation: ${oldStyle.length} chars ` +
            `(${oldStyle.length > 4000 ? 'exceeds' : 'DOES NOT EXCEED'} the 4000 cap)`);
if (oldStyle.length <= 4000) { console.log('control failed: the fixture no longer reproduces the bug'); fail++; }

console.log(fail ? `\n${fail} FAILURE(S)` : '\nAll prompt-budget cases stay within the server limits.');
process.exit(fail ? 1 : 0);
