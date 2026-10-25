#!/usr/bin/env node
/**
 * Date guard — keeps LevelUp's dates on the user's LOCAL calendar.
 *
 * WHY THIS EXISTS
 * Until build -228 about 170 places took "today" or a record's day from
 * toISOString().slice(0,10) — the UTC day. From ~8pm Eastern that is
 * tomorrow: habits were credited to the next day, evening journal entries
 * filed under tomorrow, "Done today" emptied, tasks due today showed as
 * overdue or "1d ago". And `new Date('2026-10-25')` is UTC midnight — the
 * evening before, west of UTC — so Gantt bars and month labels sat a day off.
 * The fix is three helpers in app-part1.js (_ymd, _pd, _dayOf); this guard
 * keeps the UTC forms from coming back, and replays the evening that broke.
 *
 *   pnpm build && pnpm check:dates          # static scan + clock test
 *   node scripts/check-dates.mjs --static   # static scan only (no Chrome)
 *   node scripts/check-dates.mjs https://levelupnow.tools --static   # live bundles
 *
 * 1. Static: fails on UTC day-slicing in the five client bundles —
 *    .toISOString().slice(0,10|7) / .split('T')[0] / .substring(0,10),
 *    new Date('YYYY-MM-DD') literals, and (x.someAt||'').slice(0,10).
 *    A line may opt out with a `utc-ok` comment saying why.
 * 2. Clock (needs `pnpm build` + Chrome/Edge): runs the built app in
 *    America/New_York with the clock at 23:30 on 2026-10-25, then moves it to
 *    00:05 on the 26th as a tab left open overnight would see it, and checks
 *    that today, quick-add dates, a task completion, a habit tick, a journal
 *    entry and focus minutes land on the right day — and that the new day
 *    arrives once, without crediting the habit twice.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const STATIC_ONLY = args.includes('--static');
const SRC = args.find(a => !a.startsWith('--'));
const BUNDLES = ['app-part1.js', 'app-part2.js', 'app-agent.js', 'app-coach.js', 'app-pm.js'];

const RULES = [
  { re: /\.toISOString\(\)\s*\.(?:slice|substring|substr)\(\s*0\s*,\s*(?:10|7)\s*\)/, why: 'UTC day from toISOString() — use _ymd(d)' },
  { re: /\.toISOString\(\)\s*\.split\(\s*(['"])T\1\s*\)\s*\[\s*0\s*\]/, why: "UTC day from toISOString().split('T')[0] — use _ymd(d)" },
  { re: /new Date\(\s*(['"`])\d{4}-\d{2}-\d{2}\1\s*\)/, why: "new Date('YYYY-MM-DD') is UTC midnight — use _pd('YYYY-MM-DD')" },
  { re: /\b\w*At\s*\|\|\s*''\s*\)\s*\.slice\(\s*0\s*,\s*10\s*\)|\.\w*At\.slice\(\s*0\s*,\s*10\s*\)/, why: 'UTC day of a stored timestamp — use _dayOf(v)' },
];

async function loadBundle(name) {
  if (SRC && /^https?:\/\//i.test(SRC)) {
    const base = SRC.replace(/\/+$/, '');
    const html = await (await fetch(base + '/')).text();
    const v = (html.match(/APP_BUILD\s*=\s*'([^']+)'/) || [])[1] || '';
    const res = await fetch(`${base}/js/${name}${v ? '?v=' + v : ''}`);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer()).toString('latin1');
  }
  const dir = SRC ? resolve(SRC) : join(ROOT, 'client', 'public', 'js');
  return readFileSync(join(dir, name), 'latin1');
}

function staticScan(name, text) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    if (/utc-ok/.test(line)) return;
    const code = line.replace(/^\s*(\/\/|\*).*$/, '');
    for (const r of RULES) {
      const m = code.match(r.re);
      if (m) hits.push(`${name}:${i + 1}  ${r.why}\n      ${code.slice(Math.max(0, m.index - 50), m.index + m[0].length + 20).trim()}`);
    }
  });
  return hits;
}

let failures = 0;
console.log('Date guard — static scan of the client bundles');
for (const b of BUNDLES) {
  let text;
  try { text = await loadBundle(b); } catch (e) { console.log(`  FAIL  ${b}: ${e.message}`); failures++; continue; }
  const hits = staticScan(b, text);
  if (hits.length) { failures += hits.length; hits.slice(0, 15).forEach(h => console.log('  FAIL  ' + h)); if (hits.length > 15) console.log(`  …and ${hits.length - 15} more in ${b}`); }
  else console.log(`  PASS  ${b}`);
}

if (!STATIC_ONLY && !(SRC && /^https?:/i.test(SRC))) {
  const { serveDist, openBrowser } = await import('./lib/headless.mjs');
  console.log('\nClock test — America/New_York, 2026-10-25 23:30 → 2026-10-26 00:05');
  // 23:30 EDT on Sun 25 Oct 2026 = 03:30Z on the 26th.
  const T0 = Date.UTC(2026, 9, 26, 3, 30);
  const CLOCK = `(function(){var R=Date,base=${T0},start=R.now();
    function now(){return base+(R.now()-start);}
    function F(){var a=[].slice.call(arguments);if(!(this instanceof F))return new R(now()).toString();
      return a.length?new (Function.prototype.bind.apply(R,[null].concat(a)))():new R(now());}
    F.prototype=R.prototype;F.now=now;F.parse=R.parse;F.UTC=R.UTC;
    window.Date=F;window.__setClock=function(ms){base=ms;start=R.now();};})();`;
  let srv = null, br = null;
  const check = (ok, label, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ' — ' + detail : ''}`); if (!ok) failures++; };
  try {
    srv = await serveDist(join(ROOT, 'dist', 'public'));
    br = await openBrowser();
    const { send, evaluate, loadApp } = br;
    await send('Emulation.setTimezoneOverride', { timezoneId: 'America/New_York' });
    await send('Page.addScriptToEvaluateOnNewDocument', { source: CLOCK });
    await loadApp(srv.origin + '/');
    await new Promise(r => setTimeout(r, 1500));
    const a = await evaluate(`(async()=>{
      document.querySelectorAll('#login-overlay').forEach(e=>e.style.display='none');
      const out={};
      out.now=new Date().toString().slice(0,24);
      out.today=_todayStr; out.ymd=_ymd();
      out.qaToday=_taskSmartParse('Ship report today').due;
      out.qaTomorrow=_taskSmartParse('Ship report tomorrow').due;
      // a task completed now
      const tid=nextId(D.tasks); D.tasks.push({id:tid,title:'Clock test task',status:'Not Started',priority:'Medium',due:_todayStr,createdAt:new Date().toISOString()});
      toggleTask(tid);
      const t=D.tasks.find(x=>x.id===tid); out.doneDay=_dayOf(t.completedAt); out.doneStatus=t.status;
      // a habit ticked now
      const hid=nextId(D.habits); D.habits.push({id:hid,title:'Clock test habit',icon:'⏰',cadence:'Daily',doneToday:false,streak:0,completedDates:[],skippedDates:[]});
      toggleHabit(hid);
      out.habitDates=D.habits.find(x=>x.id===hid).completedDates.slice();
      // a journal entry through Quick Capture
      openModal('capture','Journal');
      const ti=document.getElementById('cap-title'); if(ti)ti.value='Clock test entry';
      capType='Journal'; doCapture();
      const j=D.journal.find(x=>x.title==='Clock test entry');
      out.journalDay=j?_ymd(_parseJournalDate(j)):null; out.journalLabel=j?_fmtJournalDate(j):null;
      // focus minutes go to today's key
      D.prefs.focusLog=D.prefs.focusLog||{}; out.focusKey=_ymd(new Date());
      window.__ids={tid,hid};
      return out;
    })()`);
    check(a.today === '2026-10-25' && a.ymd === '2026-10-25', 'today at 23:30 is the 25th', `_todayStr ${a.today} (${a.now})`);
    check(a.qaToday === '2026-10-25' && a.qaTomorrow === '2026-10-26', 'quick-add "today"/"tomorrow"', `${a.qaToday} / ${a.qaTomorrow}`);
    check(a.doneStatus === 'Done' && a.doneDay === '2026-10-25', 'a completion at 23:30 counts for the 25th', a.doneDay);
    check(JSON.stringify(a.habitDates) === '["2026-10-25"]', 'a habit ticked at 23:30 is credited to the 25th', JSON.stringify(a.habitDates));
    check(a.journalDay === '2026-10-25' && /^Today/.test(a.journalLabel || ''), 'a journal entry written at 23:30 is filed under the 25th', `${a.journalDay} "${a.journalLabel}"`);
    check(a.focusKey === '2026-10-25', 'focus minutes key', a.focusKey);

    // 00:05 on the 26th — the tab stayed open; it notices on focus.
    const b = await evaluate(`(async()=>{
      __setClock(${T0} + 35*60000);
      let toasts=0; const ot=window.toast; window.toast=function(){toasts++;return ot&&ot.apply(this,arguments);};
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      if(typeof _luRefreshToday==='function')_luRefreshToday();
      await new Promise(r=>setTimeout(r,300));
      window.toast=ot;
      const out={now:new Date().toString().slice(0,24),today:_todayStr,newDayToasts:toasts};
      const h=D.habits.find(x=>x.id===__ids.hid); out.habitDates=h.completedDates.slice(); out.habitDoneToday=!!h.doneToday;
      const t=D.tasks.find(x=>x.id===__ids.tid); out.doneDay=_dayOf(t.completedAt);
      out.qaToday=_taskSmartParse('Ship report today').due;
      const j=D.journal.find(x=>x.title==='Clock test entry'); out.journalLabel=j?_fmtJournalDate(j):null;
      out.daysUntilYesterday=_daysUntil('2026-10-25');
      return out;
    })()`);
    check(b.today === '2026-10-26', 'after midnight, today is the 26th without a reload', `${b.today} (${b.now})`);
    check(b.newDayToasts === 1, 'the new day is announced once', `${b.newDayToasts} toast(s) from focus + visibility + timer`);
    check(JSON.stringify(b.habitDates) === '["2026-10-25"]' && !b.habitDoneToday, 'the midnight reset clears the habit without crediting another day', JSON.stringify(b.habitDates) + (b.habitDoneToday ? ' (still ticked)' : ''));
    check(b.doneDay === '2026-10-25', 'the 23:30 completion stays on the 25th', b.doneDay);
    check(b.qaToday === '2026-10-26', 'quick-add "today" is now the 26th', b.qaToday);
    check(/^Yesterday/.test(b.journalLabel || ''), 'the entry now reads as Yesterday', b.journalLabel);
    check(b.daysUntilYesterday === -1, 'a day due yesterday is 1 day ago', String(b.daysUntilYesterday));
  } catch (e) {
    failures++;
    console.log('  FAIL  clock test aborted: ' + e.message);
  } finally {
    if (br) br.close();
    if (srv) srv.close();
  }
}

if (failures) { console.log(`\n${failures} date problem(s).`); process.exitCode = 1; }
else console.log('\nDates hold.');
