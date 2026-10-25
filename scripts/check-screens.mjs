#!/usr/bin/env node
/**
 * Screen sweep guard — every screen, at phone and desktop widths.
 *
 * WHY THIS EXISTS
 * The Oct 2026 audit swept every screen by hand and found buttons whose
 * handler did not exist or could not run (a JSON-quoted title ending the
 * onclick attribute, unquoted string ids read as variable names), and pages
 * that ran off the right edge of a phone. None of it showed at desktop width,
 * and none of it threw until someone tapped. This turns that sweep into a
 * check that runs in about a minute with no dependencies beyond a local
 * Chrome or Edge.
 *
 *   pnpm build && pnpm check:screens            # all widths
 *   node scripts/check-screens.mjs --width 375  # one width
 *   CHROME_PATH=/path/to/chrome pnpm check:screens
 *
 * It serves dist/public (the VITE-BUILT page, which is what prod serves),
 * opens it in headless Chrome with no server behind /api — so the app runs on
 * its built-in sample data — and for every route in SM, at 375, 390 and
 * 1440px, it reports:
 *   - missing handlers: an on* attribute that does not parse, or that calls
 *     or names something that is not defined;
 *   - clipped pages: the page scrolls sideways, or an element on the screen
 *     runs past the right edge with no scrolling container to reach it;
 *   - uncaught errors raised while the screen rendered.
 * Exits non-zero if any are found.
 */
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist, openBrowser } from './lib/headless.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'public');
const argW = process.argv.indexOf('--width');
const WIDTHS = argW > 0 ? [Number(process.argv[argW + 1])] : [375, 390, 1440];
const SKIP = new Set(['capture']); // opens a modal over Home, not a screen

// Runs in the page before any app script: collect uncaught errors per route.
const ERROR_HOOK = `
  window.__swErrs=[];window.__swRoute='boot';
  addEventListener('error',e=>window.__swErrs.push({route:window.__swRoute,m:String(e.message||e.error)}));
  addEventListener('unhandledrejection',e=>{const r=e.reason;const m=String(r&&r.message||r);
    if(!/fetch|network|503|offline|Failed to|JSON|Unexpected token|not valid JSON|HTTP/i.test(m))window.__swErrs.push({route:window.__swRoute,m:'(promise) '+m});});
`;

// Runs in the page: sweep one route, return findings.
const SWEEP = String.raw`async (route)=>{
  window.__swRoute=route;
  const e0=window.__swErrs.length;
  try{nav(route);}catch(e){window.__swErrs.push({route,m:'nav threw: '+e.message});}
  await new Promise(r=>setTimeout(r,500));
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  const W=innerWidth;
  const sc=document.getElementById(SM[route]);
  const root=sc&&sc.offsetParent!==null?sc:null;
  const out={route,missing:[],clipped:[],errors:window.__swErrs.slice(e0).map(x=>x.m)};
  if(!root){out.missing.push('screen '+SM[route]+' is not visible after nav');return out;}
  const desc=el=>{const t=(el.getAttribute('aria-label')||el.title||el.textContent||'').trim().replace(/\s+/g,' ').slice(0,40);return el.tagName.toLowerCase()+(el.id?'#'+el.id:'')+(t?' "'+t+'"':'');};
  // ── clipping ──
  const docOver=document.documentElement.scrollWidth-W;
  if(docOver>1)out.clipped.push('page scrolls sideways by '+docOver+'px');
  // The top bar sits outside the screen; it overflowed on phones for months.
  const tb=document.querySelector('.topbar');
  if(tb){
    const tbOver=tb.scrollWidth-tb.clientWidth;
    const lastR=Math.max(0,...[...tb.querySelectorAll('button,.av,a,input')].filter(e=>e.offsetParent!==null&&!e.closest('[data-pop-menu]')).map(e=>e.getBoundingClientRect().right));
    if(tbOver>1||lastR>W+1)out.clipped.push('top bar needs '+Math.round(Math.max(tb.scrollWidth,lastR))+'px of '+W);
  }
  const scrollable=new WeakMap();
  const inScroller=el=>{for(let p=el.parentElement;p&&p!==document.body;p=p.parentElement){
    if(scrollable.has(p)){if(scrollable.get(p))return true;continue;}
    const s=getComputedStyle(p);const ok=/(auto|scroll|hidden|clip)/.test(s.overflowX)||s.position==='fixed';
    scrollable.set(p,ok);if(ok)return true;}return false;};
  let n=0;
  for(const el of root.querySelectorAll('*')){
    if(el.offsetParent===null&&getComputedStyle(el).position!=='fixed')continue;
    const b=el.getBoundingClientRect();
    if(b.width<4||b.height<2||b.right<=W+2)continue;
    if(inScroller(el))continue;
    // report the outermost offender only
    const par=el.parentElement;const pb=par&&par.getBoundingClientRect();
    if(pb&&pb.right>W+2&&root.contains(par)&&!inScroller(par))continue;
    if(n++<3)out.clipped.push(desc(el)+' ends at '+Math.round(b.right)+'px');
  }
  if(n>3)out.clipped.push('…and '+(n-3)+' more');
  // ── handlers ──
  const KW=new Set('if else for while do return function typeof instanceof new switch case default break continue try catch finally throw void delete in of var let const async await yield this event true false null undefined NaN Infinity arguments'.split(' '));
  const typeOf=nm=>{try{return (0,eval)('typeof '+nm);}catch(e){return 'undefined';}};
  const seen=new Set();
  for(const el of root.querySelectorAll('*')){
    for(const a of el.getAttributeNames()){
      if(!/^on[a-z]+$/.test(a))continue;
      const v=el.getAttribute(a);if(!v||seen.has(v))continue;seen.add(v);
      try{new Function('event',v);}catch(e){out.missing.push(a+' does not parse ('+e.message+') on '+desc(el)+': '+v.slice(0,90));continue;}
      // names the handler itself declares
      const code=v.replace(/\/(?![*\/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\\n\[])+\/[gimsuy]*/g,'0')
        .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,'0').replace(/\x60(?:\\.|[^\x60\\])*\x60/g,'0');
      const own=new Set();
      for(const m of code.matchAll(/\b(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g))own.add(m[1]);
      for(const m of code.matchAll(/\b(?:catch|function\s*[\w$]*)\s*\(([^)]*)\)/g))m[1].split(',').forEach(p=>own.add(p.trim().replace(/=.*/,'')));
      for(const m of code.matchAll(/\(([^()]*)\)\s*=>/g))m[1].split(',').forEach(p=>own.add(p.trim().replace(/=.*/,'')));
      for(const m of code.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g))own.add(m[1]);
      for(const m of code.matchAll(/(?:const|let|var)\s*[{\[]([^}\]]*)[}\]]/g))m[1].split(',').forEach(p=>own.add(p.trim().split(':').pop().trim()));
      for(const m of code.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)(?=\s*([^\w$\s]|$))/g)){
        const nm=m[2];const next=m[3];
        if(KW.has(nm)||own.has(nm))continue;
        if(next===':'&&!/\?[^:]*$/.test(code.slice(0,m.index+m[0].length)))continue; // object key
        if(typeOf(nm)==='undefined')out.missing.push(a+' names undefined "'+nm+'" on '+desc(el)+': '+v.slice(0,90));
      }
    }
  }
  return out;
}`;

let failed = 0, totalScreens = 0;
const summary = [];
let srv = null, br = null;
try {
  srv = await serveDist(DIST);
  br = await openBrowser();
  const { send, evaluate, loadApp } = br;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: ERROR_HOOK });
  for (const width of WIDTHS) {
    const mobile = width < 768;
    await send('Emulation.setDeviceMetricsOverride', { width, height: mobile ? 812 : 900, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await loadApp(srv.origin + '/');
    await new Promise(r => setTimeout(r, 1500));
    const build = await evaluate(`(document.documentElement.outerHTML.match(/APP_BUILD\\s*=\\s*'([^']+)'/)||[])[1]||'?'`);
    // Signed-out sample-data session: put the login screen away.
    await evaluate(`document.querySelectorAll('#login-overlay').forEach(e=>e.style.display='none');true`);
    const routes = (await evaluate(`Object.keys(SM)`)).filter(r => !SKIP.has(r));
    const bootErrs = await evaluate(`window.__swErrs.map(x=>x.m)`);
    console.log(`\n── ${width}px · ${routes.length} screens · build ${build} ──`);
    if (bootErrs.length) { failed++; console.log(`  FAIL  boot: ${bootErrs.slice(0, 3).join(' | ')}`); }
    let wFail = 0;
    for (const route of routes) {
      totalScreens++;
      const r = await evaluate(`(${SWEEP})(${JSON.stringify(route)})`);
      // close anything the screen opened over itself before the next one
      await evaluate(`try{closeModal();closeDrawer();}catch(e){};true`);
      const bad = r.missing.length + r.clipped.length + r.errors.length;
      if (!bad) continue;
      wFail++; failed++;
      console.log(`  FAIL  ${route}`);
      for (const m of r.missing.slice(0, 6)) console.log(`        handler  ${m}`);
      if (r.missing.length > 6) console.log(`        handler  …and ${r.missing.length - 6} more`);
      for (const c of r.clipped) console.log(`        clipped  ${c}`);
      for (const e of r.errors.slice(0, 3)) console.log(`        error    ${e}`);
    }
    summary.push(`${width}px: ${routes.length - wFail}/${routes.length} screens clean`);
    if (!wFail) console.log(`  all ${routes.length} screens clean`);
  }
} catch (e) {
  failed++;
  console.log('Sweep aborted: ' + e.message);
} finally {
  if (br) br.close();
  if (srv) srv.close();
}
console.log('\n' + summary.join(' · '));
if (failed) { console.log(`\n${failed} screen(s) with missing handlers, clipping or errors.`); process.exitCode = 1; }
else console.log(`\nAll ${totalScreens} screen checks clean.`);
