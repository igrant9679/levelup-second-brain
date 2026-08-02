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

// The transcript FLOOR is the reason verbose conversations keep any history at
// all. Without it the workspace snapshot eats the budget and the chat silently
// stops being a conversation while every size assertion still passes — which is
// exactly what the first version of this fix did.
// Threshold is 2, not 1, and that matters: continuity needs the previous
// EXCHANGE (a question and its answer), not one stray line. Dropping the floor
// back to a token reserve still squeezes in a single turn, so a `>= 1` check
// passes while the chat has effectively lost its memory — verified by actually
// reverting the floor and watching this assertion catch it.
const MIN_TURNS = 2;
for (const [label, len] of [['verbose', 1200], ['huge', 9000]]) {
  const hist = Array.from({length: 9}, (_, i) => turn(i % 2 ? 'assistant' : 'user', len));
  const kept = (buildSys(hist).match(/(^|\n)(USER|ASSISTANT): /g) || []).length;
  const ok = kept >= MIN_TURNS;
  if (!ok) fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} conversation retains an exchange — ${kept} turn(s) kept (min ${MIN_TURNS})`);
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

console.log(fail ? `\n${fail} FAILURE(S) in prompt budgeting` : '\nAll prompt-budget cases stay within the server limits.');
// NB: no early exit here — the central-guard section below must still run.

// ── Central ai.assist guard ────────────────────────────────────────────────
// Every caller funnels through _trpc, so the limit is enforced there once.
// ~30 call sites build prompts from live workspace data; clamping each is a
// thing to forget, and the next new caller would reintroduce the bug.
const src2 = readFileSync(P, 'utf8');
const ga = src2.indexOf('const _AI_LIMITS=');
const gb = src2.indexOf('async function _trpc(', ga);
if (ga < 0 || gb < 0) { console.error('\nFAIL  ai.assist guard block not found in app-part2.js'); process.exit(1); }
const guard = new Function(src2.slice(ga, gb) + '\nreturn {_AI_LIMITS,_aiGuardInput};')();

let gfail = 0;
const gcheck = (ok, label, detail) => {
  if (!ok) gfail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`);
};
console.log('\ncentral guard (every ai.assist caller passes through _trpc):');

const huge = { systemPrompt: 'S'.repeat(99999), userContent: 'U'.repeat(99999), provider: 'manus' };
const g = guard._aiGuardInput('ai.assist', huge);
gcheck(g.systemPrompt.length <= 4000, 'clamps systemPrompt', `99999 -> ${g.systemPrompt.length}`);
gcheck(g.userContent.length <= 8000, 'clamps userContent', `99999 -> ${g.userContent.length}`);
gcheck(g.provider === 'manus', 'leaves other fields intact');
gcheck(huge.systemPrompt.length === 99999, 'does not mutate the caller\'s object');

const small = { systemPrompt: 'ok', userContent: 'ok' };
gcheck(guard._aiGuardInput('ai.assist', small) === small, 'passes small payloads through untouched');
gcheck(guard._aiGuardInput('appData.save', huge) === huge, 'only touches ai.assist, not other procedures');
gcheck(guard._aiGuardInput('ai.assist', undefined) === undefined, 'tolerates a missing input');

// The guard existing is not the same as the guard RUNNING. Assert it is
// actually invoked as the first thing _trpc does — otherwise every check above
// passes while the limit is enforced nowhere.
const trpcBody = src2.slice(gb, src2.indexOf('\n}', gb));
gcheck(/input\s*=\s*_aiGuardInput\(\s*procedure\s*,\s*input\s*\)/.test(trpcBody),
  '_trpc actually calls the guard', 'a guard that exists but is never invoked protects nothing');

// The shared workspace snapshot must be capped at source too — it feeds the
// chat, the Home insight card and the hero brief.
const capMatch = src2.match(/const AI_CTX_MAX=(\d+)/);
gcheck(!!capMatch, 'AI_CTX_MAX defined', capMatch ? capMatch[1] + ' chars' : '');
gcheck(/return _aiClampStr\(out,AI_CTX_MAX\);/.test(src2), '_buildAIContext() returns a clamped snapshot');

console.log(gfail ? `\n${gfail} GUARD FAILURE(S)` : '\nCentral ai.assist guard holds.');
process.exit(fail + gfail ? 1 : 0);
