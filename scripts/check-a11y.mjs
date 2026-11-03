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
 * --serious.
 *
 * COLOUR CONTRAST FAILS THE BUILD (-272), in dark AND light mode. axe leaves text on
 * a gradient or under an overlay undecided, so those are judged here against the
 * WORST colour stop behind them. That is how the Home banner's white text on bright
 * stops was found. Emoji have no contrast rule; a disabled control is exempt.
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
const MODES = args.includes('--dark-only') ? ['dark'] : ['dark', 'light'];
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
  const res=await axe.run(root,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']},resultTypes:['violations','incomplete'],elementRef:true});
  const out=res.violations.map(v=>({id:v.id,impact:v.impact,help:v.help,n:v.nodes.length,
    targets:v.nodes.slice(0,(window.__a11yAll?40:3)).map(n=>String(n.target&&n.target[0]||'').slice(0,90)+(v.id==='color-contrast'&&n.any[0]&&n.any[0].data?' ['+n.any[0].data.fgColor+' on '+n.any[0].data.bgColor+' = '+n.any[0].data.contrastRatio+']':''))}));
  // Undecided by axe (gradient, overlay): judge against the worst colour behind the text.
  const parse=s=>{let m=/rgba?\(([^)]+)\)/.exec(s);if(m){const p=m[1].split(/[ ,\/]+/).map(Number);return [p[0],p[1],p[2],p[3]==null?1:p[3]];}
    m=/color\(srgb ([^)]+)\)/.exec(s);if(m){const p=m[1].split(/[ \/]+/).map(Number);return [p[0]*255,p[1]*255,p[2]*255,p[3]==null?1:p[3]];}return null;};
  const over=(f,b)=>[f[0]*f[3]+b[0]*(1-f[3]),f[1]*f[3]+b[1]*(1-f[3]),f[2]*f[3]+b[2]*(1-f[3]),1];
  const lum=c=>{const v=c.slice(0,3).map(x=>{x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4);});return .2126*v[0]+.7152*v[1]+.0722*v[2];};
  const con=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const stops=s=>(s.match(/rgba?\([^)]+\)|color\(srgb [^)]+\)/g)||[]).map(parse).filter(Boolean);
  const grounds=el=>{const chain=[];for(let e=el;e;e=e.parentElement)chain.push(e);chain.reverse();let g=[[255,255,255,1]];
    for(const e of chain){const c=getComputedStyle(e),bg=parse(c.backgroundColor);if(bg&&bg[3]>0)g=g.map(x=>over(bg,x));
      if(c.backgroundImage&&c.backgroundImage!=='none'){const st=stops(c.backgroundImage);if(st.length){const n=[];for(const x of g)for(const s of st)n.push(over(s,x));g=n.slice(0,64);}}}
    return g;};
  const undecided=(res.incomplete.find(v=>v.id==='color-contrast')||{nodes:[]}).nodes,low=[];
  for(const n of undecided){
    const key=n.any[0]&&n.any[0].data&&n.any[0].data.messageKey,el=n.element;
    if(key==='nonBmp'||!el||el.disabled||el.closest('[disabled],[aria-disabled="true"]'))continue;
    const cs=getComputedStyle(el),fg=parse(cs.color);
    // background-clip:text paints the text itself; there is no colour to compare here
    if(!fg||fg[3]===0||cs.cursor==='not-allowed')continue;
    let op=1;for(let e=el;e;e=e.parentElement)op*=parseFloat(getComputedStyle(e).opacity)||1;
    const fs=parseFloat(cs.fontSize),big=fs>=24||(fs>=18.66&&Number(cs.fontWeight)>=700);
    let worst=99;for(const g of grounds(el))worst=Math.min(worst,con(over([fg[0],fg[1],fg[2],fg[3]*op],g),g));
    if(worst<(big?3:4.5))low.push(String(n.target[0]).slice(0,70)+' «'+(el.textContent||'').trim().slice(0,24)+'» worst '+worst.toFixed(2));
  }
  if(low.length)out.push({id:'color-contrast-gradient',impact:'serious',help:'Text on a gradient or overlay below WCAG AA at its worst colour stop',n:low.length,targets:low.slice(0,(window.__a11yAll?40:4))});

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
  for (const mode of MODES) for (const width of WIDTHS) {
    const mobile = width < 768;
    await send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 812 : 900, deviceScaleFactor: 1, mobile });
    await loadApp(srv.origin + '/');
    await new Promise(r => setTimeout(r, 1500));
    await evaluate(`document.querySelectorAll('#login-overlay').forEach(e=>e.style.display='none');D.prefs.darkMode=${mode === 'light' ? 'false' : 'true'};applyPrefs();applyTheme();try{renderScreen(curScreen);}catch(e){};true`);
    // Colours fade when the mode changes; measuring mid-fade reports false failures.
    await new Promise(r => setTimeout(r, 3000));
    await evaluate(AXE + ';window.__a11yAll=' + (process.env.A11Y_ALL ? 'true' : 'false') + ';true');
    const routes = (await evaluate('Object.keys(SM)')).filter(r => !SKIP.has(r)).concat(['drawer:task', 'form:task', 'modal:capture']);
    console.log(`\n── ${mode} · ${width}px · ${routes.length} screens ──`);
    let clean = 0;
    for (const route of routes) {
      const r = await evaluate(`(${SCAN})(${JSON.stringify(route)})`);
      await evaluate('try{closeModal();closeDrawer();if(typeof closeFA==="function")closeFA();}catch(e){};true');
      if (r.error) { failed++; console.log(`  FAIL  ${route}: ${r.error}`); continue; }
      const crit = r.violations.filter(v => v.impact === 'critical');
      const ser = r.violations.filter(v => v.impact === 'serious');
      for (const v of r.violations) tally[`${v.impact} ${v.id}`] = (tally[`${v.impact} ${v.id}`] || 0) + v.n;
      const isContrast = v => v.id === 'color-contrast' || v.id === 'color-contrast-gradient';
      const gate = ser.filter(v => FAIL_SERIOUS || isContrast(v));
      const bad = crit.length + gate.length;
      if (!bad) { clean++; if (ser.length) console.log(`  ok    ${route}  (serious: ${ser.map(v => `${v.id}×${v.n}`).join(', ')})`); continue; }
      failed++;
      console.log(`  FAIL  ${route}`);
      for (const v of [...crit, ...gate]) console.log(`        ${v.impact} ${v.id} ×${v.n} — ${v.help}\n          ${v.targets.join('  |  ')}`);
    }
    console.log(`  ${clean}/${routes.length} screens with no ${FAIL_SERIOUS ? 'critical or serious' : 'critical or contrast'} violations`);
  }
} catch (e) {
  failed++;
  console.log('a11y scan aborted: ' + e.message);
} finally {
  if (br) await br.close();
  if (srv) srv.close();
}
const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 15);
if (top.length) { console.log('\nAll findings (impact rule × elements, every screen and width):'); top.forEach(([k, n]) => console.log(`  ${k} ×${n}`)); }
if (failed) { console.log(`\n${failed} screen scan(s) failed.`); process.exitCode = 1; }
else console.log(`\nNo ${FAIL_SERIOUS ? 'critical or serious' : 'critical or contrast'} accessibility violations.`);
