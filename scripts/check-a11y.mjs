#!/usr/bin/env node
/**
 * Accessibility guard — axe-core on every screen of the built app.
 *
 * WHY THIS EXISTS
 * The Oct 2026 audit found core controls (task checkboxes, status and
 * priority pills, cards, cluster headers, Money rows) that a keyboard could
 * not reach, inputs with no label, and a quick-add box that captured Tab.
 * Phase 5 fixed them; this keeps them fixed. It is the Phase 5 gate: no
 * CRITICAL axe violation on any of the screens.
 *
 *   pnpm build && pnpm check:a11y            # all screens, 1440 + 390
 *   node scripts/check-a11y.mjs --serious    # also fail on "serious"
 *   node scripts/check-a11y.mjs --width 390  # one width
 *
 * Runs the built dist/public in headless Chrome (no server behind /api; the
 * sample data), injects node_modules/axe-core, and scans the active screen
 * for WCAG 2.1 A/AA rules. "serious" findings are listed but only fail with
 * --serious (colour contrast lives there and is tracked separately by the
 * theme guards).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist, openBrowser } from './lib/headless.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const FAIL_SERIOUS = args.includes('--serious');
const argW = args.indexOf('--width');
const WIDTHS = argW >= 0 ? [Number(args[argW + 1])] : [1440, 390];
const SKIP = new Set(['capture']);
const AXE = readFileSync(join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

// `route` is a screen id, or an overlay: 'drawer:task', 'form:task', 'modal:capture'.
const SCAN = String.raw`async (route)=>{
  let root=null;
  if(route.startsWith('drawer:')){nav('tasks');await new Promise(r=>setTimeout(r,300));const t=(D.tasks||[]).find(x=>!x.parentTaskId);if(t)openDrawer('task',t);await new Promise(r=>setTimeout(r,400));root=document.querySelector('#drawer-ov .drawer')||document.getElementById('drawer-ov');}
  else if(route.startsWith('form:')){openFA('task');await new Promise(r=>setTimeout(r,400));root=document.getElementById('fa-modal-ov');}
  else if(route.startsWith('modal:')){openModal('capture');await new Promise(r=>setTimeout(r,300));root=document.getElementById('modal-capture');}
  else{try{nav(route);}catch(e){}await new Promise(r=>setTimeout(r,500));root=document.getElementById(SM[route]);}
  if(!root||root.offsetParent===null&&getComputedStyle(root).position!=='fixed')return {route,error:'not visible'};
  const res=await axe.run(root,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations']});
  const out=res.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,
    targets:v.nodes.slice(0,(window.__a11yAll?40:3)).map(n=>String(n.target&&n.target[0]||'').slice(0,90))}));
  // Our own rule (axe has none): a visible element with an onclick handler
  // that a keyboard cannot reach — not natively focusable and no tabindex.
  const NATIVE=/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY|OPTION|LABEL|DETAILS|IFRAME|VIDEO|AUDIO)$/;
  const unreachable=[...root.querySelectorAll('[onclick]')].filter(el=>{
    if(NATIVE.test(el.tagName)||el.hasAttribute('tabindex')||el.isContentEditable)return false;
    const oc=el.getAttribute('onclick')||'';
    if(/^\s*(event\.stopPropagation\(\);?\s*)?$/.test(oc)||/event\.target\s*===?\s*this/.test(oc))return false;
    const b=el.getBoundingClientRect();return b.width>0&&b.height>0;});
  if(unreachable.length)out.push({id:'keyboard-unreachable',impact:'critical',help:'Clickable element cannot be reached with the keyboard (no tabindex, not a native control)',n:unreachable.length,
    targets:unreachable.slice(0,3).map(el=>el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+'['+String(el.getAttribute('onclick')).slice(0,50)+']')});
  return {route,violations:out};
}`;

let failed = 0;
const tally = {};
let srv = null, br = null;
try {
  srv = await serveDist(join(ROOT, 'dist', 'public'));
  br = await openBrowser();
  const { send, evaluate, loadApp } = br;
  for (const width of WIDTHS) {
    const mobile = width < 768;
    await send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 812 : 900, deviceScaleFactor: 1, mobile });
    await loadApp(srv.origin + '/');
    await new Promise(r => setTimeout(r, 1500));
    await evaluate(`document.querySelectorAll('#login-overlay').forEach(e=>e.style.display='none');true`);
    await evaluate(AXE + ';window.__a11yAll=' + (process.env.A11Y_ALL ? 'true' : 'false') + ';true');
    const routes = (await evaluate('Object.keys(SM)')).filter(r => !SKIP.has(r)).concat(['drawer:task', 'form:task', 'modal:capture']);
    console.log(`\n── ${width}px · ${routes.length} screens ──`);
    let clean = 0;
    for (const route of routes) {
      const r = await evaluate(`(${SCAN})(${JSON.stringify(route)})`);
      await evaluate('try{closeModal();closeDrawer();if(typeof closeFA==="function")closeFA();}catch(e){};true');
      if (r.error) { failed++; console.log(`  FAIL  ${route}: ${r.error}`); continue; }
      const crit = r.violations.filter(v => v.impact === 'critical');
      const ser = r.violations.filter(v => v.impact === 'serious');
      for (const v of r.violations) tally[`${v.impact} ${v.id}`] = (tally[`${v.impact} ${v.id}`] || 0) + v.n;
      const bad = crit.length + (FAIL_SERIOUS ? ser.length : 0);
      if (!bad) { clean++; if (ser.length) console.log(`  ok    ${route}  (serious: ${ser.map(v => `${v.id}×${v.n}`).join(', ')})`); continue; }
      failed++;
      console.log(`  FAIL  ${route}`);
      for (const v of [...crit, ...(FAIL_SERIOUS ? ser : [])]) console.log(`        ${v.impact} ${v.id} ×${v.n} — ${v.help}\n          ${v.targets.join('  |  ')}`);
    }
    console.log(`  ${clean}/${routes.length} screens with no ${FAIL_SERIOUS ? 'critical or serious' : 'critical'} violations`);
  }
} catch (e) {
  failed++;
  console.log('a11y scan aborted: ' + e.message);
} finally {
  if (br) br.close();
  if (srv) srv.close();
}
const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 15);
if (top.length) { console.log('\nAll findings (impact rule × elements, every screen and width):'); top.forEach(([k, n]) => console.log(`  ${k} ×${n}`)); }
if (failed) { console.log(`\n${failed} screen scan(s) failed.`); process.exitCode = 1; }
else console.log(`\nNo ${FAIL_SERIOUS ? 'critical or serious' : 'critical'} accessibility violations.`);
