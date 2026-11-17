// Guard: the assistant on every page (build -284).
//
// The owner asked for two things: the assistant can be KEPT OPEN as a pane on
// the right of the screen (docked), and it can help on every page, Settings
// included. This runs the BUILT app in headless Chrome and checks, for every
// route in SM and every Settings section:
//   - the topbar button opens the panel, on screen, with a focusable input;
//   - the suggestions belong to that page (or that Settings section);
//   - the model is told where the person is (status line);
// and, docked: the page gives up the pane's width (nothing hidden under it),
// the pane stays open across pages and through Escape, dialogs sit beside it,
// it is remembered after a reload, and phones keep the full-screen popup.
//
// Build -285 adds: docking needs a 1200px window (the page keeps 860px, the
// width every screen's layout fits) — all pages checked at that width with
// nothing under the pane; the WINDOW resized while docked (wide → narrower →
// too narrow → phone width → wide again); iPads (touch).
//
//   pnpm build && node scripts/check-assistant.mjs
//
// Needs a local Chrome/Edge (CHROME_PATH to override), like check:screens.
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist, openBrowser } from './lib/headless.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const ok = (cond, label, detail) => {
  if (cond) console.log('PASS  ' + label);
  else { failures++; console.log('FAIL  ' + label + (detail ? '\n        ' + String(detail).slice(0, 900) : '')); }
};
const J = (v) => JSON.stringify(v);

let srv = null, br = null;
try {
  srv = await serveDist(join(ROOT, 'dist', 'public'));
  br = await openBrowser();
  const { send, evaluate, loadApp } = br;
  try { await send('Emulation.setFocusEmulationEnabled', { enabled: true }); } catch {}
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await loadApp(srv.origin + '/');
  // A headless background tab never finishes CSS transitions (the panel's slide-in, the page's
  // margin), so measurements would read the start of the animation. Real browsers animate normally.
  const noMotion = `(()=>{if(!document.getElementById('chk-no-motion')){const s=document.createElement('style');s.id='chk-no-motion';s.textContent='*,*::before,*::after{transition:none!important;animation:none!important}';document.head.appendChild(s);}return true;})()`;
  await evaluate(noMotion);
  await evaluate(`(()=>{document.querySelectorAll('#login-overlay').forEach(e=>e.style.display='none');try{localStorage.removeItem('lu_ai_panel_dock');localStorage.removeItem('lu_ai_panel_open');localStorage.removeItem('lu_ai_panel_full');}catch(_){}return true;})()`);

  // ── every page, floating ──
  const pages = await evaluate(`JSON.stringify(Object.keys(SM))`).then(JSON.parse);
  const rows = await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const p=document.getElementById('ai-panel');
    const out=[];
    for(const k of ${J(pages)}){
      try{nav(k);}catch(e){out.push({k,err:String(e&&e.message||e)});continue;}
      await wait(120);
      const btn=document.getElementById('topbar-ask-btn');
      const bb=btn?btn.getBoundingClientRect():null;
      const btnOk=!!bb&&bb.width>0&&bb.height>0&&bb.right<=innerWidth&&getComputedStyle(btn).visibility!=='hidden'&&getComputedStyle(btn).display!=='none';
      if(p.classList.contains('show'))toggleAIPanel();
      btn&&btn.click();
      await wait(330);
      const r=p.getBoundingClientRect();
      const inp=document.getElementById('ai-input');
      const sugg=Array.from(document.querySelectorAll('#ai-suggestions button')).map(b=>b.textContent);
      out.push({k,cur:curScreen,btnOk,open:p.classList.contains('show'),onScreen:r.left>=0&&r.right<=innerWidth+1&&r.width>300,
        focus:document.activeElement===inp,sugg,line:(typeof _agentStatusLine==='function'?_agentStatusLine():'').split(' · tasks')[0]});
      toggleAIPanel();await wait(40);
    }
    return JSON.stringify(out);
  })()`).then(JSON.parse);
  const homeSugg = J((rows.find((r) => r.k === 'home') || {}).sugg || []);
  const bad = rows.filter((r) => r.err || !r.btnOk || !r.open || !r.onScreen || !r.focus || (r.sugg || []).length < 3);
  ok(rows.length === pages.length && !bad.length, `Assistant: opens from the topbar on all ${pages.length} pages, on screen, input focused, with suggestions`, J(bad));
  // pages that share Home's look ('capture' renders Home) may share its suggestions; every other page has its own
  const generic = rows.filter((r) => !['home', 'capture'].includes(r.k) && J(r.sugg) === homeSugg).map((r) => r.k + '→' + r.cur);
  ok(!generic.length, 'Assistant: every page has suggestions of its own (none falls back to Home\'s)', J(generic));
  const where = rows.filter((r) => !/ · on the [a-z]+ page/.test(r.line || '')).map((r) => r.k);
  ok(!where.length, 'Assistant: the model is told which page the person is on, on every page', J(where));

  // ── Settings: every section ──
  const sets = await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    nav('settings');await wait(150);
    toggleAIPanel();await wait(300);
    const tabs=Array.from(document.querySelectorAll('#s-settings .si[onclick*="showSetTab"]'));
    const out=[];
    for(const t of tabs){
      t.click();await wait(150);
      out.push({tab:t.textContent.trim(),sugg:Array.from(document.querySelectorAll('#ai-suggestions button')).map(b=>b.textContent),
        line:_agentStatusLine().split(' · tasks')[0],open:document.getElementById('ai-panel').classList.contains('show')});
    }
    // the open_settings action: by name and by an everyday word
    const tool=n=>LU_AGENT_TOOLS.find(x=>x.name===n);
    const shown=()=>{const v=Array.from(document.querySelectorAll('#s-settings .sp')).find(x=>x.style.display!=='none');return v?v.id:'';};
    const a1=tool('open_settings').run({section:'ai'});await wait(80);const s1=shown();
    const a2=tool('open_settings').run({section:'theme'});await wait(80);const s2=shown();
    const a3=tool('open_settings').run({section:'digest'});await wait(80);const s3=shown();
    const a4=tool('open_settings').run({section:'nonsense'});
    const a5=tool('open_settings').run({section:'plan'});
    toggleAIPanel();
    return JSON.stringify({out,a1,s1,a2,s2,a3,s3,a4,a5,kind:tool('open_settings').kind});
  })()`).then(JSON.parse);
  const noOwn = sets.out.filter((s) => !s.open || s.sugg.length < 3 || J(s.sugg) === homeSugg || !s.line.includes('(Settings → ' + s.tab.replace(/\s+/g, ' ') + ')'));
  ok(sets.out.length >= 14 && !noOwn.length, `Settings: on each of its ${sets.out.length} sections the assistant stays open, offers that section's suggestions and is told which section is open`, J(noOwn));
  const secSugg = new Set(sets.out.map((s) => J(s.sugg)));
  ok(secSugg.size === sets.out.length, 'Settings: the suggestions change with the section', J([...secSugg].slice(0, 4)));
  ok(sets.kind === 'nav' && sets.a1.ok && sets.s1 === 'sp-6' && sets.a2.ok && sets.s2 === 'sp-2' && sets.a3.ok && sets.s3 === 'sp-3', 'Settings: the assistant can open the right section by name or everyday word (ai, theme, digest), without asking first', J([sets.a1, sets.s1, sets.a2, sets.s2, sets.a3, sets.s3]));
  ok(!sets.a4.ok && /Sections:/.test(sets.a4.error) && !sets.a5.ok && /not billed/.test(sets.a5.error), 'Settings: an unknown section, or the plan of a workspace that is not billed, is refused with a reason', J([sets.a4, sets.a5]));

  // ── the Workspace settings dialog ──
  const ws = await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    window._trpcReal=window._trpc;
    window._trpc=async function(path){if(path==='auth.me')return {id:1,name:'T',role:'admin',isOwner:true,workspace:{id:1,name:'Test',role:'owner',features:{}},workspaces:[],billing:null};
      if(path==='workspace.current')return {id:1,name:'Test',slug:'t',role:'owner',members:1,features:{}};if(path==='workspace.storageGet')return {current:'platform',stores:[],platformBackend:'drive',filesElsewhere:0,move:null};return null;};
    _wsMe=await _trpc('auth.me');window._luMe=_wsMe;
    await wsOpenSettings('general');await wait(200);
    toggleAIPanel();await wait(320);
    const p=document.getElementById('ai-panel'),m=document.getElementById('ws-modal');
    const zP=+getComputedStyle(p).zIndex,zM=+getComputedStyle(m).zIndex;
    const g=Array.from(document.querySelectorAll('#ai-suggestions button')).map(b=>b.textContent);
    await wsOpenSettings('storage');await wait(250);
    document.body.click();await wait(150);
    const s=Array.from(document.querySelectorAll('#ai-suggestions button')).map(b=>b.textContent);
    const line=_agentStatusLine().split(' · tasks')[0];
    const inp=document.getElementById('ai-input');inp.focus();
    const usable=document.activeElement===inp&&document.elementFromPoint(p.getBoundingClientRect().left+60,p.getBoundingClientRect().bottom-40)!==null&&p.contains(document.elementFromPoint(p.getBoundingClientRect().left+60,p.getBoundingClientRect().bottom-40));
    toggleAIPanel();wsCloseModal();window._trpc=window._trpcReal;
    return JSON.stringify({zP,zM,g,s,line,usable});
  })()`).then(JSON.parse);
  ok(ws.zP > ws.zM && ws.usable, 'Workspace settings dialog: the assistant opens above it and can be typed into', J(ws));
  ok(/Rename this workspace/.test(J(ws.g)) && /S3 bucket/.test(J(ws.s)) && /Workspace settings → File storage/.test(ws.line), 'Workspace settings dialog: the suggestions and the status line follow its tab', J(ws));

  // ── docked ──
  const dock = await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const p=document.getElementById('ai-panel'),app=document.querySelector('.app');
    nav('tasks');await wait(150);
    const before=app.getBoundingClientRect().right;
    toggleAIPanel();await wait(320);
    const btn=document.getElementById('ai-dock-btn');
    const btnShown=!!btn&&btn.offsetParent!==null;
    btn.click();await wait(200);
    const r=p.getBoundingClientRect(),a=app.getBoundingClientRect();
    const res={btnShown,pressed:btn.getAttribute('aria-pressed'),docked:document.body.classList.contains('ai-dock-on'),before,appRight:a.right,panelLeft:r.left,panelW:r.width,
      overlay:getComputedStyle(document.getElementById('ai-panel-overlay')).display,role:p.getAttribute('role'),page:document.documentElement.scrollWidth-innerWidth};
    // nothing of the page sits under the pane
    // (overlays are fixed to the screen and have their own rule: they are checked below)
    const inFixed=e=>{for(let n=e;n&&n!==document.body;n=n.parentElement)if(getComputedStyle(n).position==='fixed')return true;return false;};
    res.hidden=Array.from(document.querySelectorAll('.app *')).filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&b.left>=r.left+2&&e.offsetParent!==null&&!inFixed(e);}).slice(0,5).map(e=>e.tagName+'.'+String(e.className).slice(0,30));
    // across pages it stays open; the suggestions follow
    const seen=[];
    for(const k of ['notes','calendar','money','settings','reports']){nav(k);await wait(200);seen.push({k,open:p.classList.contains('show'),docked:document.body.classList.contains('ai-dock-on'),first:Array.from(document.querySelectorAll('#ai-suggestions button')).map(b=>b.textContent).join('|')});}
    res.seen=seen;
    // Escape (both handlers: with and without shortcuts) does not close it
    document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(80);
    res.afterEsc=p.classList.contains('show');
    // a dialog and the drawer sit beside the pane
    openModal('<div style="padding:20px">x</div>');await wait(250);
    const mo=document.querySelector('.modal-ov.show');res.modalRight=mo?mo.getBoundingClientRect().right:null;
    closeModal();await wait(150);
    const t=(D.tasks||[])[0];if(t){nav('tasks');await wait(150);openDrawer('task',t);await wait(400);const dr=document.querySelector('.drawer-overlay');res.drawerRight=dr?dr.getBoundingClientRect().right:null;closeDrawer();await wait(250);}
    // drag the edge: the page follows the new width
    p.style.width='520px';_aiDockApply();await wait(60);
    res.after520={appRight:app.getBoundingClientRect().right,panelLeft:p.getBoundingClientRect().left};
    res.stored=[localStorage.getItem('lu_ai_panel_dock'),localStorage.getItem('lu_ai_panel_open')];
    res.innerW=innerWidth;
    return JSON.stringify(res);
  })()`).then(JSON.parse);
  ok(dock.btnShown && dock.pressed === 'true' && dock.docked && dock.overlay === 'none' && dock.role === 'complementary', 'Docked: the header button docks the assistant (no dimming over the page; it is a side pane, not a dialog)', J(dock));
  ok(Math.abs(dock.appRight - dock.panelLeft) <= 1 && dock.before > dock.appRight + 300 && dock.page <= 0 && !dock.hidden.length, 'Docked: the page makes room — it ends where the pane starts, nothing is hidden under it, no sideways scroll', J({ appRight: dock.appRight, panelLeft: dock.panelLeft, before: dock.before, hidden: dock.hidden, page: dock.page }));
  ok(dock.seen.every((s) => s.open && s.docked) && new Set(dock.seen.map((s) => s.first)).size === dock.seen.length, 'Docked: it stays open while moving between pages, and its suggestions follow the page', J(dock.seen));
  ok(dock.afterEsc === true, 'Docked: Escape does not close it');
  ok(dock.modalRight != null && Math.abs(dock.modalRight - dock.panelLeft) <= 1 && (dock.drawerRight == null || Math.abs(dock.drawerRight - dock.panelLeft) <= 1), 'Docked: dialogs and the drawer open beside the pane, not under it', J({ modal: dock.modalRight, drawer: dock.drawerRight, pane: dock.panelLeft }));
  ok(Math.abs(dock.after520.appRight - dock.after520.panelLeft) <= 1 && Math.abs(dock.after520.panelLeft - (dock.innerW - 520)) <= 1, 'Docked: a wider pane takes more room from the page', J(dock.after520));
  ok(dock.stored[0] === '1' && dock.stored[1] === '1', 'Docked: remembered on this device (docked, and open)', J(dock.stored));

  // a reload brings the docked pane back, once signed in
  await evaluate(`location.reload();true`);
  await new Promise((r) => setTimeout(r, 600));
  await loadApp(srv.origin + '/');
  await evaluate(noMotion);
  const back = await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    await wait(1600);
    const before=document.getElementById('ai-panel').classList.contains('show');
    document.querySelectorAll('#login-overlay').forEach(e=>e.style.display='none');
    for(let i=0;i<30&&!document.getElementById('ai-panel').classList.contains('show');i++)await wait(200);
    return JSON.stringify({whileSignedOut:before,open:document.getElementById('ai-panel').classList.contains('show'),docked:document.body.classList.contains('ai-dock-on')});
  })()`).then(JSON.parse);
  ok(!back.whileSignedOut && back.open && back.docked, 'Docked: after a reload it comes back once the app is signed in (not over the sign-in page)', J(back));

  // closing and undocking
  const close = await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const app=document.querySelector('.app');
    toggleAIPanel();await wait(250);
    const closed={docked:document.body.classList.contains('ai-dock-on'),appRight:app.getBoundingClientRect().right,open:localStorage.getItem('lu_ai_panel_open')};
    toggleAIPanel();await wait(320);
    document.getElementById('ai-dock-btn').click();await wait(150);
    const undocked={docked:document.body.classList.contains('ai-dock-on'),overlay:document.getElementById('ai-panel-overlay').classList.contains('show'),appRight:app.getBoundingClientRect().right,pref:localStorage.getItem('lu_ai_panel_dock')};
    document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await wait(80);
    const esc={open:document.getElementById('ai-panel').classList.contains('show'),overlay:document.getElementById('ai-panel-overlay').classList.contains('show')};
    return JSON.stringify({closed,undocked,esc,w:innerWidth});
  })()`).then(JSON.parse);
  ok(!close.closed.docked && close.closed.appRight >= close.w - 1 && close.closed.open === null, 'Docked: ✕ closes the pane and the page takes the full width again', J(close.closed));
  ok(!close.undocked.docked && close.undocked.overlay && close.undocked.appRight >= close.w - 1 && close.undocked.pref === null, 'Undock: it floats over the page again', J(close.undocked));
  ok(!close.esc.open && !close.esc.overlay, 'Floating: Escape closes it, and its dimming goes with it', J(close.esc));

  // ── (-285) docking needs room: the page keeps 860px (every screen's desktop layout fits), so a window
  // narrower than 1200px gets the floating assistant. Measured the way a person sees it: content clipped by
  // its own scroll box, or hidden, is not "under" the pane.
  const view = async (width, height, mobile = false) => { await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile }); await new Promise((r) => setTimeout(r, 350)); };
  const measure = `(()=>{const p=document.getElementById('ai-panel'),app=document.querySelector('.app'),r=p.getBoundingClientRect(),a=app.getBoundingClientRect(),b=document.getElementById('ai-dock-btn');
    return JSON.stringify({w:innerWidth,open:p.classList.contains('show'),docked:document.body.classList.contains('ai-dock-on'),paneL:Math.round(r.left),paneW:Math.round(r.width),appR:Math.round(a.right),
      scroll:document.documentElement.scrollWidth-innerWidth,btn:b?getComputedStyle(b).display:'',overlay:getComputedStyle(document.getElementById('ai-panel-overlay')).display});})()`;
  const underAll = (pages) => evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));const p=document.getElementById('ai-panel');
    const inFixed=e=>{for(let n=e;n&&n!==document.body;n=n.parentElement)if(getComputedStyle(n).position==='fixed')return true;return false;};
    const visR=e=>{let r=e.getBoundingClientRect().right;for(let n=e.parentElement;n&&n!==document.body;n=n.parentElement){const cs=getComputedStyle(n);if(cs.overflowX!=='visible')r=Math.min(r,n.getBoundingClientRect().right);}return r;};
    const seen=e=>{for(let n=e;n&&n!==document.body;n=n.parentElement){const cs=getComputedStyle(n);if(cs.visibility==='hidden'||cs.opacity==='0'||cs.display==='none')return false;}return true;};
    const bad={};
    for(const k of ${J(pages)}){
      try{nav(k);}catch(_){continue;}await wait(220);
      if(!document.body.classList.contains('ai-dock-on')){bad[k]='not docked';continue;}
      const L=p.getBoundingClientRect().left;
      const u=Array.from(document.querySelectorAll('.app *')).filter(e=>{const b=e.getBoundingClientRect();return b.width>0&&b.height>0&&b.right>L+2&&visR(e)>L+2&&e.offsetParent!==null&&!inFixed(e)&&seen(e);});
      if(u.length)bad[k]=u.length+' '+u.filter(e=>!u.includes(e.parentElement)).slice(0,3).map(e=>e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0]+' r='+Math.round(e.getBoundingClientRect().right)).join(' | ');
    }
    nav('tasks');await wait(150);
    return JSON.stringify(bad);})()`).then(JSON.parse);

  // the narrowest window that docks, a pane dragged very wide: every page, nothing under the pane
  await view(1200, 900);
  await evaluate(`(async()=>{const wait=ms=>new Promise(r=>setTimeout(r,ms));localStorage.setItem('lu_ai_panel_w','1300');nav('tasks');await wait(150);
    if(!document.getElementById('ai-panel').classList.contains('show'))toggleAIPanel();await wait(320);if(!_aiDockPref())document.getElementById('ai-dock-btn').click();await wait(200);return true;})()`);
  const n1200 = JSON.parse(await evaluate(measure));
  const u1200 = await underAll(pages);
  ok(n1200.docked && n1200.paneW === 340 && Math.abs(n1200.appR - n1200.paneL) <= 1 && n1200.appR === 860, 'Docked in the narrowest window that docks (1200px): the pane is at its narrowest, the page keeps 860px', J(n1200));
  ok(!Object.keys(u1200).length, `Docked at 1200px: on all ${pages.length} pages nothing of the page is under the pane`, J(u1200));

  // the window resized while docked
  await view(1440, 900);
  const rz = [JSON.parse(await evaluate(measure))];
  const u1440 = await underAll(['notes', 'calendar', 'pipeline', 'contacts', 'pm', 'settings', 'money']);
  await view(1280, 800); rz.push(JSON.parse(await evaluate(measure)));
  await view(1100, 800); rz.push(JSON.parse(await evaluate(measure)));
  await view(800, 800); rz.push(JSON.parse(await evaluate(measure)));
  await view(1440, 900); rz.push(JSON.parse(await evaluate(measure)));
  const fits = (m) => m.open && m.docked && Math.abs(m.appR - m.paneL) <= 1 && m.appR >= 860 && m.scroll <= 0;
  ok(fits(rz[0]) && rz[0].paneW === 1440 - 860 && !Object.keys(u1440).length, 'Docked + wide window: a pane dragged very wide still leaves the page 860px, nothing under it', J({ m: rz[0], under: u1440 }));
  ok(fits(rz[1]) && rz[1].paneW === 1280 - 860, 'Docked: the window made narrower (1280) — the pane gives way, the page keeps its room', J(rz[1]));
  ok(rz[2].open && !rz[2].docked && rz[2].btn === 'none' && rz[2].appR >= 1099 && rz[2].scroll <= 0, 'Docked: a window too narrow to dock (1100) — the assistant floats over the page, which takes its whole width back', J(rz[2]));
  ok(rz[3].open && !rz[3].docked && rz[3].paneL <= 1 && rz[3].paneW >= 799 && rz[3].appR >= 799 && rz[3].btn === 'none' && rz[3].scroll <= 0, 'Docked: the window made phone-width (800) — the full-width popup', J(rz[3]));
  ok(fits(rz[4]) && rz[4].paneW === 1440 - 860, 'Docked: the window made wide again — docked again, as before', J(rz[4]));

  // ── (-285) iPads: touch; a 13" iPad Pro in landscape docks, smaller ones get the popup ──
  try { await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); } catch {}
  await evaluate(`(()=>{localStorage.removeItem('lu_ai_panel_w');return true;})()`);
  await view(1366, 1024, true);
  const padL = JSON.parse(await evaluate(`(async()=>{_aiPanelApplySize();_aiDockApply();await new Promise(r=>setTimeout(r,200));return ${measure};})()`));
  await view(1180, 820, true);
  const padM = JSON.parse(await evaluate(measure));
  await view(820, 1180, true);
  const padS = JSON.parse(await evaluate(measure));
  ok(fits(padL) && padL.btn !== 'none' && padL.paneW === 420, 'iPad Pro 13" landscape (1366, touch): the pane docks at its usual width beside the page', J(padL));
  ok(padM.open && !padM.docked && padM.btn === 'none' && padM.scroll <= 0, 'iPad 11" landscape (1180, touch): the floating assistant (too narrow to dock)', J(padM));
  ok(padS.open && !padS.docked && padS.paneW >= 819 && padS.scroll <= 0, 'iPad portrait (820, touch): the full-width popup', J(padS));
  try { await send('Emulation.setTouchEmulationEnabled', { enabled: false }); } catch {}
  await view(1440, 900);
  await evaluate(`(async()=>{const p=document.getElementById('ai-panel');if(p.classList.contains('show'))toggleAIPanel();localStorage.removeItem('lu_ai_panel_dock');localStorage.removeItem('lu_ai_panel_open');localStorage.removeItem('lu_ai_panel_w');_aiPanelApplySize();_aiDockApply();return true;})()`);

  // phones: the full-screen popup, even when docked on this device
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await new Promise((r) => setTimeout(r, 300));
  const phone = await evaluate(`(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    localStorage.setItem('lu_ai_panel_dock','1');
    nav('settings');await wait(200);
    toggleAIPanel();await wait(350);
    const p=document.getElementById('ai-panel'),r=p.getBoundingClientRect();
    const b=document.getElementById('ai-dock-btn');
    const res={docked:document.body.classList.contains('ai-dock-on'),left:r.left,width:r.width,btn:b?getComputedStyle(b).display:'',w:innerWidth,
      sugg:Array.from(document.querySelectorAll('#ai-suggestions button')).length};
    toggleAIPanel();localStorage.removeItem('lu_ai_panel_dock');localStorage.removeItem('lu_ai_panel_open');
    return JSON.stringify(res);
  })()`).then(JSON.parse);
  ok(!phone.docked && phone.left <= 1 && phone.width >= phone.w - 1 && phone.btn === 'none' && phone.sugg >= 3, 'Phones: the assistant opens full screen (no docking there), Settings included', J(phone));
  await send('Emulation.clearDeviceMetricsOverride');
} catch (e) {
  failures++; console.log('FAIL  the check itself broke: ' + (e && e.stack || e));
} finally {
  if (br) await br.close();
  if (srv) srv.close();
}
if (failures) { console.log(`\n${failures} assistant problem(s).`); process.exitCode = 1; }
else console.log('\nassistant OK');
