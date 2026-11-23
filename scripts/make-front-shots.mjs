#!/usr/bin/env node
/**
 * Front-page screenshots (build -291).
 *
 * The public front page (server/_core/publicPages.ts) shows the product. These
 * are REAL screenshots of the built app — not mock-ups — taken in headless
 * Chrome on a made-up workspace, so nothing from anyone's real data can end up
 * on a public page:
 *   - the data below is invented (a fictional person and studio);
 *   - no server is behind /api, so nothing is read from an account;
 *   - the bundled sample data is never used (every list is seeded here).
 *
 *   pnpm build && node scripts/make-front-shots.mjs
 *
 * Writes client/public/front/<name>-<dark|light>.webp. Run it again whenever
 * the look of the app changes, then `pnpm build` so dist has the new files.
 * The files are committed: the page must not depend on a build step that
 * needs Chrome.
 */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { serveDist, openBrowser } from './lib/headless.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'public');
const OUT = join(ROOT, 'client', 'public', 'front');
const ONLY = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1].split(',') : null; })();

// ── the made-up workspace ────────────────────────────────────────────────────
// Dates are relative to the day the script runs, so the shots never look stale.
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const ME = 'Jordan Ellis';
const PROJECTS = [
  { id: 1, name: 'Website relaunch', color: '#3B82F6', status: 'Active', due: day(24), pct: 62, desc: 'New site for the spring season: structure, copy, design and launch.' },
  { id: 2, name: 'Spring campaign', color: '#8B5CF6', status: 'Active', due: day(40), pct: 35, desc: 'Email, social and partner outreach for the spring collection.' },
  { id: 3, name: 'Client onboarding', color: '#10B981', status: 'Active', due: day(12), pct: 80, desc: 'A repeatable welcome process for new clients.' },
];
const T = (id, title, o) => Object.assign({ id, title, status: 'Not Started', priority: 'Medium', energy: 'Medium', est: 30, tags: [], assignee: ME, createdBy: ME, context: '@computer', notes: '', subtasks: [], myDay: false, starred: false, createdAt: day(-6) }, o);
const TASKS = [
  T(1, 'Review homepage copy with Dana', { status: 'In Progress', priority: 'High', due: day(0), projectId: 1, project: 'Website relaunch', tags: ['copy'], myDay: true, starred: true, est: 45, subtasks: [{ id: 1, title: 'Read the draft', done: true }, { id: 2, title: 'Mark up the hero section', done: true }, { id: 3, title: 'Agree final wording', done: false }] }),
  T(2, 'Send the launch checklist to the team', { priority: 'High', due: day(0), projectId: 1, project: 'Website relaunch', tags: ['launch'], myDay: true, est: 20 }),
  T(3, 'Book photographer for product shots', { priority: 'Medium', due: day(1), projectId: 2, project: 'Spring campaign', tags: ['photos'], myDay: true, est: 15 }),
  T(4, 'Draft the welcome email sequence', { status: 'In Progress', priority: 'High', due: day(2), projectId: 3, project: 'Client onboarding', tags: ['email'], est: 90, subtasks: [{ id: 1, title: 'Day 1: welcome', done: true }, { id: 2, title: 'Day 3: how we work', done: false }, { id: 3, title: 'Day 7: first check-in', done: false }] }),
  T(5, 'Prepare numbers for the monthly review', { priority: 'Medium', due: day(3), tags: ['finance'], est: 60 }),
  T(6, 'Choose colours for the new product pages', { priority: 'Low', due: day(4), projectId: 1, project: 'Website relaunch', tags: ['design'], est: 40 }),
  T(7, 'Plan the partner announcement', { priority: 'Medium', due: day(6), projectId: 2, project: 'Spring campaign', tags: ['partners'], est: 45 }),
  T(8, 'Renew the domain and hosting', { priority: 'High', due: day(-1), tags: ['admin'], est: 10 }),
  T(9, 'Write up notes from the planning session', { priority: 'Low', due: day(5), tags: ['notes'], est: 25 }),
  T(10, 'Test the contact form on a phone', { priority: 'Medium', due: day(7), projectId: 1, project: 'Website relaunch', tags: ['testing'], est: 20 }),
  T(11, 'Set up the shared photo folder', { status: 'Done', priority: 'Low', due: day(-2), projectId: 2, project: 'Spring campaign', completedAt: day(-1) + 'T15:00:00.000Z' }),
  T(12, 'Agree the launch date', { status: 'Done', priority: 'High', due: day(-3), projectId: 1, project: 'Website relaunch', completedAt: day(-2) + 'T10:00:00.000Z' }),
];
const now = new Date().toISOString();
const N = (id, title, tags, html, o) => Object.assign({ id, title, tags, source: 'Manual', updated: 'Just now', starred: false, createdBy: ME, createdAt: now, updatedAt: now, bodyHtml: html, body: html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }, o);
const NOTES = [
  N(1, 'Launch plan', ['launch', 'website'], '<h2>Launch plan</h2><p>The new site goes live at the start of the season. Three things have to be true first:</p><ul><li><b>Copy</b> signed off for the homepage and the five product pages</li><li><b>Photos</b> delivered and cropped</li><li><b>Checkout</b> tested on a phone and a laptop</li></ul><h3>Who does what</h3><table class="lu-table"><tbody><tr><th>Area</th><th>Owner</th><th>Due</th></tr><tr><td>Homepage copy</td><td>Dana</td><td>This week</td></tr><tr><td>Product photos</td><td>Sam</td><td>Next week</td></tr><tr><td>Testing</td><td>Jordan</td><td>Before launch</td></tr></tbody></table><h3>Open questions</h3><ul class="lu-check"><li data-checked="true">Do we keep the old blog posts?</li><li data-checked="false">Who writes the announcement email?</li><li data-checked="false">Launch on a Tuesday or a Thursday?</li></ul>', { starred: true }),
  N(2, 'Planning session notes', ['meeting'], '<p>Agreed to move the campaign start by one week so the photos are ready. Sam will confirm the photographer by Friday.</p>'),
  N(3, 'Ideas for the welcome email', ['email', 'clients'], '<p>Keep it short. One thing to do today, one thing to expect this week, and a real name to reply to.</p>'),
  N(4, 'Brand voice', ['brand'], '<p>Plain words, short sentences, no jargon. Write the way we talk to a client across the table.</p>'),
  N(5, 'Reading list', ['personal'], '<p>Three books for the quarter, one chapter a night.</p>'),
  N(6, 'Supplier contacts', ['admin'], '<p>Printer, photographer, packaging. Renewal dates are in the calendar.</p>'),
];
const GOALS = [
  { id: 1, icon: '🚀', title: 'Launch the new website', target: 'Live before the spring season', pct: 62, category: 'Work', startDate: day(-40), dueDate: day(24), linkedTaskIds: [1, 2, 6, 10], milestones: [{ id: 1, title: 'Structure agreed', done: true, due: day(-20) }, { id: 2, title: 'Copy signed off', done: false, due: day(4) }, { id: 3, title: 'Go live', done: false, due: day(24) }], createdBy: ME },
  { id: 2, icon: '📈', title: 'Ten new clients this quarter', target: '10 signed clients', pct: 40, category: 'Work', startDate: day(-30), dueDate: day(60), linkedTaskIds: [4], milestones: [], createdBy: ME },
  { id: 3, icon: '🏃', title: 'Run a 10k', target: 'Finish under an hour', pct: 55, category: 'Health', startDate: day(-50), dueDate: day(45), linkedTaskIds: [], milestones: [], createdBy: ME },
];
const HABITS = [
  { id: 1, icon: '🧘', title: 'Morning stretch', cadence: 'Daily', streak: 12, doneToday: true, startTime: '07:00', category: 'Health', createdBy: ME },
  { id: 2, icon: '📖', title: 'Read 20 pages', cadence: 'Daily', streak: 8, doneToday: false, startTime: '21:00', category: 'Learning', createdBy: ME },
  { id: 3, icon: '🚶', title: 'Walk at lunch', cadence: 'Weekdays', streak: 5, doneToday: true, startTime: '12:30', category: 'Health', createdBy: ME },
];
const EV = (id, title, d, hour, endHour, color, location) => { const h = (n) => { const w = Math.floor(n), m = Math.round((n - w) * 60); return ((w + 11) % 12 + 1) + ':' + String(m).padStart(2, '0') + (w < 12 ? ' AM' : ' PM'); }; return { id, title, time: h(hour), end: h(endHour), day: d, hour, endHour, color, desc: '', attendees: [ME], location }; };
const EVENTS = [
  EV(1, 'Team check-in', 0, 9, 9.5, 'var(--ac)', 'Video call'), EV(2, 'Team check-in', 2, 9, 9.5, 'var(--ac)', 'Video call'), EV(3, 'Team check-in', 4, 9, 9.5, 'var(--ac)', 'Video call'),
  EV(4, 'Focus: homepage copy', 0, 10, 12, 'var(--ok)', ''), EV(5, 'Focus: welcome emails', 2, 10, 12, 'var(--ok)', ''),
  EV(6, 'Client call', 1, 11, 12, 'var(--red)', 'Video call'), EV(7, 'Photographer visit', 3, 13, 15, 'var(--warn)', 'Studio'),
  EV(8, 'Design review', 1, 14, 15, 'var(--purp)', 'Meeting room'), EV(9, 'Monthly review', 3, 10, 11, 'var(--warn)', 'Meeting room'),
  EV(10, 'Planning for next week', 4, 15, 16, 'var(--purp)', ''),
];
const CONTACTS = [
  { id: 1, name: 'Dana Kim', title: 'Copywriter', company: 'Freelance', email: 'dana@example.com', phone: '', location: '', tags: ['team'], notes: '' },
  { id: 2, name: 'Sam Rivera', title: 'Photographer', company: 'Rivera Studio', email: 'sam@example.com', phone: '', location: '', tags: ['supplier'], notes: '' },
];
const SEED = {
  lu_tasks: TASKS, lu_notes: NOTES, lu_projects: PROJECTS, lu_goals: GOALS, lu_habits: HABITS, lu_calGrid: EVENTS, lu_contacts: CONTACTS,
  lu_journal: [], lu_ideas: [], lu_clusters: [], lu_programs: [], lu_opportunities: [], lu_teams: [], lu_bookmarks: [],
  lu_creds: { userName: ME, email: 'jordan@example.com', role: 'Member', color: 'var(--ac)' },
  lu_examples_seeded_v1: '1', lu_tour_v1_offered: '1', lu_tour_v1_done: '1', lu_splash_shown_v1: '1',
};
const seedScript = (dark) => `(function(){try{
  localStorage.clear();
  var S=${JSON.stringify(SEED)};
  for(var k in S)localStorage.setItem(k,typeof S[k]==='string'?S[k]:JSON.stringify(S[k]));
  localStorage.setItem('lu_prefs',JSON.stringify({darkMode:${dark},compact:false,accent:'#3B82F6',workspace:{onboarded:true}}));
}catch(e){}})();`;

// ── the shots ────────────────────────────────────────────────────────────────
// `prep` runs in the page after nav(route); it may return a promise.
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1.5, mobile: false };
const PHONE = { width: 390, height: 780, deviceScaleFactor: 2, mobile: true };
// With no server the AI "daily focus" request fails and the card says so. Nothing is
// invented in its place: the card is shown as it looks before the first request.
const NO_AI_ERROR = `(function(){try{window._refreshDailyFocusAI=function(){return Promise.resolve();};if(D.prefs&&D.prefs.dailyFocusAI){delete D.prefs.dailyFocusAI.error;delete D.prefs.dailyFocusAI.pending;}if(typeof renderHome==='function')renderHome();}catch(e){return String(e)}})()`;
const SHOTS = [
  { name: 'today', route: 'home', vp: DESKTOP, prep: NO_AI_ERROR },
  { name: 'tasks', route: 'tasks', vp: DESKTOP, prep: `(function(){try{if(typeof setTaskView==='function')setTaskView('list');}catch(e){return String(e)}})()` },
  // Open the note and bring its text into view (its properties sit between the title and the
  // text). Only the note's own scrolling pane moves; scrollIntoView would shift the whole app.
  { name: 'notes', route: 'notes', vp: DESKTOP, prep: `(function(){try{if(typeof showNoteInEditor==='function')showNoteInEditor(1);setTimeout(function(){var b=document.getElementById('nie-body');if(!b)return;var p=b.parentElement;while(p&&p!==document.body&&!(p.scrollHeight>p.clientHeight+20&&/(auto|scroll)/.test(getComputedStyle(p).overflowY)))p=p.parentElement;if(p&&p!==document.body)p.scrollTop+=b.getBoundingClientRect().top-p.getBoundingClientRect().top-70;},350);}catch(e){return String(e)}})()` },
  { name: 'calendar', route: 'calendar', vp: DESKTOP },
  { name: 'phone', route: 'home', vp: PHONE, prep: NO_AI_ERROR },
];
// The page as an ordinary customer's workspace sees it: no Atlas, and none of the
// original workspace's own names. (auth.me is what sets this in the real app.)
const CUSTOMER = `(function(){try{
  _wsMe={id:5,name:${JSON.stringify(ME)},email:'jordan@example.com',role:'admin',isOwner:true,isOperator:false,workspace:{id:2,name:'Harbor Studio',features:{atlas:false,cfLabels:false}},workspaces:[],billing:null};
  window._luMe=_wsMe;window._luWs=_wsMe.workspace;
  document.body.setAttribute('data-ws-role','owner');document.body.setAttribute('data-operator','0');
  document.body.setAttribute('data-ws-atlas','0');document.body.setAttribute('data-ws-cf','0');
  try{_wsCSS();}catch(e){} try{_wsNeutralWording();}catch(e){}
  return true;}catch(e){return String(e)}})()`;
// Things that only exist because there is no server behind the page.
const TIDY = `(function(){
  document.querySelectorAll('#login-overlay,#splash-screen').forEach(function(e){e.style.display='none'});
  document.querySelectorAll('.toast-stack,.toast,#token-expiry-banner,#lu-offline-banner,.ai-bubble').forEach(function(e){e.style.display='none'});
  var st=document.createElement('style');st.textContent='*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}.toast-stack{display:none!important}';document.head.appendChild(st);
  return true;})()`;

mkdirSync(OUT, { recursive: true });
let srv = null, br = null;
try {
  srv = await serveDist(DIST);
  br = await openBrowser();
  const { send, evaluate, loadApp } = br;
  for (const dark of [true, false]) {
    const theme = dark ? 'dark' : 'light';
    const { identifier } = await send('Page.addScriptToEvaluateOnNewDocument', { source: seedScript(dark) });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    for (const shot of SHOTS) {
      if (ONLY && !ONLY.includes(shot.name)) continue;
      await send('Emulation.setDeviceMetricsOverride', { width: shot.vp.width, height: shot.vp.height, deviceScaleFactor: shot.vp.deviceScaleFactor, mobile: shot.vp.mobile });
      await send('Emulation.setTouchEmulationEnabled', { enabled: shot.vp.mobile });
      await loadApp(srv.origin + '/');
      await new Promise(r => setTimeout(r, 1200));
      await evaluate(TIDY);
      const cust = await evaluate(CUSTOMER);
      if (cust !== true) console.log(`  note (${shot.name}): customer view not applied: ${cust}`);
      await evaluate(`(function(){try{if(typeof applyPrefs==='function')applyPrefs();}catch(e){};try{if(typeof updateProfileUI==='function')updateProfileUI();}catch(e){};nav(${JSON.stringify(shot.route)});return true;})()`);
      await new Promise(r => setTimeout(r, 900));
      if (shot.prep) { const r = await evaluate(shot.prep); if (r) console.log(`  note (${shot.name}): ${r}`); await new Promise(r2 => setTimeout(r2, 700)); }
      await evaluate(TIDY);
      await new Promise(r => setTimeout(r, 3200)); // colour changes crawl down the tree in a hidden page (see -272)
      const { data } = await send('Page.captureScreenshot', { format: 'webp', quality: 80 });
      const file = join(OUT, `${shot.name}-${theme}.webp`);
      writeFileSync(file, Buffer.from(data, 'base64'));
      console.log(`  ${shot.name}-${theme}.webp  ${Math.round(statSync(file).size / 1024)} KB  (${Math.round(shot.vp.width * shot.vp.deviceScaleFactor)}×${Math.round(shot.vp.height * shot.vp.deviceScaleFactor)})`);
    }
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
  }
} finally {
  try { await br?.close(); } catch {}
  try { srv?.close?.(); } catch {}
}
