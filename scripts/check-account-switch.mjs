// Guard: signing into a DIFFERENT account on the same browser must wipe the
// previous account's local cache before anything merges (build -199).
//
// Background: logout only removed lu_session, and loadServerData merges the
// cached D.prefs with the server row key-by-key. Seen live: after the owner
// signed out and the demo account signed in on the same browser, the owner's
// theme, AI briefings, note folders, weather ZIP and saved reports appeared in
// the demo account — and were pushed to its server row by the auto-sync.
//
// Extracts _luAccountSwitchDetected / _luWipeLocalCache / LU_CACHE_KEEP_ON_SWITCH
// out of the real bundle and runs them against a fake storage, then asserts
// doLoginSuccess and doLogout actually call them (a helper that exists but is
// never invoked protects nothing).
//
//   node scripts/check-account-switch.mjs          # working copy
//   node scripts/check-account-switch.mjs <dir>    # a dir holding app-part2.js
//   node scripts/check-account-switch.mjs https://levelupnow.tools
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = process.argv[2];
let src, where;
if (arg && /^https?:\/\//i.test(arg)) {
  where = arg.replace(/\/+$/, '');
  const r = await fetch(`${where}/js/app-part2.js`);
  if (!r.ok) throw new Error(`${r.status} fetching app-part2.js`);
  src = await r.text();
} else {
  where = arg ? path.resolve(arg) : path.join(ROOT, 'client', 'public', 'js');
  src = fs.readFileSync(path.join(where, 'app-part2.js'), 'utf8');
}

let failed = 0;
const t = (name, ok, extra) => { if (!ok) failed++; console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (extra !== undefined ? '  → ' + extra : '')); };

function grabFn(s, name) {
  const at = s.indexOf(`function ${name}(`);
  if (at < 0) throw new Error('missing fn ' + name);
  const brace = s.indexOf('{', s.indexOf(')', at));
  let d = 0;
  for (let i = brace; i < s.length; i++) { if (s[i] === '{') d++; else if (s[i] === '}' && !--d) return s.slice(at, i + 1); }
  throw new Error('unbalanced ' + name);
}
function grabConst(s, name) {
  const m = s.match(new RegExp(`const ${name}=(\\[[^\\]]*\\]);`));
  if (!m) throw new Error('missing const ' + name);
  return `const ${name}=${m[1]};`;
}
const A = new Function([
  grabConst(src, 'LU_CACHE_KEEP_ON_SWITCH'),
  grabFn(src, '_luAccountSwitchDetected'),
  grabFn(src, '_luWipeLocalCache'),
  'return {LU_CACHE_KEEP_ON_SWITCH,_luAccountSwitchDetected,_luWipeLocalCache};',
].join('\n'))();

// A tiny localStorage stand-in.
function fakeStore(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
    keys: () => [...m.keys()],
  };
}
const OWNER = { id: 1, email: 'owner@example.com', name: 'Owner' };
const DEMO = { id: 103448, email: 'demo@example.com', name: 'Jordan Ellis' };
const ownerCache = () => fakeStore({
  lu_last_uid: '1', lu_creds: JSON.stringify({ email: 'owner@example.com' }),
  lu_prefs: '{"theme":{"bg":"#F4F6FA"}}', lu_tasks: '[...]', lu_notes: '[...]', lu_calEvents: '[...]',
  lu_examples_seeded_v1: '1', lu_tour_v1_done: '1', other_key: 'untouched',
});

console.log(`source: ${where}\n`);

// ── detection ──────────────────────────────────────────────────────────────
t('same account → no switch', A._luAccountSwitchDetected(OWNER, ownerCache()) === false);
t('different uid → switch', A._luAccountSwitchDetected(DEMO, ownerCache()) === true);
t('no uid recorded, different cached email → switch', A._luAccountSwitchDetected(DEMO, fakeStore({ lu_creds: JSON.stringify({ email: 'owner@example.com' }) })) === true);
t('no uid recorded, same cached email → no switch', A._luAccountSwitchDetected(OWNER, fakeStore({ lu_creds: JSON.stringify({ email: 'OWNER@example.com ' }) })) === false);
t('empty cache (fresh device) → no switch', A._luAccountSwitchDetected(DEMO, fakeStore({})) === false);
t('corrupt lu_creds does not throw', (() => { try { return A._luAccountSwitchDetected(DEMO, fakeStore({ lu_creds: '{oops' })) === false; } catch { return false; } })());

// ── wipe ───────────────────────────────────────────────────────────────────
const s = ownerCache();
const n = A._luWipeLocalCache(s);
t('wipe removes the data keys', !s.getItem('lu_prefs') && !s.getItem('lu_tasks') && !s.getItem('lu_notes') && !s.getItem('lu_calEvents') && !s.getItem('lu_creds'), n + ' removed');
t('wipe keeps device-level flags', s.getItem('lu_examples_seeded_v1') === '1' && s.getItem('lu_tour_v1_done') === '1' && s.getItem('lu_last_uid') === '1');
t('wipe leaves non-lu_ keys alone', s.getItem('other_key') === 'untouched');
t('keep list contains no data keys', A.LU_CACHE_KEEP_ON_SWITCH.every((k) => !/prefs|tasks|notes|creds|session|finance|calEvents|journal|projects|goals|habits|contacts|ideas|mindmaps|sheets|decks|programs|opportunities|clusters|teams|sharedAI|aiTopics/.test(k)), A.LU_CACHE_KEEP_ON_SWITCH.join(','));

// ── wiring (the helper existing is not the helper running) ─────────────────
const login = grabFn(src, 'doLoginSuccess');
const logout = grabFn(src, 'doLogout');
t('doLoginSuccess checks for a switch before writing the session', login.indexOf('_luAccountSwitchDetected(') >= 0 && login.indexOf('_luAccountSwitchDetected(') < login.indexOf("localStorage.setItem('lu_session'"));
t('doLoginSuccess wipes + reloads on a switch', /_luWipeLocalCache\(\)[\s\S]*location\.reload\(\)/.test(login));
t('doLoginSuccess records lu_last_uid', login.includes("localStorage.setItem('lu_last_uid'"));
t('doLogout flushes pending sync before wiping', logout.indexOf('_flushDirtyNow') >= 0 && logout.indexOf('_flushDirtyNow') < logout.indexOf('_luWipeLocalCache'));
t('doLogout wipes the cache', logout.includes('_luWipeLocalCache()'));
t('the prefs merge is still key-by-key (the reason the wipe must run first)', src.includes('D.prefs=Object.assign({},D.prefs,sd.prefs)'));

console.log(failed ? `\n${failed} FAILED` : '\nAccount-switch guard holds.');
process.exit(failed ? 1 : 0);
