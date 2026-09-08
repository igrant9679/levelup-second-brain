// Guard: the AI surfaces must actually know how to USE LevelUp.
//
// Build -195 gave the chat and Ask LevelUp product expertise by RETRIEVING the
// relevant Help Center article on demand (ai.assist caps systemPrompt at 4000
// chars, so the manual cannot be pasted in). This asserts that the retrieval
// still picks the right article, that product questions are still recognised,
// and that the excerpt does not push the prompt over the cap.
//
// It extracts HC_ARTICLES, LU_AI_PRIMER, the retrieval helpers and
// _aiChatSystemPrompt out of the real bundle TEXT and runs them, so it cannot
// pass against a build that never shipped.
//
//   node scripts/check-ai-knowledge.mjs                  # the working copy
//   node scripts/check-ai-knowledge.mjs <dir>            # bundles in <dir>
//   node scripts/check-ai-knowledge.mjs https://levelupnow.tools   # LIVE prod
//
// No dependencies. Exits non-zero on failure.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];

async function loadBundles() {
  if (arg && /^https?:\/\//i.test(arg)) {
    const base = arg.replace(/\/+$/, '');
    const grab = async (n) => {
      const res = await fetch(`${base}/js/${n}`);
      if (!res.ok) throw new Error(`${res.status} fetching ${n} from ${base}`);
      return res.text();
    };
    return { where: base, s1: await grab('app-part1.js'), s2: await grab('app-part2.js') };
  }
  const dir = arg ? path.resolve(arg) : path.join(ROOT, 'client', 'public', 'js');
  return {
    where: dir,
    s1: fs.readFileSync(path.join(dir, 'app-part1.js'), 'utf8'),
    s2: fs.readFileSync(path.join(dir, 'app-part2.js'), 'utf8'),
  };
}

// ── extract real declarations out of the bundle text ───────────────────────
function grabArr(s, decl) {
  const i = s.indexOf(decl);
  if (i < 0) throw new Error(`missing ${decl}`);
  return s.slice(i, s.indexOf('\n];', i) + 3);
}
function grabFn(s, name) {
  const at = s.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`missing fn ${name}`);
  const brace = s.indexOf('{', s.indexOf(')', at));
  let depth = 0;
  for (let i = brace; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && !--depth) return s.slice(at, i + 1);
  }
  throw new Error(`unbalanced fn ${name}`);
}
function grabJoined(s, name) {
  const at = s.indexOf(`var ${name}=`);
  if (at < 0) throw new Error(`missing var ${name}`);
  const end = s.indexOf("].join('\\n');", at);
  return s.slice(at, end + 13);
}
function grabConst(s, name) {
  const m = s.match(new RegExp(`const ${name}=\\s*(\\d+)`));
  if (!m) throw new Error(`missing const ${name}`);
  return `const ${name}=${m[1]};`;
}

const { where, s1, s2 } = await loadBundles();
const A = new Function([
  grabArr(s1, 'var HC_ARTICLES=['),
  grabArr(s1, 'var HC_CATS=['),
  grabJoined(s1, 'LU_AI_PRIMER'),
  grabFn(s1, '_luStem'),
  grabFn(s1, '_luTokens'),
  grabFn(s1, '_luTokHit'),
  grabFn(s1, '_luKnowledgeHits'),
  grabFn(s1, '_luIsProductQuestion'),
  grabConst(s2, 'AI_SYS_MAX'),
  grabConst(s2, 'AI_TURN_MAX'),
  grabConst(s2, 'AI_HISTORY_FLOOR'),
  grabFn(s2, '_aiClampStr'),
  grabFn(s2, '_aiChatSystemPrompt'),
  // stand in for the workspace snapshot at a realistic size
  "function _buildAIContext(){return 'WORKSPACE: '+'x'.repeat(900);}",
  'return {HC_ARTICLES,HC_CATS,LU_AI_PRIMER,_luKnowledgeHits,_luIsProductQuestion,_aiChatSystemPrompt,AI_SYS_MAX};',
].join('\n'))();

let failed = 0;
const t = (name, ok, extra) => {
  if (!ok) failed++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  → ' + extra : ''));
};

console.log(`source: ${where}`);
console.log(`primer ${A.LU_AI_PRIMER.length} chars · ${A.HC_ARTICLES.length} articles · cap ${A.AI_SYS_MAX}\n`);

// ── 1. help data integrity ─────────────────────────────────────────────────
const ids = A.HC_ARTICLES.map((a) => a.id);
const slugs = A.HC_ARTICLES.map((a) => a.slug);
const catIds = new Set(A.HC_CATS.map((c) => c.id));
t('no duplicate article ids', new Set(ids).size === ids.length);
t('no duplicate slugs', new Set(slugs).size === slugs.length);
t('no orphan articles', A.HC_ARTICLES.every((a) => catIds.has(a.catId)));
t('Routines & Mastery category present', catIds.has(14));
t('routines articles present', A.HC_ARTICLES.filter((a) => a.catId === 14).length >= 9);

// ── 2. product-question detection ──────────────────────────────────────────
// 'shortcuts' is here deliberately: \bshortcut\b does NOT match the plural.
const PRODUCT = ['how do I run a weekly review?', 'what should I do daily?',
  'the app feels overwhelming', 'how do I declutter my sidebar', 'best way to capture ideas',
  'explain the GTD process', 'keyboard shortcuts?', 'any tips for getting started'];
const missed = PRODUCT.filter((q) => !A._luIsProductQuestion(q));
t('product questions detected', missed.length === 0, missed.join('; ') || `all ${PRODUCT.length}`);

// ── 3. retrieval picks a defensible article ────────────────────────────────
// Each case lists EVERY acceptable article — a keyword retriever choosing a
// different-but-correct one is not a regression.
const EXPECT = [
  ['how do I run a weekly review?', ['weekly review']],
  ['what should I do every day', ['daily routine']],          // 'display' must not match 'day'
  ['I am overwhelmed, too many pages', ['stops working', 'Hiding and showing']],
  ['what should I do monthly', ['monthly review']],
  ['where do I put a random thought', ['Where does this go']],
  ['keyboard shortcuts and quick add syntax', ['Power moves', 'Keyboard Shortcuts']],
  ['how do I get the most out of the AI', ['from the AI']],
  ['I just signed up, where do I start', ['first two weeks']],
];
let hits = 0;
for (const [q, want] of EXPECT) {
  const got = A._luKnowledgeHits(q, 900);
  const title = (got.match(/^HELP — ([^:]+):/) || [])[1] || '(none)';
  const ok = !!got && want.some((w) => title.toLowerCase().includes(w.toLowerCase()));
  if (ok) hits++;
  console.log(`  ${ok ? 'ok  ' : '??  '}${JSON.stringify(q).padEnd(46)}-> ${title}`);
}
t('retrieval finds a relevant article', hits === EXPECT.length, `${hits}/${EXPECT.length}`);

// ── 4. the excerpt must not blow the prompt budget ─────────────────────────
// The transcript grows as you chat — that is exactly how -159 shipped a 400.
const longHist = [];
for (let i = 0; i < 30; i++) {
  longHist.push({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i} ${'y'.repeat(500)}` });
}
longHist.push({ role: 'user', content: 'how do I run a weekly review and what should I do daily?' });
const p = A._aiChatSystemPrompt(longHist);
t('chat prompt within cap', p.length <= A.AI_SYS_MAX, `${p.length} / ${A.AI_SYS_MAX}`);
t('primer reaches the model', p.includes('ABOUT LEVELUP'));
t('help article injected', p.includes('RELEVANT HELP ARTICLE(S)'));
t('transcript survives the excerpt', p.includes('Previous conversation turns'));

// A pure data question must not spend budget on help text.
const p2 = A._aiChatSystemPrompt([{ role: 'user', content: 'summarise the Cedar Health opportunity' }]);
t('no help text for a data question', !p2.includes('RELEVANT HELP ARTICLE(S)'));
t('data-question prompt within cap', p2.length <= A.AI_SYS_MAX, p2.length);

// ── 5. junk input must never throw into a render path ──────────────────────
try {
  A._luKnowledgeHits('', 900);
  A._luKnowledgeHits(null, 900);
  A._luKnowledgeHits('zz ?? !!', 900);
  A._luIsProductQuestion(null);
  t('junk input safe', true);
} catch (e) {
  t('junk input safe', false, e.message);
}

console.log(failed ? `\n${failed} FAILED` : '\nAI knowledge layer holds.');
process.exit(failed ? 1 : 0);
